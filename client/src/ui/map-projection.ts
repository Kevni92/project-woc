import type { CharacterSummary } from '../simulation/protocol';
import type { ClientState } from '../simulation/simulation-client';
import type { Point } from '../render/city-data';

export type MarkerKind = 'owned' | 'resident' | 'occupied' | 'ambient';

export interface CharacterMarker {
  readonly id: string;
  readonly name: string;
  readonly kind: MarkerKind;
  readonly position: Point;
}

function markerKind(character: CharacterSummary, controlledId?: string): MarkerKind {
  if (character.id === controlledId) return 'owned';
  if (!character.eligible) return 'ambient';
  return character.occupied ? 'occupied' : 'resident';
}

export function projectMap(session?: ClientState, pending = false) {
  const connected = session?.status === 'connected';
  const view = connected ? session.view : null;
  const synchronizing = !!session?.synchronizing;
  const controlled = synchronizing ? null : view?.controlled;
  const characters = synchronizing ? [] : (view?.characters ?? []);
  const markers: CharacterMarker[] = characters.map(character => ({
    id: character.id,
    name: character.name,
    kind: markerKind(character, controlled?.id),
    position: [character.position.x, character.position.z],
  }));
  return {
    markers,
    gameMinutes: view?.gameMinutes,
    controlled: markers.find(marker => marker.kind === 'owned'),
    cash: controlled?.cash,
    canCommand: connected && !!view && !synchronizing && !pending,
    synchronizing,
  };
}

export function formatClock(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  return String(hour % 24).padStart(2, '0') + ':' + String(minutes % 60).padStart(2, '0');
}
