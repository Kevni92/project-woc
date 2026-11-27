import Ajv from 'ajv';
import serverSchema from '../../../protocol/server-v2.schema.json';

export const PROTOCOL_VERSION = 2;
export type Command =
  | { action: 'AcquireCharacter' | 'ReleaseCharacter'; characterId: string }
  | { action: 'MoveTo'; characterId: string; locationId: string };
export type Request =
  | { type: 'Hello' | 'SnapshotRequest'; payload: Record<string, never> }
  | { type: 'RoutePreview'; payload: { characterId: string; locationId: string } }
  | { type: 'Command'; payload: Command };

export interface Position {
  readonly x: number;
  readonly z: number;
}

export interface CharacterSummary {
  readonly id: string;
  readonly name: string;
  readonly eligible: boolean;
  readonly occupied: boolean;
  readonly position: Position;
  readonly status: 'Idle' | 'Traveling' | 'AtLocation';
}

export interface Route {
  readonly distanceMm: number;
  readonly durationTicks: number;
  readonly points: readonly Position[];
  readonly edgeIds: readonly string[];
}

export interface Travel {
  readonly locationId: string;
  readonly startTick: number;
  readonly progressMm: number;
  readonly remainingTicks: number;
  readonly route: Route;
}

export interface ControlledCharacter {
  readonly id: string;
  readonly cash: number;
  readonly positionRevision: number;
  readonly locationId: string | null;
  readonly travel: Travel | null;
}

interface Projection {
  readonly revision: number;
  readonly gameMinutes: number;
  readonly characters: readonly CharacterSummary[];
  readonly controlled: ControlledCharacter | null;
}

export interface View extends Projection {
  readonly worldTick: number;
  readonly snapshotSequence: number;
}

export type CommandResult =
  | { accepted: true; revision: number }
  | { accepted: false; revision: number; code: string };

export type RoutePreviewResult =
  | { accepted: true; characterId: string; locationId: string; positionRevision: number; route: Route }
  | { accepted: false; code: string };

interface ServerEnvelope {
  protocolVersion: typeof PROTOCOL_VERSION;
  streamSeq: number;
  worldTick: number;
  requestId?: string;
}

export type ServerMessage = ServerEnvelope & (
  | { type: 'Welcome'; requestId: string; payload: {
      sessionId: string; worldId: string; contentVersion: number; capabilities: string[];
    } }
  | { type: 'Snapshot'; payload: Projection }
  | { type: 'Delta'; payload: Projection & { baseRevision: number } }
  | { type: 'CommandResult'; requestId: string; payload: CommandResult }
  | { type: 'RoutePreviewResult'; requestId: string; payload: RoutePreviewResult }
  | { type: 'Error'; payload: { code: string } }
);

const isServerMessage = new Ajv().compile<ServerMessage>(serverSchema);

export function decodeServer(wire: string): ServerMessage {
  const value: unknown = JSON.parse(wire);
  if (typeof value === 'object' && value !== null && 'protocolVersion' in value
    && typeof value.protocolVersion === 'number' && value.protocolVersion !== PROTOCOL_VERSION) {
    throw new Error('UNSUPPORTED_VERSION');
  }
  if (!isServerMessage(value)) throw new Error('INVALID_SERVER_MESSAGE');
  return value;
}
