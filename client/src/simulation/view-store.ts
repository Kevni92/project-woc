import type { ServerMessage, View } from './protocol';

export function fromSnapshot(message: Extract<ServerMessage, { type: 'Snapshot' }>): View {
  return { ...message.payload, worldTick: message.worldTick, snapshotSequence: message.streamSeq };
}

export function applyDelta(view: View, message: Extract<ServerMessage, { type: 'Delta' }>): View {
  const { characters, controlled, revision, gameMinutes } = message.payload;
  const updates = new Map(characters.map(character => [character.id, character]));
  return {
    revision,
    gameMinutes,
    worldTick: message.worldTick,
    snapshotSequence: view.snapshotSequence,
    controlled,
    characters: view.characters.map(character => updates.get(character.id) ?? character),
  };
}
