import { fileURLToPath } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [svelte()],
  server: { fs: { allow: [fileURLToPath(new URL('..', import.meta.url))] } },
  worker: { format: 'es' },
});
