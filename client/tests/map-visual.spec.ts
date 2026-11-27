import { expect, test, type Page } from '@playwright/test';
import { startServer } from './native-host';

const viewport = { width: 1440, height: 960 };
test.use({ viewport, reducedMotion: 'reduce', deviceScaleFactor: 1, hasTouch: true });

async function frameAt(page: Page, x: number, z: number, zoom: number, turns: number) {
  const keyboard = page.getByRole('application');
  await keyboard.press('Home');
  await expect(page.getByLabel('Kartendarstellung')).toHaveText('2D');
  const pixelsPerMeter = viewport.height / 1120;
  await page.mouse.move(800, 415);
  await page.mouse.down();
  await page.mouse.move(800 - (x - 40) * pixelsPerMeter, 415 - (z - 10) * pixelsPerMeter, { steps: 5 });
  await page.mouse.up();
  for (let step = 0; step < zoom; step++) await keyboard.press('+');
  for (let step = 0; step < Math.abs(turns); step++) await keyboard.press(turns < 0 ? 'q' : 'e');
  await expect(page.getByLabel('Kartendarstellung')).toHaveText('3D');
}

test('captures Breakwater at both palettes, at rotated LODs and on a touch viewport', async ({ page }, info) => {
  test.setTimeout(60_000);
  const server = await startServer(true);
  const capture = async (name: string) => {
    await page.evaluate(async () => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    });
    await page.screenshot({ path: info.outputPath(name + '.png'), animations: 'disabled' });
  };
  const map = page.getByRole('region', { name: 'Stadtkarte' });
  const mode = page.getByLabel('Kartendarstellung');
  const keyboard = page.getByRole('application');
  try {
    await page.goto('/?' + new URLSearchParams({ transport: 'ws', ws: server.url }));
    await expect(page.getByText('08:00', { exact: true })).toBeVisible();
    await expect(mode).toHaveText('2D');
    await capture('01-overview-day');

    await map.getByRole('button', { name: 'Startbereich fokussieren' }).click();
    await keyboard.press('q');
    await expect(mode).toHaveText('3D');
    await capture('02-civic-near-day');

    await frameAt(page, 255, -350, 3, 3);
    await capture('03-shore-mid-90-day');
    await frameAt(page, 524, 286, 5, -1);
    await capture('04-quay-near-day');

    await page.getByRole('button', { name: 'Trennen', exact: true }).click();
    const connect = page.getByRole('button', { name: 'Verbinden', exact: true });
    await expect(connect).toBeVisible();
    for (let minute = 0; minute < 13 * 60; minute++) server.tick();
    await connect.click();
    await expect(page.getByText('21:00', { exact: true })).toBeVisible();
    await capture('05-quay-near-night');
    await keyboard.press('Home');
    await expect(mode).toHaveText('2D');
    await capture('06-overview-night');

    await page.setViewportSize({ width: 375, height: 812 });
    await expect.poll(() => map.locator('canvas').boundingBox()).toMatchObject({ width: 375, height: 812 });
    await page.getByRole('button', { name: 'Charaktere', exact: true }).tap();
    await page.getByRole('region', { name: 'Charaktere' }).getByRole('button', { name: /Ada/ }).tap();
    await page.getByRole('button', { name: 'Übernehmen' }).tap();
    await expect(page.getByRole('button', { name: 'Freigeben' })).toBeVisible();
    await page.getByRole('button', { name: 'Orte', exact: true }).tap();
    await page.getByRole('region', { name: 'Orte' }).getByRole('button', { name: /Café Tide/ }).tap();
    await expect(page.getByRole('region', { name: 'Auswahl' }).getByRole('heading', { name: 'Café Tide' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Zu Fuß gehen' })).toBeVisible();
    await capture('07-mobile-context-night');
    await page.keyboard.press('Escape');
    await keyboard.press('Home');
    await keyboard.press('+');
    await keyboard.press('+');
    await expect(mode).toHaveText('2D');
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 155, y: 540 }, { x: 220, y: 540 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 75, y: 495 }, { x: 300, y: 582 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(mode).toHaveText('3D');
    await cdp.detach();
  } finally {
    await server.stop();
  }
});
