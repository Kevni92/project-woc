import type { Point } from './city-data';

export interface Anchor {
  readonly id: string;
  readonly position: Point;
  readonly height?: number;
}

export interface ScreenAnchor {
  readonly id: string;
  readonly x: number;
  readonly y: number;
}

export interface MarkerLayout extends ScreenAnchor {
  readonly dx: number;
  readonly dy: number;
}

type ScreenBox = { left: number; top: number; width: number; height: number };

export function placePopover(area: ScreenBox, width: number, height: number, anchor?: ScreenAnchor, pins: readonly ScreenAnchor[] = []):
  { left: number; top: number; x?: number; y?: number } {
  const gap = 24;
  const right = area.left + area.width;
  const bottom = area.top + area.height;
  if (!anchor) return { left: right - width, top: area.top };
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
  const candidates = [
    { left: anchor.x + gap, top: anchor.y - height / 2 },
    { left: anchor.x - gap - width, top: anchor.y - height / 2 },
    { left: anchor.x - width / 2, top: anchor.y - gap - height },
    { left: anchor.x - width / 2, top: anchor.y + gap },
  ];
  const positions = candidates.map(({ left, top }) => ({
    left: clamp(left, area.left, right - width),
    top: clamp(top, area.top, bottom - height),
  }));
  let best: { left: number; top: number; x?: number; y?: number } = positions[0];
  let fewestCovered = Infinity;
  for (const position of positions) {
    const x = clamp(anchor.x, position.left, position.left + width);
    const y = clamp(anchor.y, position.top, position.top + height);
    if (Math.hypot(x - anchor.x, y - anchor.y) < gap - 1) continue;
    const covered = pins.filter(pin => pin.id !== anchor.id
      && pin.x + 17 > position.left && pin.x - 17 < position.left + width
      && pin.y + 17 > position.top && pin.y - 17 < position.top + height).length;
    if (covered === 0) return { ...position, x, y };
    if (covered < fewestCovered) {
      best = { ...position, x, y };
      fewestCovered = covered;
    }
  }
  return best;
}

export const pinPosition = (pin: MarkerLayout): ScreenAnchor => ({
  id: pin.id, x: pin.x + pin.dx, y: pin.y + pin.dy,
});

// Offset overlapping hit targets and keep a leader at the original projection.
export function layoutMarkers(points: readonly ScreenAnchor[], width: number, height: number): MarkerLayout[] {
  const layout: MarkerLayout[] = [];
  const minimumGap = 35;
  for (const point of points) {
    let dx = 0;
    let dy = 0;
    const fits = () => {
      const x = point.x + dx;
      const y = point.y + dy;
      return x >= 15 && x <= width - 15 && y >= 15 && y <= height - 15
        && layout.every(other => Math.hypot(x - other.x - other.dx, y - other.y - other.dy) >= minimumGap);
    };
    if (!fits()) {
      search:
      for (const radius of [37, 59, 81]) {
        for (let step = 0; step < 8; step++) {
          const angle = step * Math.PI / 4;
          dx = Math.round(radius * Math.cos(angle));
          dy = Math.round(radius * Math.sin(angle));
          if (fits()) break search;
        }
      }
    }
    layout.push(fits() ? { ...point, dx, dy } : { ...point, dx: 0, dy: 0 });
  }
  return layout;
}
