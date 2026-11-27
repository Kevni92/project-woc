import { createHash } from 'node:crypto';
import { expect, test } from 'vitest';
import { loadWorldPackage, worldPackageUrl } from '../src/content/world-package';
import { packageFile, packageJson } from './package-files';

const base = new URL('https://woc.example/game/');
const root = new URL('worlds/cove/', base);

function load(world = 'cove', replacements: Record<string, Buffer | null> = {}) {
  return loadWorldPackage(root, async input => {
    const file = String(input).slice(root.href.length);
    const bytes = file in replacements ? replacements[file] : packageFile(world, file);
    return bytes ? new Response(new Uint8Array(bytes)) : new Response(null, { status: 404 });
  });
}

test('resolves a default world and a configured static content base', () => {
  expect(worldPackageUrl(new URLSearchParams(), base).href).toBe('https://woc.example/game/worlds/breakwater/');
  expect(worldPackageUrl(new URLSearchParams({ world: 'cove', worldBase: '/maps' }), base).href)
    .toBe('https://woc.example/maps/cove/');
  expect(() => worldPackageUrl(new URLSearchParams({ world: '../outside' }), base)).toThrow('WORLD_PACKAGE_INVALID_ID');
  expect(() => worldPackageUrl(new URLSearchParams({ worldBase: 'file:///maps' }), base)).toThrow('WORLD_PACKAGE_INVALID_BASE');
});

test.each([['breakwater', 'p0-test-world', 6], ['cove', 'cove', 2]] as const)(
  'loads %s and retains the exact bytes used to verify its semantic hash', async (slug, id, locations) => {
    const result = await load(slug);
    expect(result.identity).toMatchObject({ worldId: id, worldSchemaVersion: 2, worldRevision: 1 });
    expect(result.city.locations).toHaveLength(locations);
    expect(result.visuals.worldId).toBe(id);
    expect(Buffer.from(result.init.world)).toEqual(packageFile(slug, 'world.json'));
    expect(result.identity.semanticHash).toBe(createHash('sha256').update(result.init.world).digest('hex'));
  },
);

test('rejects mismatched checksums, truncated files, and missing presentation data', async () => {
  const world = packageFile('cove', 'world.json');
  world[0] = 0x5b;
  await expect(load('cove', { 'world.json': world })).rejects.toThrow('WORLD_PACKAGE_HASH_MISMATCH: world.json');
  await expect(load('cove', { 'world.json': world.subarray(1) })).rejects.toThrow('WORLD_PACKAGE_SIZE_MISMATCH: world.json');
  await expect(load('cove', { 'theme.json': null })).rejects.toThrow('WORLD_PACKAGE_FILE: theme.json');
});

test('validates versions, role paths, semantic identity and reserved module declarations', async () => {
  const rejected = (change: (manifest: ReturnType<typeof packageJson>) => void) => {
    const manifest = packageJson('cove', 'manifest.json');
    change(manifest);
    return load('cove', { 'manifest.json': Buffer.from(JSON.stringify(manifest)) });
  };
  await expect(rejected(manifest => { manifest.packageVersion = 2; })).rejects.toThrow('WORLD_PACKAGE_SCHEMA');
  await expect(rejected(manifest => { manifest.files.world.path = '../world.json'; })).rejects.toThrow('WORLD_PACKAGE_SCHEMA');
  await expect(rejected(manifest => { manifest.worldId = 'other'; })).rejects.toThrow('WORLD_PACKAGE_IDENTITY_MISMATCH');
  await expect(rejected(manifest => { manifest.visualRevision = 2; })).rejects.toThrow('WORLD_PACKAGE_IDENTITY_MISMATCH');
  await expect(rejected(manifest => {
    manifest.modules = [{ role: 'characters', schemaVersion: 1, capability: 'residents',
      path: 'gameplay/characters.json', bytes: 2, sha256: '0'.repeat(64) }];
  })).rejects.toThrow('WORLD_PACKAGE_UNSUPPORTED_MODULE: characters');
});
