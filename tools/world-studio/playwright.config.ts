import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', timeout: 180_000, workers: 1,
  use: { baseURL: process.env.WOC_STUDIO_TEST_URL ?? 'http://127.0.0.1:8099', headless: true,
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } },
});
