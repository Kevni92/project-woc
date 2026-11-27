import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import type { Frame, Mode } from './contract-harness';
import { compareTranscript, nativeTranscript, startHarness } from './contract-runner';
import { binary, startServer } from './native-host';

const externalBase = '/osm-test-worlds/';
const repo = fileURLToPath(new URL('../../', import.meta.url));
const root = process.env.WOC_OSM_WORLDS && resolve(repo, process.env.WOC_OSM_WORLDS);
const packageDir = (slug: string) => resolve(root || repo, slug);
const viewport = { width: 1440, height: 960 };
test.use({ viewport, deviceScaleFactor: 1, reducedMotion: 'reduce' });

function readWorld(slug: string) {
  return JSON.parse(readFileSync(join(packageDir(slug), 'world.json'), 'utf8')) as {
    name: string; locations: { id: string; name: string }[];
  };
}

function routeWorld(page: Page, directory: string) {
  return page.route('**' + externalBase + '*/*.json', route => {
    const filename = new URL(route.request().url()).pathname.split('/').at(-1)!;
    return route.fulfill({ contentType: 'application/json; charset=utf-8', path: join(directory, filename) });
  });
}

const send = (type: string, requestId: string, payload = {}): Frame => ({
  op: 'send', connection: 1, message: { protocolVersion: 3, type, requestId, payload },
});

for (const slug of ['osm-fixture', 'osm-fixture-island', 'bremen-1km', 'bremen-nord-5km']) {
  for (const mode of ['wasm', 'ws'] as const) {
    test(slug + ' trip and transcript over ' + mode, async ({ page }, info) => {
      test.skip(!root || !existsSync(packageDir(slug)), 'Generate the external OSM package first');
      test.setTimeout(120_000);
      const world = readWorld(slug);
      const target = world.locations[0];
      const trip = { characterId: 'resident-ada', locationId: target.id };
      const frames: Frame[] = [
        { op: 'open', connection: 1 }, send('Hello', 'hello'),
        send('Command', 'control', { action: 'AcquireCharacter', characterId: trip.characterId }),
        send('RoutePreview', 'preview', trip),
      ];
      const routeResult = nativeTranscript(frames, slug, packageDir(slug)).at(-1)!
        .find(delivery => delivery.message.type === 'RoutePreviewResult')?.message;
      if (routeResult?.type !== 'RoutePreviewResult' || !routeResult.payload.accepted) throw new Error('Missing fixture route');
      const duration = routeResult.payload.route.durationTicks;
      frames.push(send('Command', 'move', { action: 'MoveTo', ...trip }),
        ...Array.from({ length: duration }, (): Frame => ({ op: 'tick' })),
        send('SnapshotRequest', 'arrival'), { op: 'close', connection: 1 });

      await routeWorld(page, packageDir(slug));
      const server = mode === 'ws' ? await startServer(true, slug, packageDir(slug)) : undefined;
      try {
        await startHarness(page, mode, server?.url ?? '', slug, externalBase);
        const received = await compareTranscript(page, frames, slug, server?.tick, packageDir(slug));
        const request = (id: string) => received.find(({ message }) => message.requestId === id)?.message;
        expect(request('hello')).toMatchObject({ payload: { worldId: slug, worldSchemaVersion: 3 } });
        expect(request('control')).toMatchObject({ payload: { accepted: true } });
        expect(request('move')).toMatchObject({ payload: { accepted: true } });
        expect(request('arrival')).toMatchObject({
          type: 'Snapshot', payload: { controlled: { travel: null, locationId: target.id } },
        });

        if (mode === 'wasm') {
          await page.goto('/?' + new URLSearchParams({ world: slug, worldBase: externalBase }));
          await expect(page.getByRole('heading', { name: world.name })).toBeVisible({ timeout: 45_000 });
          await expect(page.getByText('Verbunden', { exact: true })).toBeVisible({ timeout: 45_000 });
          await expect(page.getByRole('link', { name: '© OpenStreetMap contributors' }))
            .toHaveAttribute('href', 'https://www.openstreetmap.org/copyright');
          await expect(page.getByLabel('Kartendarstellung')).toHaveText('2D', { timeout: 45_000 });
          await page.screenshot({ path: info.outputPath('overview.png') });
          await page.getByRole('button', { name: 'Startbereich fokussieren' }).click();
          await page.getByRole('application').press('e');
          await expect(page.getByLabel('Kartendarstellung')).toHaveText('3D');
          await page.screenshot({ path: info.outputPath('detail.png') });
          await page.getByRole('button', { name: 'Charaktere', exact: true }).click();
          await page.getByRole('region', { name: 'Charaktere' }).getByRole('button', { name: /Ada/ }).click();
          await page.getByRole('button', { name: 'Übernehmen' }).click();
          await expect(page.getByRole('button', { name: 'Freigeben' })).toBeVisible();
          await page.keyboard.press('Escape');
          await page.getByRole('button', { name: 'Orte', exact: true }).click();
          await page.getByRole('region', { name: 'Orte' }).getByRole('button', { name: new RegExp(target.name) }).click();
          await expect(page.getByRole('button', { name: 'Zu Fuß gehen' })).toBeEnabled();
        }
      } finally {
        await server?.stop();
      }
    });
  }
}

