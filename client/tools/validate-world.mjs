import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import createWoc from '../src/generated/woc.mjs';

const directory = resolve(process.argv[2]);
const root = fileURLToPath(new URL('..', import.meta.url));
const vite = await createServer({
  root, configFile: false, logLevel: 'silent',
  server: { middlewareMode: true, hmr: false, watch: null },
});
try {
  const { loadWorldPackage } = await vite.ssrLoadModule('/src/content/world-package.ts');
  const start = performance.now();
  const world = await loadWorldPackage(new URL('http://localhost/world/'), async url =>
    new Response(await readFile(resolve(directory, basename(url.pathname)))));
  const loaderMs = performance.now() - start;
  const wasmBinary = await readFile(new URL('../src/generated/woc.wasm', import.meta.url));
  const wasmStart = performance.now();
  const module = await createWoc({ wasmBinary });
  const wasmModuleMs = performance.now() - wasmStart;
  const { manifest, world: city } = world.init;
  const manifestPtr = module._malloc(manifest.length);
  const cityPtr = module._malloc(city.length);
  try {
    module.HEAPU8.set(manifest, manifestPtr);
    module.HEAPU8.set(city, cityPtr);
    const initStart = performance.now();
    const result = module._woc_init(manifestPtr, manifest.length, cityPtr, city.length);
    const wasmInitMs = performance.now() - initStart;
    if (result) {
      const ptr = module._woc_output_data();
      throw new Error(new TextDecoder().decode(module.HEAPU8.subarray(ptr, ptr + module._woc_output_size())));
    }
    console.log(JSON.stringify({ loaderMs, wasmModuleMs, wasmInitMs }));
  } finally {
    module._free(cityPtr);
    module._free(manifestPtr);
  }
} finally {
  await vite.close();
}
