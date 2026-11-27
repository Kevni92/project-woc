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