test('OSM versions, hash, size caps and handshake fail before accepting a different world', async ({ page }) => {
  const slug = 'osm-fixture';
  test.skip(!root || !existsSync(packageDir(slug)), 'Generate the external OSM package first');
  const dir = mkdtempSync(join(tmpdir(), 'woc-osm-negative-'));
  const manifestPath = join(dir, 'manifest.json');
  const worldPath = join(dir, 'world.json');
  const verifyRejected = async (diagnostic: string, part: string) => {
    const native = spawnSync(binary('woc_cli'), ['--world', dir], { encoding: 'utf8', timeout: 10_000 });
    expect(native.status).toBe(1);
    expect(native.stderr).toContain(diagnostic);
    await page.goto('/?' + new URLSearchParams({ world: slug, worldBase: externalBase }));
    await expect(page.getByRole('alert')).toContainText(part);
    expect(page.workers()).toHaveLength(0);
  };
  try {
    cpSync(packageDir(slug), dir, { recursive: true });
    await routeWorld(page, dir);
    const savedManifest = readFileSync(manifestPath);
    const savedWorld = readFileSync(worldPath);
    const manifest = JSON.parse(savedManifest.toString());
    writeFileSync(manifestPath, JSON.stringify({ ...manifest, worldSchemaVersion: 4 }));
    await verifyRejected('WORLD_PACKAGE_SCHEMA', 'WORLD_PACKAGE_SCHEMA');
    manifest.files.visual.schemaVersion = 1;
    writeFileSync(manifestPath, JSON.stringify(manifest));
    await verifyRejected('incompatible file version', 'incompatible file version');
    writeFileSync(manifestPath, savedManifest);
    const corrupt = Buffer.from(savedWorld);
    corrupt[0] ^= 1;
    writeFileSync(worldPath, corrupt);
    await verifyRejected('WORLD_PACKAGE_HASH_MISMATCH', 'WORLD_PACKAGE_HASH_MISMATCH');
    writeFileSync(worldPath, Buffer.alloc(8 * 1024 * 1024 + 1));
    await verifyRejected('WORLD_PACKAGE_SIZE_LIMIT', 'WORLD_PACKAGE_SIZE_LIMIT');

    const changed = Buffer.concat([savedWorld, Buffer.from('\n')]);
    manifest.files.visual.schemaVersion = 2;
    manifest.files.world.bytes = changed.length;
    manifest.files.world.sha256 = manifest.semanticHash = createHash('sha256').update(changed).digest('hex');
    writeFileSync(manifestPath, JSON.stringify(manifest));
    writeFileSync(worldPath, changed);
    const server = await startServer(true, slug, packageDir(slug));
    try {
      await page.goto('/?' + new URLSearchParams({ world: slug, worldBase: externalBase, transport: 'ws', ws: server.url }));
      await expect(page.getByRole('alert')).toContainText('INCOMPATIBLE_WORLD_PACKAGE');
    } finally {
      await server.stop();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test.describe('OSM real-world measurements', () => {
  for (const slug of ['bremen-1km', 'bremen-nord-5km']) {
    test(slug, async ({ page, browser }, info) => {
      test.skip(!root || !existsSync(packageDir(slug)), 'Generate the real OSM package first');
      test.setTimeout(120_000);
      const world = readWorld(slug);
      await page.addInitScript(() => {
        let gl: WebGL2RenderingContext | undefined;
        let frames = 0;
        let firstFrame = 0;
        const nativeRaf = window.requestAnimationFrame.bind(window);
        let currentFrame = -1;
        let markedFrame = -2;
        window.requestAnimationFrame = callback => nativeRaf(time => {
          currentFrame = time;
          callback(time);
        });
        const mark = (context: WebGL2RenderingContext) => {
          gl = context;
          if (markedFrame === currentFrame) return;
          markedFrame = currentFrame;
          frames++;
          if (!firstFrame) firstFrame = performance.now();
        };
        const prototype = WebGL2RenderingContext.prototype;
        const elements = prototype.drawElements;
        const arrays = prototype.drawArrays;
        prototype.drawElements = function (...args) { mark(this); elements.apply(this, args); };
        prototype.drawArrays = function (...args) { mark(this); arrays.apply(this, args); };
        Object.defineProperty(window, 'osmRenderStats', { value: () => {
          const debug = gl?.getExtension('WEBGL_debug_renderer_info');
          return { frames, firstFrame, renderer: debug ? gl?.getParameter(debug.UNMASKED_RENDERER_WEBGL) : 'unknown' };
        } });
      });
      await routeWorld(page, packageDir(slug));
      await page.goto('/?' + new URLSearchParams({ world: slug, worldBase: externalBase }));
      await expect(page.getByText('Verbunden', { exact: true })).toBeVisible({ timeout: 45_000 });
      await expect(page.getByLabel('Kartendarstellung')).toHaveText('2D', { timeout: 45_000 });
      const browserLoadMs = await page.evaluate(() => performance.now());
      const renderStats = () => (window as unknown as {
        osmRenderStats(): { frames: number; firstFrame: number; renderer: string }
      }).osmRenderStats();
      const stats = await page.evaluate(renderStats);
      await page.screenshot({ path: info.outputPath('benchmark-overview.png') });
      const measure = () => page.evaluate(async () => {
        const view = document.querySelector('[role="application"]')!;
        const stats = () => (window as unknown as { osmRenderStats(): { frames: number } }).osmRenderStats();
        const before = stats().frames;
        const start = performance.now();
        await new Promise<void>(resolve => {
          const step = () => {
            if (performance.now() - start >= 3_000) return resolve();
            view.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', bubbles: true, cancelable: true }));
            requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        });
        return (stats().frames - before) * 1000 / (performance.now() - start);
      });
      const overviewFps = await measure();
      await page.getByRole('button', { name: 'Startbereich fokussieren' }).click();
      await expect(page.getByLabel('Kartendarstellung')).toHaveText('3D');
      const detailFps = await measure();
      await page.screenshot({ path: info.outputPath('benchmark-detail.png') });

      const routing = {} as Record<Mode, unknown>;
      for (const mode of ['wasm', 'ws'] as const) {
        const server = mode === 'ws' ? await startServer(true, slug, packageDir(slug)) : undefined;
        try {
          await startHarness(page, mode, server?.url ?? '', slug, externalBase);
          routing[mode] = await page.evaluate(async id => {
            const path = '/tests/contract-harness.ts';
            const harness: typeof import('./contract-harness') = await import(path);
            return harness.measurePreviews(id, 20);
          }, world.locations[0].id);
        } finally {
          await server?.stop();
        }
      }
      expect(stats.firstFrame).toBeGreaterThan(0);
      expect(overviewFps).toBeGreaterThan(0);
      expect(detailFps).toBeGreaterThan(0);
      const metrics = { slug, viewport, chromium: browser.version(), browserLoadMs, firstMapFrameMs: stats.firstFrame,
        renderer: stats.renderer, overviewFps, detailFps, routing };
      const metricsFile = info.outputPath('metrics.json');
      writeFileSync(metricsFile, JSON.stringify(metrics, null, 2) + '\n');
      await info.attach('metrics.json', { path: metricsFile, contentType: 'application/json' });
      console.log('WOC_OSM_METRICS ' + JSON.stringify(metrics));
    });
  }
});
