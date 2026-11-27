import createWoc from '../generated/woc.mjs';
import type { WocModule } from '../generated/woc.mjs';
import wasmUrl from '../generated/woc.wasm?url';
import type { WorldInit } from '../content/world-package';
import type { WorkerAttach, WorkerRequest, WorkerResponse, WorkerStart } from './wasm-channel';

const worker = self as DedicatedWorkerGlobalScope;
type Tick = { type: 'tick' };
type Delivery = { connection: number; message: string };
const ports = new Map<number, MessagePort>();
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
let nextConnection = 1;
let initializing: Promise<WocModule> | null = null;
let timer: ReturnType<typeof setInterval> | undefined;
let failed = false;
let clock: WorkerStart['clock'];

function fail(code = 'WORKER_FAILED'): void {
  if (failed) return;
  failed = true;
  clearInterval(timer);
  worker.postMessage({ type: 'failure', code });
  worker.close();
}

function output(runtime: WocModule): string {
  const start = runtime._woc_output_data();
  return decoder.decode(runtime.HEAPU8.subarray(start, start + runtime._woc_output_size()));
}

function deliver(runtime: WocModule): void {
  const deliveries = JSON.parse(output(runtime)) as Delivery[];
  for (const { connection, message } of deliveries) {
    ports.get(connection)?.postMessage({ type: 'message', wire: message } satisfies WorkerResponse);
  }
}

function initializeWorld(runtime: WocModule, { manifest, world }: WorldInit): WocModule {
  const manifestPointer = runtime._malloc(manifest.length);
  const worldPointer = runtime._malloc(world.length);
  try {
    if (!manifestPointer || !worldPointer) throw new Error('WASM_ALLOCATION_FAILED');
    runtime.HEAPU8.set(manifest, manifestPointer);
    runtime.HEAPU8.set(world, worldPointer);
    if (runtime._woc_init(manifestPointer, manifest.length, worldPointer, world.length) !== 0) {
      throw new Error('WORLD_INIT_FAILED: ' + output(runtime));
    }
    return runtime;
  } finally {
    runtime._free(manifestPointer);
    runtime._free(worldPointer);
  }
}

function receive(runtime: WocModule, connection: number, wire: string): void {
  const bytes = encoder.encode(wire);
  // An oversized input can be rejected by the codec without crossing the ABI in full.
  const input = bytes.length > 4096 ? encoder.encode('null') : bytes;
  const pointer = runtime._malloc(Math.max(1, input.length));
  if (!pointer) throw new Error('WASM_ALLOCATION_FAILED');
  try {
    runtime.HEAPU8.set(input, pointer);
    runtime._woc_receive(connection, pointer, input.length);
    deliver(runtime);
  } finally {
    runtime._free(pointer);
  }
}

function attach(runtime: WocModule, port: MessagePort): void {
  const connection = nextConnection++;
  const close = () => {
    ports.delete(connection);
    port.close();
    runtime._woc_close(connection);
    deliver(runtime);
  };
  runtime._woc_open(connection);
  ports.set(connection, port);
  port.onmessage = (event: MessageEvent<WorkerRequest>) => {
    try {
      if (event.data.type === 'close') close();
      else receive(runtime, connection, event.data.wire);
    } catch {
      fail();
    }
  };
  port.onmessageerror = () => {
    try { close(); } catch { fail(); }
  };
  port.postMessage({ type: 'ready' } satisfies WorkerResponse);
}

worker.onmessage = (event: MessageEvent<WorkerStart | WorkerAttach | Tick>) => {
  const request = event.data;
  if (request.type === 'start' && !initializing) {
    clock = request.clock;
    initializing = createWoc({ locateFile: () => wasmUrl }).then(runtime => initializeWorld(runtime, request.world));
    void initializing.then(runtime => {
      if (request.clock === 'realtime') {
        timer = setInterval(() => {
          try {
            runtime._woc_tick();
            deliver(runtime);
          } catch {
            fail();
          }
        }, 1000);
      }
    }).catch(error => {
      const code = error instanceof Error && error.message.startsWith('WORLD_INIT_FAILED:') ? error.message : undefined;
      fail(code);
    });
  } else if (request.type === 'attach' && initializing) {
    void initializing.then(runtime => attach(runtime, request.port), () => request.port.close()).catch(() => fail());
  } else if (request.type === 'tick' && clock === 'manual' && initializing) {
    void initializing.then(runtime => {
      runtime._woc_tick();
      deliver(runtime);
    }, () => {}).catch(() => fail());
  }
};
