import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { startServer } from '../../../client/tests/native-host';

const dataDir = resolve(process.env.WOC_STUDIO_TEST_DATA ?? '../../build/osm-input');
const exportDir = resolve(process.env.WOC_STUDIO_TEST_EXPORTS ?? '../../build/studio-dev/exports');
const native = resolve(`../../build/native/woc_cli${process.platform === 'win32' ? '.exe' : ''}`);

test('Offline-Gebiet, Projekt, Import und Export', async ({ page }) => {
  let workerStatus = 0;
  page.on('response', response => { if (response.url().includes('maplibre-gl-worker-')) workerStatus = response.status(); });
  const slug = `e2e-${Date.now()}`;
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'World Studio' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Rechteck', exact: true })).toBeEnabled();
  await expect.poll(() => workerStatus).toBe(200);
  await page.getByLabel('Randmodus').selectOption('island');
  await expect(page.getByLabel('Padding (m)')).toHaveValue('500');
  await page.getByLabel('Randmodus').selectOption('natural');
  await expect(page.getByLabel('Padding (m)')).toHaveValue('0');
  await page.getByLabel('Ort oder Koordinaten').fill('53.0785, 8.8072');
  await page.getByRole('button', { name: 'Suchen', exact: true }).click();
  await page.getByRole('button', { name: 'Rechteck um Kartenmitte setzen' }).click();
  await expect(page.getByTestId('metrics')).toContainText('5000.0 × 5000.0 m');
  const map = page.locator('.geo-map canvas.maplibregl-canvas');
  await page.getByRole('button', { name: 'Rechteck', exact: true }).click();
  await map.scrollIntoViewIfNeeded();
  let box = (await map.boundingBox())!;
  await page.mouse.move(box.x + 160, box.y + 140);
  await page.mouse.down();
  await page.mouse.move(box.x + 300, box.y + 250, { steps: 10 });
  await page.mouse.up();
  await expect(page.getByTestId('metrics')).not.toContainText('5000.0 × 5000.0 m');
  const rectMetrics = await page.getByTestId('metrics').textContent();
  await page.getByRole('button', { name: 'Freihand', exact: true }).click();
  await map.scrollIntoViewIfNeeded();
  box = (await map.boundingBox())!;
  await page.mouse.move(box.x + 200, box.y + 180);
  await page.mouse.down();
  for (const [x, y] of [[270, 160], [310, 220], [220, 270], [180, 220], [200, 180]]) await page.mouse.move(box.x + x, box.y + y, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId('metrics')).not.toHaveText(rectMetrics!);
  const freehandMetrics = await page.getByTestId('metrics').textContent();
  await page.getByRole('button', { name: 'Bearbeiten' }).click();
  await map.scrollIntoViewIfNeeded();
  box = (await map.boundingBox())!;
  const beforeMove = await page.getByTestId('metrics').textContent();
  await map.click({ position: { x: 235, y: 210 } });
  await page.mouse.move(box.x + 235, box.y + 210);
  await page.mouse.down();
  await page.mouse.move(box.x + 245, box.y + 220, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByTestId('metrics')).not.toHaveText(freehandMetrics!);
  await page.getByRole('button', { name: 'Auswahl löschen' }).click();
  await expect(page.getByText('Keine gültige Auswahl vermessen.')).toBeVisible();
  const fixtureDir = resolve(dataDir, 'fixture-final');
  await page.getByLabel('GeoJSON laden').setInputFiles(resolve(fixtureDir, 'aoi.json'));
  await expect(page.getByTestId('metrics')).toBeVisible();
  await page.getByLabel('Projekt-ID').fill(slug);
  await page.getByLabel('World-ID').fill(slug);
  await page.getByLabel('Name', { exact: true }).fill('Offline Test');
  await page.getByLabel('OSM-PBF').fill('fixture-final/fixture.osm.pbf');
  await page.getByLabel('Land-GeoJSON').fill('fixture-final/land.json');
  await page.locator('details').filter({ hasText: 'Quellen und Lizenz' }).locator('summary').click();
  const config = JSON.parse(readFileSync(resolve(fixtureDir, 'config.json'), 'utf8'));
  await page.getByLabel('Land-Anbieter').fill(config.landSource.provider);
  await page.getByLabel('Land-URL').fill(config.landSource.url);
  await page.getByLabel('Lizenz', { exact: true }).fill(config.landSource.license);
  await page.getByLabel('Attribution', { exact: true }).fill(config.landSource.attribution);
  await page.getByLabel('Datendatum').fill(config.landSource.dataDate);
  await page.getByRole('button', { name: 'Projekt speichern' }).click();
  await expect(page.getByText('Projekt gespeichert.')).toBeVisible();
  const saved = await (await page.request.get(`/api/projects/${slug}`)).json();
  expect(saved.map.aoi).toEqual(JSON.parse(readFileSync(resolve(fixtureDir, 'aoi.json'), 'utf8')));
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Auswahl als GeoJSON speichern' }).click()]);
  expect(JSON.parse(readFileSync((await download.path())!, 'utf8'))).toEqual(saved.map.aoi);
  await page.getByRole('button', { name: 'Bearbeiten' }).click();
  await map.scrollIntoViewIfNeeded();
  box = (await map.boundingBox())!;
  await map.click({ position: { x: box.width * .42, y: box.height * .4 } });
  await page.mouse.move(box.x + box.width * .42, box.y + box.height * .4);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .44, box.y + box.height * .42, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByTestId('metrics')).not.toHaveText(beforeMove!);
  await Promise.all([page.waitForResponse(response => response.request().method() === 'PUT' && response.url().endsWith(`/api/projects/${slug}`)),
    page.getByRole('button', { name: 'Projekt speichern' }).click()]);
  const moved = await (await page.request.get(`/api/projects/${slug}`)).json();
  expect(moved.map.aoi.coordinates).toHaveLength(2);
  expect(moved.map.aoi.coordinates[1]).not.toEqual(saved.map.aoi.coordinates[1]);
  await page.getByLabel('GeoJSON laden').setInputFiles(resolve(fixtureDir, 'aoi.json'));
  await Promise.all([page.waitForResponse(response => response.request().method() === 'PUT' && response.url().endsWith(`/api/projects/${slug}`)),
    page.getByRole('button', { name: 'Projekt speichern' }).click()]);
  await page.getByLabel('Name', { exact: true }).fill('Verändert');
  await page.getByLabel('Gespeichertes Projekt').selectOption(slug);
  await page.getByRole('button', { name: 'Laden', exact: true }).click();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Offline Test');
  await page.getByRole('button', { name: 'Import starten' }).click();
  await expect(page.getByText('Job: done', { exact: false })).toBeVisible({ timeout: 120_000 });
  await expect(page.getByLabel('Importierte Kartenvorschau')).toBeVisible();
  const canvas = page.getByLabel('Importierte Kartenvorschau');
  for (const layer of ['Gebäude', 'Straßen', 'Gewässer', 'Grünflächen', 'Fußwegenetz', 'Startpositionen']) {
    const before = await canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL());
    await page.getByLabel(layer, { exact: true }).uncheck();
    await expect.poll(() => canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL())).not.toBe(before);
    await page.getByLabel(layer, { exact: true }).check();
    await expect.poll(() => canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL())).toBe(before);
  }
  await page.screenshot({ path: test.info().outputPath('studio-preview.png'), fullPage: true });
  await page.getByRole('button', { name: 'Spielvorschau' }).click();
  await expect(page.getByLabel('Three.js Spielvorschau')).toBeVisible();
  await expect(page.getByText('Spielvorschau bereit')).toBeVisible({ timeout: 45_000 });
  await page.getByLabel('Name', { exact: true }).fill('Änderung nach Import');
  await expect(page.getByRole('button', { name: 'Validiertes Paket exportieren' })).toBeDisabled();
  await page.getByLabel('Name', { exact: true }).fill('Offline Test');
  await page.getByRole('button', { name: 'Validiertes Paket exportieren' }).click();
  await expect(page.getByText('Export:', { exact: false })).toBeVisible();
  const link = page.getByRole('link', { name: /Im Spiel öffnen/ });
  await expect(link).toHaveAttribute('href', /worldBase=/);
  const gameUrl = await link.getAttribute('href');
  await page.getByLabel('OSM-PBF').fill('nicht-vorhanden.pbf');
  await page.getByRole('button', { name: 'Import starten' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Quelldatei fehlt' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Validiertes Paket exportieren' })).toHaveCount(0);
  await page.goto(gameUrl!);
  await expect(page.getByRole('heading', { name: 'Offline Test' })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText('Verbunden', { exact: true })).toBeVisible({ timeout: 45_000 });
  const nativeResult = spawnSync(native, ['--world', resolve(exportDir, slug)], { input: '', encoding: 'utf8', timeout: 30_000 });
  expect(nativeResult.status, nativeResult.stderr).toBe(0);
  const server = await startServer(false, slug, resolve(exportDir, slug));
  try {
    const wsUrl = new URL(gameUrl!); wsUrl.searchParams.set('transport', 'ws'); wsUrl.searchParams.set('ws', server.url);
    await page.goto(wsUrl.href);
    await expect(page.getByText('Verbunden', { exact: true })).toBeVisible({ timeout: 45_000 });
    await page.getByRole('button', { name: 'Charaktere', exact: true }).click();
    await page.getByRole('region', { name: 'Charaktere' }).getByRole('button', { name: /Ada/ }).click();
    await page.getByRole('button', { name: 'Übernehmen' }).click();
    await expect(page.getByRole('button', { name: 'Freigeben' })).toBeVisible();
  } finally { await server.stop(); }
});

