import Ajv from 'ajv';
import { describe, expect, it } from 'vitest';
import schema from '../../protocol/client-v3.schema.json';
import { decodeServer, PROTOCOL_VERSION } from '../src/simulation/protocol';
import type { ControlledCharacter, ServerMessage } from '../src/simulation/protocol';
import { SimulationClient } from '../src/simulation/simulation-client';
import type { ClientState } from '../src/simulation/simulation-client';
import type { Transport, TransportListener } from '../src/simulation/transport';

type Snapshot = Extract<ServerMessage, { type: 'Snapshot' }>;
const character = {
  id: 'resident-ada', name: 'Ada', eligible: true, occupied: false, position: { x: 0, z: 0 }, status: 'Idle',
} as const;
const world = { worldId: 'p0-test-world', worldSchemaVersion: 2, worldRevision: 1, semanticHash: 'a'.repeat(64) };
const welcome = { sessionId: 'session-1', ...world, capabilities: ['FootTravel'] };
const baseline: Snapshot['payload'] = {
  revision: 0, gameMinutes: 480, characters: [character], controlled: null,
};
const route = {
  distanceMm: 125000, durationTicks: 2, points: [{ x: 0, z: 0 }, { x: 89, z: -28 }], edgeIds: ['path-market-01'],
};
const traveler: ControlledCharacter = {
  id: character.id, cash: 100, positionRevision: 2, locationId: null,
  travel: { locationId: 'market', startTick: 0, progressMm: 66666, remainingTicks: 1, route },
};

class TestTransport implements Transport {
  private listener: TransportListener | null = null;
  readonly sent: { type: string; requestId: string }[] = [];

  constructor(private readonly greeting = welcome) {}

  async open(listener: TransportListener): Promise<void> {
    this.listener = listener;
  }

  send(wire: string): void {
    const request = JSON.parse(wire);
    this.sent.push(request);
    if (request.type === 'Hello') {
      this.deliver({
        ...envelope(1), type: 'Welcome', requestId: request.requestId,
        payload: this.greeting,
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
  return { protocolVersion: PROTOCOL_VERSION, streamSeq, worldTick: 0 } as const;
}

async function connect() {
  const transport = new TestTransport();
  const client = new SimulationClient(() => transport, world);
  let state: ClientState;
  client.subscribe(value => { state = value; });
  await client.connect();
  return { client, transport, state: () => state };
}

describe('SimulationClient', () => {
  it('coalesces gaps, keeps the last consistent projection and replaces it with a snapshot', async () => {
    const { client, state, transport } = await connect();
    const liveCharacter = { ...character, occupied: true, position: { x: 2.123, z: 0 }, status: 'Traveling' } as const;

    transport.deliver({
      ...envelope(4), type: 'Delta',
      payload: { ...baseline, baseRevision: 1, revision: 2, characters: [liveCharacter], controlled: traveler },
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
      payload: { ...baseline, revision: 3, characters: [liveCharacter], controlled: traveler },
    });
    expect(state().synchronizing).toBe(false);
    expect(state().view?.characters).toEqual([liveCharacter]);
    expect(state().view?.controlled?.travel).toEqual(traveler.travel);
    expect(state().view?.snapshotSequence).toBe(6);
    transport.deliver({
      ...envelope(7), type: 'Delta',
      payload: { ...baseline, baseRevision: 3, revision: 4, characters: [], gameMinutes: 481 },
    });
    expect(state().view).toMatchObject({
      revision: 4, gameMinutes: 481, characters: [liveCharacter], controlled: null, snapshotSequence: 6,
    });
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

  it('matches a route preview response without changing the view', async () => {
    const { client, transport, state } = await connect();
    const previous = state().view;
    const preview = client.previewRoute(character.id, 'market');
    const request = transport.sent.at(-1)!;
    expect(request).toMatchObject({ type: 'RoutePreview', payload: { characterId: character.id, locationId: 'market' } });
    const payload = { accepted: true, characterId: character.id, locationId: 'market', positionRevision: 0, route } as const;
    transport.deliver({ ...envelope(3), type: 'RoutePreviewResult', requestId: request.requestId, payload });
    await expect(preview).resolves.toEqual(payload);
    expect(state().view).toBe(previous);
    await client.disconnect();
  });

  it.each([
    [{ worldId: 'another-city' }, 'INCOMPATIBLE_WORLD_PACKAGE'],
    [{ worldSchemaVersion: 1 }, 'INVALID_SERVER_MESSAGE'],
    [{ worldRevision: 2 }, 'INCOMPATIBLE_WORLD_PACKAGE'],
    [{ semanticHash: 'b'.repeat(64) }, 'INCOMPATIBLE_WORLD_PACKAGE'],
    [{ capabilities: [] }, 'MISSING_FOOT_TRAVEL'],
  ])('rejects incompatible Welcome data before accepting the snapshot', async (changes, code) => {
    const client = new SimulationClient(() => new TestTransport({ ...welcome, ...changes }), world);
    let state: ClientState | undefined;
    client.subscribe(value => { state = value; });
    await expect(client.connect()).rejects.toThrow(code);
    expect(state).toMatchObject({ status: 'disconnected', view: null, error: code });
  });
});

it('validates movement messages and rejects client-supplied progress or legacy envelopes', () => {
  const validate = new Ajv().compile(schema);
  const request = { protocolVersion: 3, type: 'Command', requestId: 'r',
    payload: { action: 'MoveTo', characterId: character.id, locationId: 'market' } };
  expect(validate(request)).toBe(true);
  expect(validate({ ...request, payload: { ...request.payload, durationTicks: 1 } })).toBe(false);
  expect(validate({ ...request, payload: { ...request.payload, locationId: undefined } })).toBe(false);
  const snapshot = { ...envelope(3), type: 'Snapshot', payload: { ...baseline, controlled: traveler } };
  expect(decodeServer(JSON.stringify(snapshot))).toEqual(snapshot);
  expect(() => decodeServer(JSON.stringify({ ...snapshot, protocolVersion: 1 }))).toThrow('UNSUPPORTED_VERSION');
  expect(() => decodeServer(JSON.stringify({
    ...snapshot, payload: { ...snapshot.payload, controlled: {
      ...traveler, travel: { ...traveler.travel, remainingTicks: 0 },
    } },
  }))).toThrow('INVALID_SERVER_MESSAGE');
});
