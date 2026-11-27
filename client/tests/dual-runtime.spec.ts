import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { Delivery, Frame, Mode } from './contract-harness';

const devUrl = 'http://127.0.0.1:4174';
const modes: Mode[] = ['wasm', 'ws'];
const frames = JSON.parse(readFileSync(
  new URL('../../protocol/fixtures/dual-runtime.json', import.meta.url), 'utf8',
)) as Frame[];

function binary(name: string): string {
  const suffix = process.platform === 'win32' ? '.exe' : '';
  return fileURLToPath(new URL('../../build/native/' + name + suffix, import.meta.url));
}

async function startServer(manual: boolean) {
  const command = manual ? ['--port', '0', '--manual-clock'] : ['--port', '0'];
  const child = spawn(binary('woc_server'), command, { stdio: ['ignore', 'pipe', 'pipe'] });
  const lines = createInterface({ input: child.stdout });
  let diagnostic = '';
  child.stderr.setEncoding('utf8').on('data', chunk => { diagnostic += chunk; });
  try {
    const [url] = await Promise.race([
      once(lines, 'line'),
      once(child, 'exit').then(([code]) => { throw new Error('Server exited (' + code + '): ' + diagnostic); }),
    ]);
    if (typeof url !== 'string' || !/^ws:\/\/127\.0\.0\.1:\d+$/.test(url)) {
      throw new Error('Unexpected server address: ' + url);
    }
    return {
      url,
      async stop() {
        if (child.exitCode === null && child.signalCode === null) {
          const exited = once(child, 'exit');
          child.kill();
          await exited;
        }
      },
    };
  } catch (error) {
    child.kill();
    throw error;
  } finally {
    lines.close();
  }
}

function nativeTranscript(): Delivery[][] {
  const input = frames.map(frame => JSON.stringify(frame)).join('\n') + '\n';
  const output = execFileSync(binary('woc_cli'), { input, encoding: 'utf8', timeout: 5000 });
  return output.trim().split(/\r?\n/).map(line => JSON.parse(line) as Delivery[]);
}

async function startHarness(page: Page, mode: Mode, url: string) {
  await page.goto(devUrl);
  await page.evaluate(async ({ mode, url }) => {
    const modulePath = '/tests/contract-harness.ts';
    const harness: typeof import('./contract-harness') = await import(modulePath);
    harness.start(mode, url);
  }, { mode, url });
}

const byConnection = (a: Delivery, b: Delivery) =>
  a.connection - b.connection || a.message.streamSeq - b.message.streamSeq;

