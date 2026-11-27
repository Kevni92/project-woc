import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { binary, packagePath, startServer } from './native-host';
import { packageFile, packageJson } from './package-files';

for (const mode of ['wasm', 'ws'] as const) {
  test(mode + ' renders Cove and completes a trip to its own lookout', async ({ page }) => {
    const server = mode === 'ws' ? await startServer(false, 'cove') : undefined;
    try {
      await page.goto('/?' + new URLSearchParams({ world: 'cove', transport: mode, ...(server && { ws: server.url }) }));
      await expect(page.getByRole('heading', { name: 'Cove' })).toBeVisible();
      await expect(page.getByText('Verbunden', { exact: true })).toBeVisible();
      const map = page.getByRole('region', { name: 'Stadtkarte' });
      await expect(map.getByRole('button', { name: 'Meeting Point' })).toBeVisible();
      await expect(map.getByRole('button', { name: 'Shore Lookout' })).toBeVisible();
      await expect(map.getByRole('button', { name: 'Café Tide' })).toHaveCount(0);
      await map.getByRole('button', { name: 'Ada', exact: true }).click();
      await expect(page.getByText('25 m / 30 m')).toBeVisible();
      await page.getByRole('button', { name: 'Übernehmen' }).click();
      await expect(map.getByRole('button', { name: 'Ada', exact: true })).toHaveClass(/owned/);
      await page.keyboard.press('Escape');
      await map.getByRole('button', { name: 'Shore Lookout' }).click();
      await expect(page.getByText('68 m · 2 Spielmin.')).toBeVisible();
      await page.getByRole('button', { name: 'Zu Fuß gehen' }).click();
      await expect(page.getByText('Angekommen · Shore Lookout')).toBeVisible();
    } finally {
      await server?.stop();
    }
  });
}

test('retries loading from a configured base without starting a worker on corrupt bytes', async ({ page }) => {
  const world = packageFile('cove', 'world.json');
  const corrupt = Buffer.from(world);
  corrupt[0] ^= 1;
  let corruptWorld = true;
  await page.route('**/external/cove/*.json', async route => {
    const filename = new URL(route.request().url()).pathname.split('/').at(-1)!;
    await route.fulfill({ contentType: 'application/json', body: filename === 'world.json'
      ? corruptWorld ? corrupt : world
      : packageFile('cove', filename) });
  });
  await page.goto('/?world=cove&worldBase=/external/');
  await expect(page.getByRole('alert')).toContainText('WORLD_PACKAGE_HASH_MISMATCH: world.json');
  expect(page.workers()).toHaveLength(0);
  corruptWorld = false;
  await page.getByRole('button', { name: 'Erneut laden' }).click();
  await expect(page.getByRole('heading', { name: 'Cove' })).toBeVisible();
  await expect(page.getByText('Verbunden', { exact: true })).toBeVisible();
});

test('WASM init verifies bytes independently and reconnects on a fresh worker', async ({ page }) => {
  await page.addInitScript(() => {
    const original = Worker.prototype.postMessage;
    let first = true;
    Worker.prototype.postMessage = function (this: Worker, ...args: unknown[]) {
      const start = args[0] as { type: string; world?: { world: Uint8Array } };
      if (first && start.type === 'start' && start.world) {
        first = false;
        start.world.world[0] ^= 1;
      }
      Reflect.apply(original, this, args);
    };
  });
  await page.goto('/?world=cove&view=debug');
  const panel = page.getByRole('region', { name: 'Client A' });
  await panel.getByRole('button', { name: 'Verbinden' }).click();
  await expect(panel.getByRole('alert')).toContainText('WORLD_INIT_FAILED: WORLD_PACKAGE_HASH_MISMATCH');
  await expect(panel.getByText(/session-/)).toHaveCount(0);
  await panel.getByRole('button', { name: 'Verbinden' }).click();
  await expect(panel.getByText('Verbunden · session-1')).toBeVisible();
});

test('WebSocket rejects a valid local package with the same world ID and revision but a different hash', async ({ page }) => {
  const server = await startServer(true, 'cove');
  try {
    const manifest = packageJson('cove', 'manifest.json');
    const bytes = Buffer.concat([packageFile('cove', 'world.json'), Buffer.from('\n')]);
    manifest.files.world.bytes = bytes.length;
    manifest.semanticHash = manifest.files.world.sha256 = createHash('sha256').update(bytes).digest('hex');
    await page.route('**/worlds/cove/manifest.json', route => route.fulfill({ json: manifest }));
    await page.route('**/worlds/cove/world.json', route => route.fulfill({ contentType: 'application/json', body: bytes }));
    const query = new URLSearchParams({ world: 'cove', transport: 'ws', ws: server.url });
    await page.goto('/?' + query);
    await expect(page.getByRole('heading', { name: 'Cove' })).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('INCOMPATIBLE_WORLD_PACKAGE');
    await expect(page.getByRole('button', { name: 'Ada', exact: true })).toHaveCount(0);
  } finally {
    await server.stop();
  }
});

test('native hosts reject altered files and traversal before accepting input or binding a socket', () => {
  const root = mkdtempSync(join(tmpdir(), 'woc-package-'));
  try {
    cpSync(packagePath('cove'), root, { recursive: true });
    const manifestFile = join(root, 'manifest.json');
    const worldFile = join(root, 'world.json');
    const manifest = packageJson('cove', 'manifest.json');
    const validWorld = readFileSync(worldFile);
    const reject = (executable: string, code: string) => {
      const result = spawnSync(binary(executable), ['--world', root], { encoding: 'utf8', timeout: 5000 });
      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain(code);
    };
    const corrupt = Buffer.from(validWorld);
    corrupt[0] ^= 1;
    writeFileSync(worldFile, corrupt);
    reject('woc_cli', 'WORLD_PACKAGE_HASH_MISMATCH: world.json');
    reject('woc_server', 'WORLD_PACKAGE_HASH_MISMATCH: world.json');
    writeFileSync(worldFile, validWorld);
    const outside = structuredClone(manifest);
    outside.files.world.path = '../world.json';
    writeFileSync(manifestFile, JSON.stringify(outside));
    reject('woc_server', 'WORLD_PACKAGE_SCHEMA: manifest.json');
    const wrongId = { ...manifest, worldId: 'other' };
    writeFileSync(manifestFile, JSON.stringify(wrongId));
    reject('woc_cli', 'WORLD_PACKAGE_INVALID_WORLD');
    writeFileSync(manifestFile, JSON.stringify(manifest));
    unlinkSync(join(root, 'visual.json'));
    reject('woc_server', 'WORLD_PACKAGE_FILE: visual.json');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
