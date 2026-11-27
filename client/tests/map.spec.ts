import { expect, test } from '@playwright/test';
import { startServer } from './native-host';

for (const mode of ['wasm', 'ws'] as const) {
  test(mode + ' renders and controls the same live city', async ({ page }) => {
    test.setTimeout(60_000);
    const server = mode === 'ws' ? await startServer(false) : null;
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    try {
      const query = new URLSearchParams({ transport: mode });
      if (server) query.set('ws', server.url);
      await page.goto('/?' + query);
      await expect(page.getByRole('heading', { name: 'Breakwater' })).toBeVisible();
      await expect(page.getByText('Verbunden', { exact: true })).toBeVisible();
      const map = page.getByRole('region', { name: 'Stadtkarte' });
      const modeLabel = map.getByLabel('Kartendarstellung');
      const details = page.getByRole('region', { name: 'Auswahl' });
      const canvas = map.locator('canvas');
      const ada = map.getByRole('button', { name: 'Ada', exact: true });
      const ben = map.getByRole('button', { name: 'Ben', exact: true });
      const passerby = map.getByRole('button', { name: 'Passant', exact: true });
      const places = page.getByRole('region', { name: 'Orte' });
      const routePixels = async () => page.evaluate(async base64 => {
        const blob = await (await fetch('data:image/png;base64,' + base64)).blob();
        const bitmap = await createImageBitmap(blob);
        const context = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d')!;
        context.drawImage(bitmap, 0, 0);
        const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
        let matching = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i] < 135 && data[i + 1] > 165 && data[i + 2] > 150) ++matching;
        }
        bitmap.close();
        return matching;
      }, (await canvas.screenshot()).toString('base64'));

      await expect(modeLabel).toHaveText('2D');
      const placesToggle = page.getByRole('button', { name: 'Orte', exact: true });
      await expect(placesToggle).toHaveAttribute('aria-expanded', 'false');
      await placesToggle.click();
      await expect(places.getByRole('button')).toHaveCount(6);
      await placesToggle.click();
      await expect(map.locator('.location-pin')).toHaveCount(6);
      await map.getByRole('button', { name: 'Café Tide' }).click();
      await expect(details.getByRole('heading', { name: 'Café Tide' })).toBeVisible();
      await expect(details.getByText('Altstadt', { exact: true })).toBeVisible();

      const bounds = await canvas.boundingBox();
      if (!bounds) throw new Error('Map canvas has no layout');
      // The dock-09 footprint contains x=180, z=350 in the fitted overview.
      const overview = Math.max(1250 * bounds.height / bounds.width, 1120);
      await canvas.click({ position: {
        x: bounds.width / 2 + 140 * bounds.height / overview,
        y: bounds.height / 2 + 340 * bounds.height / overview,
      } });
      await expect(details.getByRole('heading', { name: 'DOCK-09' })).toBeVisible();
      await expect(details.getByText('Werftviertel · 24 m Höhe')).toBeVisible();
      await canvas.click({ position: { x: bounds.width - 95, y: 110 } });
      await expect(details).toHaveCount(0);

      await passerby.click();
      await expect(details.getByRole('heading', { name: 'Passant' })).toBeVisible();
      await expect(details.getByRole('button', { name: 'Übernehmen' })).toHaveCount(0);
      const originalAmbientPosition = await details.locator('dd').textContent();
      const originalAmbientMarkerX = await passerby.evaluate(element => element.style.left);
      await expect(details.locator('dd')).not.toHaveText(originalAmbientPosition!);
      await expect.poll(() => passerby.evaluate(element => element.style.left)).not.toBe(originalAmbientMarkerX);
      await expect(page.getByText(/08:(?!00)\d{2}/)).toBeVisible();

      await ada.click();
      await expect(details.getByText('0 m / 0 m')).toBeVisible();
      await expect(details.getByText('Bargeld')).toHaveCount(0);
      await details.getByRole('button', { name: 'Übernehmen' }).click();
      await expect(ada).toHaveClass(/owned/);
      await expect(details.getByText('100', { exact: true })).toBeVisible();
      await page.keyboard.press('Escape');
      const initialMarkerX = await ada.evaluate(element => element.style.left);
      await map.getByRole('button', { name: 'Eigenen Charakter fokussieren' }).click();
      await expect(modeLabel).toHaveText('3D');
      const markerAfterFocus = await ada.evaluate(element => element.style.left);
      await page.mouse.move(bounds.x + bounds.width * 0.45, bounds.y + bounds.height * 0.48);
      await page.mouse.wheel(0, -150);
      await expect.poll(() => ada.evaluate(element => element.style.left)).not.toBe(markerAfterFocus);
      const beforePan = await ada.evaluate(element => element.style.left);
      await page.mouse.move(bounds.x + bounds.width * 0.2, bounds.y + bounds.height * 0.3);
      await page.mouse.down();
      await page.mouse.move(bounds.x + bounds.width * 0.24, bounds.y + bounds.height * 0.32, { steps: 5 });
      await page.mouse.up();
      await expect.poll(() => ada.evaluate(element => element.style.left)).not.toBe(beforePan);
      await map.getByRole('button', { name: 'Karte zurücksetzen' }).click();
      await expect(modeLabel).toHaveText('2D');
      await expect.poll(() => ada.evaluate(element => element.style.left)).toBe(initialMarkerX);

      const baselineRoutePixels = await routePixels();
      await map.getByRole('button', { name: 'Pier 7' }).click();
      await expect(details.getByText('738,4 m · 12 Spielmin.')).toBeVisible();
      await expect.poll(routePixels).toBeGreaterThan(baselineRoutePixels + 60);
      await map.getByRole('button', { name: 'Eigenen Charakter fokussieren' }).click();
      await expect(modeLabel).toHaveText('3D');
      await expect.poll(routePixels).toBeGreaterThan(baselineRoutePixels + 60);
      await map.getByRole('button', { name: 'Karte zurücksetzen' }).click();
      await expect(modeLabel).toHaveText('2D');
      await details.getByRole('button', { name: 'Zu Fuß gehen' }).click();
      const travel = page.getByRole('region', { name: 'Laufende Reise' });
      await expect(travel.getByRole('heading', { name: 'Pier 7' })).toBeVisible();
      await expect(travel.getByText(/Noch (?:[1-9]|10|11) Spielmin/)).toBeVisible();
      await expect.poll(routePixels).toBeGreaterThan(baselineRoutePixels + 60);
      await ada.click();
      await expect(details.getByText('0 m / 0 m')).toHaveCount(0);
      await expect(page.getByText('Angekommen · Pier 7')).toBeVisible({ timeout: 16_000 });
      await expect(details.getByText('425 m / 295 m')).toBeVisible();
      await expect.poll(routePixels).toBeLessThan(baselineRoutePixels + 30);
      await map.getByRole('button', { name: 'Pier 7' }).click();
      await expect(details.getByText('Bereits am Ziel')).toBeVisible();

      await page.getByRole('link', { name: 'Debugger' }).click();
      const clientA = page.getByRole('region', { name: 'Client A' });
      const clientB = page.getByRole('region', { name: 'Client B' });
      await expect(clientA.getByText('Verbunden · session-1')).toBeVisible();
      await clientA.getByRole('button', { name: 'Zu Fuß zu Möwenpark' }).click();
      await expect(clientA.getByText(/Unterwegs · overlook/)).toBeVisible();
      await expect(clientA.getByText('425 m / 295 m', { exact: false })).toHaveCount(0);
      await clientB.getByRole('button', { name: 'Verbinden' }).click();
      await clientB.getByRole('listitem').filter({ hasText: 'Ben' }).getByRole('button', { name: 'Übernehmen' }).click();
      await expect(clientB.getByText('Bargeld · 200')).toBeVisible();

      await page.getByRole('link', { name: 'Zur Stadtkarte' }).click();
      await expect(ada).toHaveClass(/owned/);
      await expect(travel.getByRole('heading', { name: 'Möwenpark' })).toBeVisible();
      await ada.click();
      await expect(details.getByText('425 m / 295 m')).toHaveCount(0);
      await expect(details.getByText('100', { exact: true })).toBeVisible();
      await details.getByRole('button', { name: 'Freigeben' }).click();
      await expect(ada).toHaveClass(/resident/);
      await expect(details.getByText('Bargeld')).toHaveCount(0);
      await expect(ben).toHaveClass(/occupied/);
      await ben.click();
      await expect(details.getByRole('button', { name: 'Übernehmen' })).toBeDisabled();
      await expect(details.getByText('Bargeld')).toHaveCount(0);

      await page.getByRole('button', { name: 'Trennen' }).click();
      await expect(map.locator('.character-pin')).toHaveCount(0);
      await expect(details).toHaveCount(0);
      await page.getByRole('button', { name: 'Verbinden' }).click();
      await expect(ada).toHaveClass(/resident/);
      expect(errors).toEqual([]);
    } finally {
      await server?.stop();
    }
  });
}

