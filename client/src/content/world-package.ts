import Ajv from 'ajv';
import packageSchema from '../../../content/world-package-v1.schema.json';
import provenanceSchema from '../../../content/world-provenance-v1.schema.json';
import { parseCity, type Bounds, type City } from '../render/city-data';
import { parseTheme, parseVisuals, type MapTheme, type MapVisuals } from '../render/visual-data';

const roles = ['world', 'visual', 'theme', 'provenance'] as const;
const manifestLimit = 65_536;

export interface WorldIdentity {
  readonly worldId: string;
  readonly worldSchemaVersion: number;
  readonly worldRevision: number;
  readonly semanticHash: string;
}

interface Manifest extends WorldIdentity {
  readonly displayName: string;
  readonly bounds: Bounds;
  readonly visualRevision: number;
  readonly modules?: readonly { role: string }[];
  readonly files: Readonly<Record<typeof roles[number], { path: string; bytes: number; sha256: string }>>;
}

export interface WorldInit {
  readonly manifest: Uint8Array<ArrayBuffer>;
  readonly world: Uint8Array<ArrayBuffer>;
}

export interface WorldPackage {
  readonly identity: WorldIdentity;
  readonly city: City;
  readonly visuals: MapVisuals;
  readonly theme: MapTheme;
  readonly init: WorldInit;
}

const ajv = new Ajv();
const matchesManifest = ajv.compile<Manifest>(packageSchema);
const matchesProvenance = ajv.compile(provenanceSchema);
const utf8 = new TextDecoder('utf-8', { fatal: true });

export function worldPackageUrl(query: URLSearchParams, appBase: URL): URL {
  const slug = query.get('world') ?? 'breakwater';
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 64) {
    throw new Error('WORLD_PACKAGE_INVALID_ID');
  }
  const base = new URL(query.get('worldBase') ?? 'worlds/', appBase);
  if (!['http:', 'https:'].includes(base.protocol) || base.search || base.hash || base.username || base.password) {
    throw new Error('WORLD_PACKAGE_INVALID_BASE');
  }
  if (!base.pathname.endsWith('/')) base.pathname += '/';
  return new URL(slug + '/', base);
}

async function readBytes(root: URL, filename: string, limit: number, fetchFile: typeof fetch, expectedSize?: number) {
  const response = await fetchFile(new URL(filename, root), {
    cache: 'no-cache', redirect: 'error', signal: AbortSignal.timeout(15000),
  });
  if (!response.ok || !response.body) throw new Error('WORLD_PACKAGE_FILE: ' + filename + ' (HTTP ' + response.status + ')');
  const bytes = new Uint8Array(limit);
  const reader = response.body.getReader();
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (size + value.length > limit) throw new Error('WORLD_PACKAGE_SIZE_LIMIT: ' + filename);
      bytes.set(value, size);
      size += value.length;
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  if (expectedSize !== undefined && size !== expectedSize) throw new Error('WORLD_PACKAGE_SIZE_MISMATCH: ' + filename);
  return bytes.subarray(0, size);
}

function decode(bytes: Uint8Array, filename: string): unknown {
  try {
    return JSON.parse(utf8.decode(bytes));
  } catch {
    throw new Error('WORLD_PACKAGE_JSON: ' + filename);
  }
}

async function sha256(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('WORLD_PACKAGE_CRYPTO_UNAVAILABLE');
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function loadWorldPackage(root: URL, fetchFile: typeof fetch = fetch): Promise<WorldPackage> {
  const manifestBytes = await readBytes(root, 'manifest.json', manifestLimit, fetchFile);
  const manifest = decode(manifestBytes, 'manifest.json');
  if (!matchesManifest(manifest)) {
    throw new Error('WORLD_PACKAGE_SCHEMA: manifest.json: ' + ajv.errorsText(matchesManifest.errors));
  }
  if (manifest.modules?.length) throw new Error('WORLD_PACKAGE_UNSUPPORTED_MODULE: ' + manifest.modules[0].role);
  if (manifest.semanticHash !== manifest.files.world.sha256) {
    throw new Error('WORLD_PACKAGE_HASH_MISMATCH: manifest semanticHash');
  }
  const { minX, minZ, maxX, maxZ } = manifest.bounds;
  if (minX >= maxX || minZ >= maxZ) throw new Error('WORLD_PACKAGE_BOUNDS: manifest.json');
  const [worldBytes, visualBytes, themeBytes, provenanceBytes] = await Promise.all(roles.map(async role => {
    const file = manifest.files[role];
    const bytes = await readBytes(root, file.path, file.bytes, fetchFile, file.bytes);
    if (await sha256(bytes) !== file.sha256) throw new Error('WORLD_PACKAGE_HASH_MISMATCH: ' + file.path);
    return bytes;
  }));
  const city = parseCity(decode(worldBytes, 'world.json'));
  if (city.id !== manifest.worldId || city.version !== manifest.worldSchemaVersion || city.name !== manifest.displayName
    || city.bounds.minX !== minX || city.bounds.minZ !== minZ || city.bounds.maxX !== maxX || city.bounds.maxZ !== maxZ) {
    throw new Error('WORLD_PACKAGE_IDENTITY_MISMATCH: world.json');
  }
  const theme = parseTheme(decode(themeBytes, 'theme.json'));
  const visuals = parseVisuals(decode(visualBytes, 'visual.json'), city, theme);
  if ((visuals.revision ?? 1) !== manifest.visualRevision) throw new Error('WORLD_PACKAGE_IDENTITY_MISMATCH: visual.json');
  if (!matchesProvenance(decode(provenanceBytes, 'provenance.json'))) {
    throw new Error('WORLD_PACKAGE_SCHEMA: provenance.json: ' + ajv.errorsText(matchesProvenance.errors));
  }
  const { worldId, worldSchemaVersion, worldRevision, semanticHash } = manifest;
  return { identity: { worldId, worldSchemaVersion, worldRevision, semanticHash }, city, visuals, theme,
    init: { manifest: manifestBytes, world: worldBytes } };
}
