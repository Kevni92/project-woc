import { Color } from 'three';

const day = {
  water: '#234856',
  grid: '#315563',
  coast: '#6f8f8e',
  land: '#344b49',
  north: '#3b5552',
  oldTown: '#405650',
  docks: '#354c50',
  park: '#526b51',
  parkEdge: '#657b5a',
  roadEdge: '#485c56',
  street: '#657775',
  avenue: '#7c8a80',
  roadMark: '#a4ab8f',
  roof: '#9eada0',
  wall: '#617d78',
  shade: '#293f40',
  selected: '#efb97a',
  label: '#e0ebe0',
};

const night: typeof day = {
  water: '#101f32',
  grid: '#172c40',
  coast: '#355160',
  land: '#253443',
  north: '#2a3b4a',
  oldTown: '#303e48',
  docks: '#293949',
  park: '#34494b',
  parkEdge: '#405751',
  roadEdge: '#344451',
  street: '#4b5e69',
  avenue: '#697474',
  roadMark: '#9b937c',
  roof: '#647784',
  wall: '#465c69',
  shade: '#1a2836',
  selected: '#efb97a',
  label: '#d0dfeb',
};

const paletteKeys = Object.keys(day) as (keyof typeof day)[];
export type Palette = Record<keyof typeof day, Color>;

export function twilight(gameMinutes: number): number {
  const hour = (gameMinutes % 1440) / 60;
  if (hour < 5 || hour >= 20) return 0;
  if (hour < 7) return (hour - 5) / 2;
  if (hour < 18) return 1;
  return (20 - hour) / 2;
}

export function paletteAt(gameMinutes: number): Palette {
  const daylight = twilight(gameMinutes);
  return Object.fromEntries(paletteKeys.map(key => [
    key, new Color(night[key]).lerp(new Color(day[key]), daylight),
  ])) as Palette;
}