test('fullscreen overlays, rotation and mobile lists keep the map usable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto('/');
  const map = page.getByRole('region', { name: 'Stadtkarte' });
  const canvas = map.locator('canvas');
  const keyboard = map.getByRole('application');
  const compass = map.getByRole('button', { name: 'Nach Norden ausrichten' });
  const pin = map.getByRole('button', { name: 'Café Tide' });
  const angle = () => compass.locator('i').evaluate(element => Number(element.style.transform.match(/rotate\((.+)rad\)/)?.[1]));
  await expect(map.locator('.location-pin')).toHaveCount(6);
  await expect.poll(() => canvas.boundingBox()).toEqual({ x: 0, y: 0, width: 1440, height: 960 });
  const initialPin = await pin.boundingBox();
  await keyboard.focus();
  for (let quarter = 1; quarter <= 4; quarter++) {
    for (let turn = 0; turn < 3; turn++) await keyboard.press('e');
    await expect.poll(async () => Math.cos(await angle())).toBeCloseTo(Math.cos(quarter * Math.PI / 2));
    await expect.poll(async () => Math.sin(await angle())).toBeCloseTo(Math.sin(quarter * Math.PI / 2));
    await pin.click();
    await expect(page.getByRole('region', { name: 'Auswahl' }).getByRole('heading', { name: 'Café Tide' })).toBeVisible();
    await expect(map.locator('.popover-leader')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(pin).toBeFocused();
    await keyboard.focus();
  }
  const finalPin = await pin.boundingBox();
  expect(finalPin!.x).toBeCloseTo(initialPin!.x);
  expect(finalPin!.y).toBeCloseTo(initialPin!.y);
  await page.mouse.move(700, 450);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(525, 450, { steps: 8 });
  await page.mouse.up({ button: 'right' });
  await expect.poll(async () => Math.round(await angle() * 10)).toBe(-16);
  const rotatedDock = await canvas.evaluate((element: HTMLCanvasElement) => {
    const span = 1120;
    const yaw = -175 * 0.009;
    return {
      x: element.clientWidth / 2 + (140 * Math.cos(yaw) - 340 * Math.sin(yaw)) * element.clientHeight / span,
      y: element.clientHeight / 2 + (140 * Math.sin(yaw) + 340 * Math.cos(yaw)) * element.clientHeight / span,
    };
  });
  await canvas.click({ position: rotatedDock });
  await expect(page.getByRole('heading', { name: 'DOCK-09' })).toBeVisible();
  await page.keyboard.press('Escape');
  await compass.click();
  await expect.poll(angle).toBe(0);

  await page.setViewportSize({ width: 375, height: 812 });
  await expect.poll(() => canvas.boundingBox()).toEqual({ x: 0, y: 0, width: 375, height: 812 });
  await expect(map.locator('.location-pin')).toHaveCount(6);
  expect(await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight]))
    .toEqual([375, 812]);
  await page.getByRole('button', { name: 'Charaktere', exact: true }).click();
  await page.getByRole('region', { name: 'Charaktere' }).getByRole('button', { name: /Ada/ }).click();
  const panel = page.getByRole('region', { name: 'Auswahl' });
  await expect(panel.getByRole('button', { name: 'Übernehmen' })).toBeVisible();
  const [sheet, controls] = await Promise.all([panel.boundingBox(), compass.boundingBox()]);
  expect(sheet!.y + sheet!.height).toBeLessThan(controls!.y);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Charaktere', exact: true })).toBeFocused();
  await keyboard.focus();
  for (let step = 0; step < 3; step++) await keyboard.press('+');
  await expect(map.getByLabel('Kartendarstellung')).toHaveText('3D');
  await keyboard.press('Home');
  await expect(map.getByLabel('Kartendarstellung')).toHaveText('2D');
});

test('directories and actions work when WebGL 2 is unavailable', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
      return type === 'webgl2' ? null : Reflect.apply(getContext, this, [type, ...args]);
    } as typeof getContext;
  });
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('WebGL 2');
  await page.getByRole('button', { name: 'Charaktere' }).click();
  await page.getByRole('region', { name: 'Charaktere' }).getByRole('button', { name: /Ada/ }).click();
  await page.getByRole('button', { name: 'Übernehmen' }).click();
  await expect(page.getByRole('button', { name: 'Freigeben' })).toBeVisible();
  await page.getByRole('button', { name: 'Orte' }).click();
  await page.getByRole('region', { name: 'Orte' }).getByRole('button', { name: /Café Tide/ }).click();
  await expect(page.getByRole('button', { name: 'Zu Fuß gehen' })).toBeVisible();
});
