import { decodeServer } from '../src/simulation/protocol';
import { loadWorldPackage, worldPackageUrl, type WorldIdentity } from '../src/content/world-package';
import type { ServerMessage } from '../src/simulation/protocol';
import { SimulationClient } from '../src/simulation/simulation-client';
import type { ClientState } from '../src/simulation/simulation-client';
import type { Transport, TransportFactory } from '../src/simulation/transport';
import { createManualWasmHost } from '../src/simulation/wasm-transport';
import { WebSocketTransport } from '../src/simulation/websocket-transport';

export type Mode = 'wasm' | 'ws';
export type Frame =
  | { op: 'open' | 'close'; connection: number }
  | { op: 'send'; connection: number; message: unknown }
  | { op: 'tick' };
export type Delivery = { connection: number; message: ServerMessage };

const connections = new Map<number, Transport>();
const deliveries: Delivery[] = [];
let factory: TransportFactory;
let tick: (() => void) | undefined;
let identity: WorldIdentity;

export async function start(mode: Mode, url: string, slug: string): Promise<void> {
  const world = await loadWorldPackage(worldPackageUrl(new URLSearchParams({ world: slug }), new URL('/', location.href)));
  const wasm = mode === 'wasm' ? createManualWasmHost(world.init) : undefined;
  identity = world.identity;
  factory = wasm?.factory ?? (() => new WebSocketTransport(url));
  tick = wasm?.tick;
}

export async function apply(frame: Frame): Promise<void> {
  if (frame.op === 'tick') {
    if (!tick) throw new Error('Manual WASM host required');
    tick();
    return;
  }
  const { connection } = frame;
  if (frame.op === 'open') {
    const transport = factory();
    connections.set(connection, transport);
    await transport.open({
      message: wire => { deliveries.push({ connection, message: decodeServer(wire) }); },
      closed: error => { throw error ?? new Error('Unexpected disconnect'); },
    });
  } else {
    const transport = connections.get(connection);
    if (!transport) throw new Error('Missing connection');
    if (frame.op === 'send') {
      transport.send(JSON.stringify(frame.message));
    } else {
      transport.close();
      connections.delete(connection);
    }
  }
}

export function transcript(): Delivery[] {
  return deliveries;
}

let state: ClientState;
let snapshotRequests = 0;
export async function simulateGap(): Promise<void> {
  const transport = factory();
  let dropDelta = true;
  const client = new SimulationClient(() => ({
    open: listener => transport.open({
      closed: listener.closed,
      message: wire => {
        const message = decodeServer(wire);
        if (dropDelta && message.type === 'Delta' && message.payload.controlled?.travel) {
          dropDelta = false;
        } else {
          listener.message(wire);
        }
      },
    }),
    send: wire => {
      if (JSON.parse(wire).type === 'SnapshotRequest') ++snapshotRequests;
      transport.send(wire);
    },
    close: () => transport.close(),
  }), identity);
  client.subscribe(value => { state = value; });
  await client.connect();
  const control = await client.acquireCharacter('resident-ada');
  const action = await client.moveTo('resident-ada', 'workshop');
  if (!control.accepted || !action.accepted) throw new Error('Rejected fixture command');
}

export function recovery(): { state: ClientState; snapshotRequests: number } {
  return { state, snapshotRequests };
}
