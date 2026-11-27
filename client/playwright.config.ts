import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  use: {
    browserName: 'chromium',
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort --bypass-lock',
      url: 'http://127.0.0.1:4173',
    },
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 4174 --strictPort --bypass-lock',
      url: 'http://127.0.0.1:4174',
    },
  ],
});
