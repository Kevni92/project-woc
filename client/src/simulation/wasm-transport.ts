import type { Transport, TransportFactory, TransportListener } from './transport';
import type { WorkerAttach, WorkerRequest, WorkerResponse } from './wasm-channel';

type FailureListener = (error: Error) => void;
type AttachPort = (port: MessagePort, onFailure: FailureListener) => () => void;

class WasmTransport implements Transport {
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

export function createWasmTransportFactory(clock: 'realtime' | 'manual' = 'realtime'): TransportFactory {
  let worker: Worker | null = null;
  const clients = new Set<FailureListener>();
  const attach: AttachPort = (port, onFailure) => {
    if (!worker) {
      const activeWorker = new Worker(new URL('./wasm.worker.ts', import.meta.url), {
        type: 'module',
        name: 'woc-simulation',
      });
      worker = activeWorker;
      const fail = () => {
        if (worker !== activeWorker) return;
        worker = null;
        activeWorker.terminate();
        const connected = [...clients];
        clients.clear();
        for (const notify of connected) notify(new Error('WORKER_FAILED'));
      };
      activeWorker.onerror = fail;
      activeWorker.onmessageerror = fail;
      activeWorker.onmessage = event => {
        if (event.data?.type === 'failure') fail();
      };
      activeWorker.postMessage({ type: 'start', clock });
    }
    worker.postMessage({ type: 'attach', port } satisfies WorkerAttach, [port]);
    clients.add(onFailure);
    return () => { clients.delete(onFailure); };
  };
  return () => new WasmTransport(attach);
}
