import type { Transport, TransportFactory, TransportListener } from './transport';
import type { WorldInit } from '../content/world-package';
import type { WorkerAttach, WorkerRequest, WorkerResponse, WorkerStart } from './wasm-channel';

type FailureListener = (error: Error) => void;
type AttachPort = (port: MessagePort, onFailure: FailureListener) => () => void;

class WasmTransport implements Transport {
  // A valid large world may still be validating in the worker when the map starts drawing.
  readonly openTimeoutMs = 30_000;
  private port: MessagePort | null = null;
  private detach: (() => void) | null = null;
  private rejectOpen: ((reason: Error) => void) | null = null;

  constructor(private readonly attach: AttachPort) {}

  open(listener: TransportListener): Promise<void> {
    return new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      this.port = channel.port1;
      this.rejectOpen = reject;
      const fail = (error: Error) => {
        this.closeWith(error);
        listener.closed(error);
      };
      channel.port1.onmessage = (event: MessageEvent<WorkerResponse>) => {
        if (this.port !== channel.port1) return;
        if (event.data.type === 'ready') {
          this.rejectOpen = null;
          resolve();
        } else {
          listener.message(event.data.wire);
        }
      };
      channel.port1.onmessageerror = () => fail(new Error('WORKER_MESSAGE_ERROR'));
      try {
        this.detach = this.attach(channel.port2, fail);
      } catch (error) {
        channel.port2.close();
        fail(error instanceof Error ? error : new Error('WORKER_START_FAILED'));
      }
    });
  }

  send(wire: string): void {
    if (!this.port || this.rejectOpen) throw new Error('TRANSPORT_CLOSED');
    this.port.postMessage({ type: 'send', wire } satisfies WorkerRequest);
  }

  close(): void {
    this.closeWith(new Error('TRANSPORT_CLOSED'));
  }

  private closeWith(error: Error): void {
    const port = this.port;
    this.port = null;
    this.rejectOpen?.(error);
    this.rejectOpen = null;
    this.detach?.();
    this.detach = null;
    if (port) {
      port.postMessage({ type: 'close' } satisfies WorkerRequest);
      port.close();
    }
  }
}

function createWasmHost(world: WorldInit, clock: WorkerStart['clock']) {
  let worker: Worker | null = null;
  const clients = new Set<FailureListener>();
  const attach: AttachPort = (port, onFailure) => {
    if (!worker) {
      const activeWorker = new Worker(new URL('./wasm.worker.ts', import.meta.url), {
        type: 'module',
        name: 'woc-simulation',
      });
      worker = activeWorker;
      const fail = (code = 'WORKER_FAILED') => {
        if (worker !== activeWorker) return;
        worker = null;
        activeWorker.terminate();
        const connected = [...clients];
        clients.clear();
        for (const notify of connected) notify(new Error(code));
      };
      activeWorker.onerror = () => fail();
      activeWorker.onmessageerror = () => fail();
      activeWorker.onmessage = event => {
        if (event.data?.type === 'failure') fail(typeof event.data.code === 'string' ? event.data.code : undefined);
      };
      const payload = { manifest: world.manifest.slice(), world: world.world.slice() };
      activeWorker.postMessage({ type: 'start', clock, world: payload } satisfies WorkerStart,
        [payload.manifest.buffer, payload.world.buffer]);
    }
    worker.postMessage({ type: 'attach', port } satisfies WorkerAttach, [port]);
    clients.add(onFailure);
    return () => { clients.delete(onFailure); };
  };
  return {
    factory: () => new WasmTransport(attach),
    tick: () => worker?.postMessage({ type: 'tick' }),
  };
}

export function createWasmTransportFactory(world: WorldInit): TransportFactory {
  return createWasmHost(world, 'realtime').factory;
}

export function createManualWasmHost(world: WorldInit): { factory: TransportFactory; tick: () => void } {
  return createWasmHost(world, 'manual');
}
