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

export async function start(mode: Mode, url: string, slug: string, worldBase?: string): Promise<void> {
  const query = new URLSearchParams({ world: slug, ...(worldBase && { worldBase }) });
  const world = await loadWorldPackage(worldPackageUrl(query, new URL('/', location.href)));
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

export function transcript(offset: number): Delivery[] {
  return deliveries.slice(offset);
}

export async function measurePreviews(locationId: string, samples: number) {
  const client = new SimulationClient(factory, identity);
  await client.connect();
  const result = await client.acquireCharacter('resident-ada');
  if (!result.accepted) throw new Error('Unable to acquire benchmark character');
  const elapsed = [];
  let distanceMm = 0;
  let durationTicks = 0;
  for (let i = 0; i < samples + 2; i++) {
    const start = performance.now();
    const preview = await client.previewRoute('resident-ada', locationId);
    if (!preview.accepted) throw new Error('No benchmark route: ' + preview.code);
    distanceMm = preview.route.distanceMm;
    durationTicks = preview.route.durationTicks;
    if (i >= 2) elapsed.push(performance.now() - start);
  }
  await client.disconnect();
  elapsed.sort((a, b) => a - b);
  return { medianMs: elapsed[Math.floor(elapsed.length / 2)], p95Ms: elapsed[Math.ceil(elapsed.length * .95) - 1],
    distanceMm, durationTicks, samples };
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
