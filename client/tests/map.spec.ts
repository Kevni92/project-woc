import { expect, test } from '@playwright/test';
import { startServer } from './native-host';

for (const mode of ['wasm', 'ws'] as const) {
  test(mode + ' renders and controls the same live city', async ({ page }) => {
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

      await expect(modeLabel).toHaveText('2D');
      await expect(places.getByRole('button')).toHaveCount(6);
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

      await page.getByRole('link', { name: 'Debugger' }).click();
      const clientA = page.getByRole('region', { name: 'Client A' });
      const clientB = page.getByRole('region', { name: 'Client B' });
      await expect(clientA.getByText('Verbunden · session-1')).toBeVisible();
      await clientA.getByRole('button', { name: 'Testaktion' }).click();
      await expect(clientA.getByText('1 m / 0 m', { exact: false })).toBeVisible();
      await clientB.getByRole('button', { name: 'Verbinden' }).click();
      await clientB.getByRole('listitem').filter({ hasText: 'Ben' }).getByRole('button', { name: 'Übernehmen' }).click();
      await expect(clientB.getByText('Bargeld · 200')).toBeVisible();

      await page.getByRole('link', { name: 'Zur Stadtkarte' }).click();
      await expect(ada).toHaveClass(/owned/);
      await expect.poll(() => ada.evaluate(element => element.style.left)).not.toBe(initialMarkerX);
      await ada.click();
      await expect(details.getByText('1 m / 0 m')).toBeVisible();
      await expect(details.getByText('110', { exact: true })).toBeVisible();
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

test('the city remains usable after a narrow viewport resize', async ({ page }) => {
  await page.goto('/');
  const map = page.getByRole('region', { name: 'Stadtkarte' });
  await expect(map.locator('.location-pin')).toHaveCount(6);
  await page.setViewportSize({ width: 375, height: 750 });
  await expect.poll(() => map.locator('canvas').evaluate((canvas: HTMLCanvasElement) => canvas.width)).toBeLessThan(375);
  await expect(map.locator('.location-pin')).toHaveCount(6);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
  const keyboard = map.getByRole('application');
  await keyboard.focus();
  for (let step = 0; step < 3; step++) await keyboard.press('+');
  await expect(map.getByLabel('Kartendarstellung')).toHaveText('3D');
  await keyboard.press('Home');
  await expect(map.getByLabel('Kartendarstellung')).toHaveText('2D');
});
