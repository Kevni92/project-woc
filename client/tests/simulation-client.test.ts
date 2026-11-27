import { describe, expect, it } from 'vitest';
import type { ServerMessage } from '../src/simulation/protocol';
import { SimulationClient } from '../src/simulation/simulation-client';
import type { ClientState } from '../src/simulation/simulation-client';
import type { Transport, TransportListener } from '../src/simulation/transport';

type Snapshot = Extract<ServerMessage, { type: 'Snapshot' }>;
const character = {
  id: 'resident-ada', name: 'Ada', eligible: true, occupied: false, position: { x: 0, z: 0 },
};
const baseline: Snapshot['payload'] = {
  revision: 0, gameMinutes: 480, characters: [character], controlled: null,
};

class TestTransport implements Transport {
  private listener: TransportListener | null = null;
  readonly sent: { type: string; requestId: string }[] = [];

  async open(listener: TransportListener): Promise<void> {
    this.listener = listener;
  }

  send(wire: string): void {
    const request = JSON.parse(wire);
    this.sent.push(request);
    if (request.type === 'Hello') {
      this.deliver({
        ...envelope(1), type: 'Welcome', requestId: request.requestId,
        payload: { sessionId: 'session-1', worldId: 'woc', capabilities: [] },
      });
      this.deliver({ ...envelope(2), type: 'Snapshot', payload: baseline });
    }
  }

  deliver(message: ServerMessage): void {
    this.listener?.message(JSON.stringify(message));
  }

  fail(): void {
    this.listener?.closed(new Error('TEST_TRANSPORT_FAILED'));
  }

  close(): void {
    this.listener = null;
  }
}

function envelope(streamSeq: number) {
  return { protocolVersion: 1 as const, streamSeq, worldTick: 0 };
}

async function connect() {
  const transport = new TestTransport();
  const client = new SimulationClient(() => transport);
  let state: ClientState;
  client.subscribe(value => { state = value; });
  await client.connect();
  return { client, transport, state: () => state };
}

describe('SimulationClient', () => {
  it('coalesces gaps, keeps the last consistent projection and replaces it with a snapshot', async () => {
    const { client, state, transport } = await connect();
    const liveCharacter = { ...character, occupied: true, position: { x: 2, z: 0 } };

    transport.deliver({
      ...envelope(4), type: 'Delta',
      payload: { ...baseline, baseRevision: 1, revision: 2, characters: [liveCharacter] },
    });
    transport.deliver({
      ...envelope(5), type: 'Delta',
      payload: { ...baseline, baseRevision: 2, revision: 3, characters: [] },
    });
    expect(state().synchronizing).toBe(true);
    expect(state().view?.characters).toEqual([character]);
    const requests = transport.sent.filter(request => request.type === 'SnapshotRequest');
    expect(requests).toHaveLength(1);

    transport.deliver({
      ...envelope(6), type: 'Snapshot', requestId: requests[0].requestId,
      payload: { ...baseline, revision: 3, characters: [liveCharacter] },
    });
    expect(state().synchronizing).toBe(false);
    expect(state().view?.characters).toEqual([liveCharacter]);
    transport.deliver({
      ...envelope(7), type: 'Delta',
      payload: { ...baseline, baseRevision: 3, revision: 4, characters: [], gameMinutes: 481 },
    });
    expect(state().view).toMatchObject({ revision: 4, gameMinutes: 481, characters: [liveCharacter] });
    await client.disconnect();
  });

  it('resyncs on the wrong base revision even on a continuous stream', async () => {
    const { client, state, transport } = await connect();
    transport.deliver({
      ...envelope(3), type: 'Delta',
      payload: { ...baseline, baseRevision: 6, revision: 7, characters: [] },
    });
    expect(state().synchronizing).toBe(true);
    expect(state().view?.revision).toBe(0);
    expect(transport.sent.at(-1)?.type).toBe('SnapshotRequest');
    await client.disconnect();
  });

  it('rejects pending commands on transport failure and reports the error to subscribers', async () => {
    const { client, transport, state } = await connect();
    const result = expect(client.acquireCharacter(character.id)).rejects.toThrow('TEST_TRANSPORT_FAILED');
    transport.fail();
    await result;
    expect(state()).toMatchObject({ status: 'disconnected', view: null, error: 'TEST_TRANSPORT_FAILED' });
  });
});
