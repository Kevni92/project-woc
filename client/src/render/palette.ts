import { Color } from 'three';
import type { ColorRole, MapTheme } from './visual-data';

export type Palette = Record<ColorRole, Color>;

export function twilight(gameMinutes: number): number {
  const hour = (gameMinutes % 1440) / 60;
  if (hour < 5 || hour >= 20) return 0;
  if (hour < 7) return (hour - 5) / 2;
  if (hour < 18) return 1;
  return (20 - hour) / 2;
}

export class MapPalette {
  private readonly keys: ColorRole[];
  private readonly day: Palette;
  private readonly night: Palette;
  private readonly colors: Palette;

  constructor(theme: MapTheme) {
    this.keys = Object.keys(theme.day) as ColorRole[];
    const create = (colors: MapTheme['day']) =>
      Object.fromEntries(this.keys.map(role => [role, new Color(colors[role])])) as Palette;
    this.day = create(theme.day);
    this.night = create(theme.night);
    this.colors = create(theme.day);
  }

  at(daylight: number): Palette {
    for (const role of this.keys) this.colors[role].copy(this.night[role]).lerp(this.day[role], daylight);
    return this.colors;
  }
}