test('Reales Stadtgebiet: Bremen 1 km importieren und öffnen', async ({ page }) => {
  test.skip(!process.env.WOC_STUDIO_REAL_INPUT, 'Bremen-Quelldaten sind optional');
  test.setTimeout(180_000);
  const slug = `bremen-studio-${Date.now()}`;
  const config = JSON.parse(readFileSync(resolve(dataDir, 'bremen-1km-config.json'), 'utf8'));
  config.worldId = slug;
  const project = { version: 1, id: slug, map: { config, pbf: 'bremen.osm.pbf', land: 'bremen-land.geojson',
    aoi: JSON.parse(readFileSync(resolve(dataDir, 'bremen-1km-aoi.json'), 'utf8')) } };
  const response = await page.request.put(`/api/projects/${slug}`, { data: project,
    headers: { Origin: new URL(test.info().project.use.baseURL!).origin, 'X-WOC-Studio': '1' } });
  expect(response.ok()).toBeTruthy();
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Rechteck', exact: true })).toBeEnabled();
  await page.getByLabel('Gespeichertes Projekt').selectOption(slug);
  await page.getByRole('button', { name: 'Laden', exact: true }).click();
  await expect(page.getByTestId('metrics')).toContainText('1000.0 × 1000.0 m');
  await page.getByRole('button', { name: 'Import starten' }).click();
  await expect(page.getByText('Job: done', { exact: false })).toBeVisible({ timeout: 150_000 });
  await page.getByText('Qualitätsbericht').click();
  await expect(page.locator('pre')).toContainText('buildings');
  await page.getByRole('button', { name: 'Spielvorschau' }).click();
  await expect(page.getByLabel('Three.js Spielvorschau')).toBeVisible();
  await expect(page.getByText('Spielvorschau bereit')).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Validiertes Paket exportieren' }).click();
  await expect(page.getByText('Export:', { exact: false })).toBeVisible();
  const url = await page.getByRole('link', { name: /Im Spiel öffnen/ }).getAttribute('href');
  await page.goto(url!);
  await expect(page.getByText('Verbunden', { exact: true })).toBeVisible({ timeout: 45_000 });
  const nativeResult = spawnSync(native, ['--world', resolve(exportDir, slug)], { input: '', encoding: 'utf8', timeout: 30_000 });
  expect(nativeResult.status, nativeResult.stderr).toBe(0);
  const server = await startServer(false, slug, resolve(exportDir, slug));
  try {
    const wsUrl = new URL(url!); wsUrl.searchParams.set('transport', 'ws'); wsUrl.searchParams.set('ws', server.url);
    await page.goto(wsUrl.href);
    await expect(page.getByText('Verbunden', { exact: true })).toBeVisible({ timeout: 60_000 });
    await page.getByRole('button', { name: 'Charaktere', exact: true }).click();
    await page.getByRole('region', { name: 'Charaktere' }).getByRole('button', { name: /Ada/ }).click();
    await page.getByRole('button', { name: 'Übernehmen' }).click();
    await expect(page.getByRole('button', { name: 'Freigeben' })).toBeVisible();
  } finally { await server.stop(); }
});