for (const mode of modes) {
  test(mode + ' matches the native CLI contract fixture', async ({ page }) => {
    const server = mode === 'ws' ? await startServer(true) : null;
    try {
      await startHarness(page, mode, server?.url ?? '');
      const expected = nativeTranscript();
      expect(expected).toHaveLength(frames.length);
      let received: Delivery[] = [];
      let count = 0;
      for (const [i, frame] of frames.entries()) {
        await page.evaluate(async frame => {
          const modulePath = '/tests/contract-harness.ts';
          const harness: typeof import('./contract-harness') = await import(modulePath);
          await harness.apply(frame);
        }, frame);
        const snapshot = async () => page.evaluate(async () => {
          const modulePath = '/tests/contract-harness.ts';
          const harness: typeof import('./contract-harness') = await import(modulePath);
          return harness.transcript();
        });
        await expect.poll(async () => {
          received = await snapshot();
          return received.length;
        }).toBe(count + expected[i].length);
        expect(received.slice(count).sort(byConnection), JSON.stringify(frame))
          .toEqual([...expected[i]].sort(byConnection));
        count += expected[i].length;
      }

      const request = (id: string) => received.find(({ message }) => message.requestId === id)?.message;
      expect(request('incompatible')).toMatchObject({ type: 'Error', payload: { code: 'UNSUPPORTED_VERSION' } });
      for (const [id, code] of [
        ['ambient', 'NOT_ELIGIBLE'],
        ['contended', 'CHARACTER_BUSY'],
        ['unauthorized', 'NOT_CONTROLLER'],
        ['failed-switch', 'CHARACTER_BUSY'],
      ]) {
        expect(request(id)).toMatchObject({ type: 'CommandResult', payload: { accepted: false, code } });
      }
      expect(request('retained')).toMatchObject({ payload: { controlled: { id: 'resident-ben', cash: 200 } } });
      expect(request('hello-c')).toMatchObject({ payload: { sessionId: 'session-3' } });
      expect(request('hello-d')).toMatchObject({ payload: { sessionId: 'session-4' } });

      for (const [id, character, cash, x, z] of [
        ['final-b', 'resident-ada', 110, 1, 0],
        ['final-c', 'resident-ben', 210, 11, 5],
        ['final-d', 'resident-ada', 110, 1, 0],
      ] as const) {
        const message = request(id);
        expect(message).toMatchObject({
          type: 'Snapshot', worldTick: 0,
          payload: { gameMinutes: 480, controlled: { id: character, cash } },
        });
        if (message?.type !== 'Snapshot') throw new Error('Missing final snapshot');
        expect(message.payload.characters.find(row => row.id === character)?.position).toEqual({ x, z });
        expect(message.payload.characters.every(row => !Object.hasOwn(row, 'cash'))).toBe(true);
      }
    } finally {
      await server?.stop();
    }
  });

  test(mode + ' recovers a dropped delta over the real transport', async ({ page }) => {
    const server = mode === 'ws' ? await startServer(true) : null;
    try {
      await startHarness(page, mode, server?.url ?? '');
      await page.evaluate(async () => {
        const modulePath = '/tests/contract-harness.ts';
        const harness: typeof import('./contract-harness') = await import(modulePath);
        await harness.simulateGap();
      });
      await expect.poll(() => page.evaluate(async () => {
        const modulePath = '/tests/contract-harness.ts';
        const harness: typeof import('./contract-harness') = await import(modulePath);
        return harness.recovery();
      })).toMatchObject({
        snapshotRequests: 1,
        state: {
          status: 'connected', synchronizing: false,
          view: { revision: 2, controlled: { id: 'resident-ada', cash: 110 } },
        },
      });
    } finally {
      await server?.stop();
    }
  });

  test(mode + ' runs the same built debug UI with a running clock', async ({ page }) => {
    const server = mode === 'ws' ? await startServer(false) : null;
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      const query = new URLSearchParams({ transport: mode });
      if (server) query.set('ws', server.url);
      await page.goto('/?' + query);
      await expect(page.getByRole('heading', { name: 'Simulations-Debugger' })).toBeVisible();

      const left = page.getByRole('region', { name: 'Client A' });
      const right = page.getByRole('region', { name: 'Client B' });
      const adaLeft = left.getByRole('listitem').filter({ hasText: 'Ada' });
      const adaRight = right.getByRole('listitem').filter({ hasText: 'Ada' });
      const benRight = right.getByRole('listitem').filter({ hasText: 'Ben' });
      await left.getByRole('button', { name: 'Verbinden' }).click();
      await right.getByRole('button', { name: 'Verbinden' }).click();
      await expect(left.getByText('Verbunden · session-1')).toBeVisible();
      await expect(right.getByText('Verbunden · session-2')).toBeVisible();
      expect(page.workers().some(worker => worker.url().includes('wasm.worker'))).toBe(mode === 'wasm');

      await adaLeft.getByRole('button', { name: 'Übernehmen' }).click();
      await expect(adaRight.getByText('Belegt')).toBeVisible();
      await adaRight.getByRole('button', { name: 'Übernehmen' }).click();
      await expect(right.getByRole('alert')).toContainText('CHARACTER_BUSY');
      await benRight.getByRole('button', { name: 'Übernehmen' }).click();
      await expect(benRight.getByText('Bargeld · 200')).toBeVisible();
      await adaLeft.getByRole('button', { name: 'Testaktion' }).click();
      await expect(adaLeft.getByText('Bargeld · 110')).toBeVisible();
      await expect(adaRight.getByText('1 m / 0 m')).toBeVisible();
      await expect(adaRight.getByText('Bargeld')).toHaveCount(0);
      await expect(left.getByRole('listitem').filter({ hasText: 'Passant' }).getByRole('button')).toHaveCount(0);
      await expect(left.getByText(/Tag 1, 08:0[1-9]/)).toBeVisible();

      await adaLeft.getByRole('button', { name: 'Freigeben' }).click();
      await expect(adaRight.getByText('Frei')).toBeVisible();
      await adaRight.getByRole('button', { name: 'Übernehmen' }).click();
      await expect(adaRight.getByText('Bargeld · 110')).toBeVisible();
      await right.getByRole('button', { name: 'Trennen' }).click();
      await expect(adaLeft.getByText('Frei')).toBeVisible();
      await right.getByRole('button', { name: 'Verbinden' }).click();
      await expect(right.getByText('Verbunden · session-3')).toBeVisible();
      await adaRight.getByRole('button', { name: 'Übernehmen' }).click();
      await expect(adaRight.getByText('Bargeld · 110')).toBeVisible();
      await right.getByRole('button', { name: 'Snapshot anfordern' }).click();
      await expect(right.getByRole('button', { name: 'Snapshot anfordern' })).toBeEnabled();

      if (server) {
        await server.stop();
        await expect(left.getByRole('alert')).toContainText('WEBSOCKET_');
        await expect(right.getByRole('alert')).toContainText('WEBSOCKET_');
      }
      expect(errors).toEqual([]);
    } finally {
      await server?.stop();
    }
  });
}

test('wasm shows startup errors and can retry with a fresh worker', async ({ page }) => {
  const wasmAsset = '**/*.wasm';
  await page.route(wasmAsset, route => route.abort());
  await page.goto('/');
  const panel = page.getByRole('region', { name: 'Client A' });
  await panel.getByRole('button', { name: 'Verbinden' }).click();
  await expect(panel.getByRole('alert')).toContainText('WORKER_FAILED');
  await page.unroute(wasmAsset);
  await panel.getByRole('button', { name: 'Verbinden' }).click();
  await expect(panel.getByText('Verbunden · session-1')).toBeVisible();
  await expect(panel.getByRole('alert')).toHaveCount(0);
});
