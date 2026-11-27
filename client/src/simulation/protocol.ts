import Ajv from 'ajv';
import serverSchema from '../../../protocol/server-v1.schema.json';

export const PROTOCOL_VERSION = 1;
export type Action = 'AcquireCharacter' | 'ReleaseCharacter' | 'TestAction';
export type Command = { action: Action; characterId: string };
export type Request =
  | { type: 'Hello' | 'SnapshotRequest'; payload: Record<string, never> }
  | { type: 'Command'; payload: Command };

export interface CharacterSummary {
  readonly id: string;
  readonly name: string;
  readonly eligible: boolean;
  readonly occupied: boolean;
  readonly position: { readonly x: number; readonly z: number };
}

interface Projection {
  readonly revision: number;
  readonly gameMinutes: number;
  readonly characters: readonly CharacterSummary[];
  readonly controlled: { readonly id: string; readonly cash: number } | null;
}

export interface View extends Projection {
  readonly worldTick: number;
}

export type CommandResult =
  | { accepted: true; revision: number }
  | { accepted: false; revision: number; code: string };

interface ServerEnvelope {
  protocolVersion: 1;
  streamSeq: number;
  worldTick: number;
  requestId?: string;
}

export type ServerMessage = ServerEnvelope & (
  | { type: 'Welcome'; requestId: string; payload: {
      sessionId: string; worldId: string; capabilities: string[];
    } }
  | { type: 'Snapshot'; payload: Projection }
  | { type: 'Delta'; payload: Projection & { baseRevision: number } }
  | { type: 'CommandResult'; requestId: string; payload: CommandResult }
  | { type: 'Error'; payload: { code: string } }
);

const isServerMessage = new Ajv().compile<ServerMessage>(serverSchema);

export function decodeServer(wire: string): ServerMessage {
  const value: unknown = JSON.parse(wire);
  if (!isServerMessage(value)) throw new Error('INVALID_SERVER_MESSAGE');
  return value;
}
