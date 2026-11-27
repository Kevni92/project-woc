import { MeshGeometry, raised } from './mesh-geometry';
import type { City, Point } from './city-data';
import { distanceSquaredBetween, mixPoint, segments, type Segment } from './map-geometry';
import type { MapTheme, MapVisuals } from './visual-data';

export function roadMarkings(path: readonly Point[], dash: number, gap: number): Segment[] {
  const pieces: Segment[] = [];
  const interval = dash + gap;
  let distance = 0;
  for (const [a, b] of segments(path, false)) {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const start = Math.floor(distance / interval) * interval + gap / 2;
    for (let offset = start - distance; offset < length; offset += interval) {
      const from = Math.max(0, offset);
      const to = Math.min(length, offset + dash);
      if (to - from > 0.05) pieces.push([mixPoint(a, b, from / length), mixPoint(a, b, to / length)]);
    }
    distance += length;
  }
  return pieces;
}

function strip(batch: MeshGeometry, [[x, z], [nextX, nextZ]]: Segment, width: number, y: number) {
  const scale = width / (2 * Math.hypot(nextX - x, nextZ - z));
  const dx = (nextZ - z) * scale;
  const dz = (x - nextX) * scale;
  batch.topQuad([x + dx, y, z + dz], [nextX + dx, y, nextZ + dz],
    [nextX - dx, y, nextZ - dz], [x - dx, y, z - dz]);
}

function strokePath(path: readonly Point[]) {
  return path.filter(([x, z], i) => {
    if (i === 0 || i === path.length - 1) return true;
    const [ax, az] = path[i - 1];
    const [bx, bz] = path[i + 1];
    const dx = x - ax;
    const dz = z - az;
    const nextX = bx - x;
    const nextZ = bz - z;
    return Math.abs(dx * nextZ - dz * nextX) > 1e-7 || dx * nextX + dz * nextZ < 0;
  });
}

function roundStroke(batch: MeshGeometry, path: readonly Point[], width: number, y: number) {
  for (const edge of segments(path, false)) strip(batch, edge, width, y);
  const radius = width / 2;
  const sides = 16;
  for (const center of path) {
    const rim = Array.from({ length: sides }, (_, i) => {
      const angle = i * 2 * Math.PI / sides;
      return raised([center[0] + radius * Math.cos(angle), center[1] + radius * Math.sin(angle)], y);
    });
    for (let i = 0; i < sides; i++) batch.top(raised(center, y), rim[i], rim[(i + 1) % sides]);
  }
}

export function roadGeometry(city: City, visuals: MapVisuals, theme: MapTheme) {
  const batches = { roadEdge: new MeshGeometry(), roadLocal: new MeshGeometry(), roadMain: new MeshGeometry(), marking: new MeshGeometry() };
  const { layerStepM: step, roads: rules } = theme;
  if (visuals.visualVersion === 2) {
    for (const road of visuals.roads) {
      const isMain = road.profile === 'main';
      batches[isMain ? 'roadMain' : 'roadLocal'].area(road.polygon, (isMain ? 10 : 9) * step);
    }
    return batches;
  }
  const byId = new Map(visuals.roads.map(road => [road.roadId, road]));
  const corridors = city.roads.map(road => ({ road, edges: segments(road.path, false) }));
  for (const { road } of corridors) {
    const appearance = byId.get(road.id);
    const profile = appearance?.profile ?? (road.kind === 'avenue' ? 'main' : 'local');
    const edgeWidth = appearance?.sidewalkWidthM ?? road.width * rules.edgeFraction;
    const path = strokePath(road.path);
    roundStroke(batches.roadEdge, path, road.width, 8 * step);
    roundStroke(batches[profile === 'main' ? 'roadMain' : 'roadLocal'], path, road.width - 2 * edgeWidth,
      (profile === 'main' ? 10 : 9) * step);
    if ((appearance?.markings ?? (profile === 'main' ? 'center' : 'none')) === 'none') continue;
    for (const dash of roadMarkings(road.path, rules.dashLengthM, rules.dashGapM)) {
      const junction = corridors.some(other => road !== other.road
        && other.edges.some(edge => distanceSquaredBetween(dash, edge) < (other.road.width * 0.55) ** 2));
      if (!junction) strip(batches.marking, dash, road.width * rules.markingFraction, 11 * step);
    }
  }
  return batches;
}