test('Import abbrechen und Fehler anzeigen', async ({ page }) => {
  const slug = `errors-${Date.now()}`;
  const dir = resolve(dataDir, 'fixture-final');
  const config = JSON.parse(readFileSync(resolve(dir, 'config.json'), 'utf8'));
  config.worldId = slug;
  const project = { version: 1, id: slug, map: { config, pbf: 'fixture-final/fixture.osm.pbf', land: 'fixture-final/land.json',
    aoi: JSON.parse(readFileSync(resolve(dir, 'aoi.json'), 'utf8')) } };
  const response = await page.request.put(`/api/projects/${slug}`, { data: project,
    headers: { Origin: new URL(test.info().project.use.baseURL!).origin, 'X-WOC-Studio': '1' } });
  expect(response.ok()).toBeTruthy();
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Rechteck', exact: true })).toBeEnabled();
  await page.getByLabel('Gespeichertes Projekt').selectOption(slug);
  await page.getByRole('button', { name: 'Laden', exact: true }).click();
  await expect(page.getByTestId('metrics')).toBeVisible();
  await page.getByRole('button', { name: 'Import starten' }).click();
  await page.getByRole('button', { name: 'Abbrechen' }).click();
  await expect(page.getByText('Job: cancelled', { exact: false })).toBeVisible();
  await page.getByLabel('Revision').fill('-1');
  await page.getByRole('button', { name: 'Import starten' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Import fehlgeschlagen' })).toContainText('revision');
  await expect(page.getByRole('button', { name: 'Validiertes Paket exportieren' })).toHaveCount(0);
});

test('Konfigurierbarer Kartenstil und Geocoder', async ({ page }) => {
  await page.route('https://studio-test.invalid/style.json', route => route.fulfill({ json: {
    version: 8, sources: {}, layers: [{ id: 'base', type: 'background', paint: { 'background-color': '#b2d8d0' } }],
  }, headers: { 'Access-Control-Allow-Origin': '*' } }));
  await page.route('https://studio-test.invalid/search*', route => route.fulfill({ json: [{ lat: '53.55', lon: '9.99' }],
    headers: { 'Access-Control-Allow-Origin': '*' } }));
  await page.goto('/');
  await page.getByText('Kartenanbieter und Geocoder').click();
  await page.getByLabel('MapLibre-Stil-URL').fill('https://studio-test.invalid/style.json');
  await page.getByLabel('Geocoder-URL').fill('https://studio-test.invalid/search?q={query}');
  await page.getByRole('button', { name: 'Konfiguration speichern und neu laden' }).click();
  await expect(page.getByRole('button', { name: 'Rechteck', exact: true })).toBeEnabled();
  await page.getByLabel('Ort oder Koordinaten').fill('Hamburg');
  await page.getByRole('button', { name: 'Suchen', exact: true }).click();
  await page.waitForTimeout(2500); // MapLibre fly-to animation must finish before measuring its centre.
  await page.getByRole('button', { name: 'Rechteck um Kartenmitte setzen' }).click();
  await expect(page.getByTestId('metrics')).toContainText('9.95');
});
