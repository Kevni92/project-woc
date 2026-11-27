import { execFileSync } from 'node:child_process';
import { expect, type Page } from '@playwright/test';
import type { Delivery, Frame, Mode } from './contract-harness';
import { binary, packagePath } from './native-host';

export const devUrl = 'http://127.0.0.1:4174';

export function nativeTranscript(frames: Frame[], world: string, directory = packagePath(world)): Delivery[][] {
  const input = frames.map(frame => JSON.stringify(frame)).join('\n') + '\n';
  const output = execFileSync(binary('woc_cli'), ['--world', directory], {
    input, encoding: 'utf8', timeout: 30_000, maxBuffer: 32 * 1024 * 1024,
  });
  return output.trim().split(/\r?\n/).map(line => JSON.parse(line) as Delivery[]);
}

export async function startHarness(page: Page, mode: Mode, url: string, world = 'breakwater', worldBase?: string) {
  await page.goto(devUrl + '/?view=debug');
  await page.evaluate(async ({ mode, url, world, worldBase }) => {
    const modulePath = '/tests/contract-harness.ts';
    const harness: typeof import('./contract-harness') = await import(modulePath);
    await harness.start(mode, url, world, worldBase);
  }, { mode, url, world, worldBase });
}

const byConnection = (a: Delivery, b: Delivery) =>
  a.connection - b.connection || a.message.streamSeq - b.message.streamSeq;

export async function compareTranscript(page: Page, frames: Frame[], world: string, tick?: () => void, directory?: string) {
  const expected = nativeTranscript(frames, world, directory);
  expect(expected).toHaveLength(frames.length);
  const received: Delivery[] = [];
  for (const [i, frame] of frames.entries()) {
    if (frame.op === 'tick' && tick) {
      tick();
    } else {
      await page.evaluate(async frame => {
        const modulePath = '/tests/contract-harness.ts';
        const harness: typeof import('./contract-harness') = await import(modulePath);
        await harness.apply(frame);
      }, frame);
    }
    const snapshot = async () => page.evaluate(async offset => {
      const modulePath = '/tests/contract-harness.ts';
      const harness: typeof import('./contract-harness') = await import(modulePath);
      return harness.transcript(offset);
    }, received.length);
    let batch: Delivery[] = [];
    await expect.poll(async () => {
      batch = await snapshot();
      return batch.length;
    }).toBe(expected[i].length);
    expect([...batch].sort(byConnection), JSON.stringify(frame)).toEqual([...expected[i]].sort(byConnection));
    received.push(...batch);
  }

  return received;
}
