import type { Bounds, Point } from './city-data';
import { inBounds, intersects, mixPoint, onSegment, ringEdges, segmentSamples, signedArea, type Segment } from './map-geometry';

export type Ring = readonly Point[];
export interface Polygon {
  readonly outer: Ring;
  readonly holes: readonly Ring[];
}
export interface Area {
  readonly polygons: readonly Polygon[];
}

export function parts(geometry: Area | Ring): readonly Polygon[] {
  return 'polygons' in geometry ? geometry.polygons : [{ outer: geometry, holes: [] }];
}

export function segmentBounds([[ax, az], [bx, bz]]: Segment): Bounds {
  return { minX: Math.min(ax, bx), maxX: Math.max(ax, bx), minZ: Math.min(az, bz), maxZ: Math.max(az, bz) };
}

const combined = (a: Bounds, b: Bounds): Bounds => ({
  minX: Math.min(a.minX, b.minX), maxX: Math.max(a.maxX, b.maxX),
  minZ: Math.min(a.minZ, b.minZ), maxZ: Math.max(a.maxZ, b.maxZ),
});
const meets = (a: Bounds, b: Bounds) => a.minX <= b.maxX && b.minX <= a.maxX
  && a.minZ <= b.maxZ && b.minZ <= a.maxZ;

type Entry<T> = { bounds: Bounds; value: T };
type Branch<T> = { bounds: Bounds } & ({ entries: readonly Entry<T>[] } | { left: Branch<T>; right: Branch<T> });

function branch<T>(entries: Entry<T>[]): Branch<T> {
  const bounds = entries.map(entry => entry.bounds).reduce(combined);
  if (entries.length <= 8) return { bounds, entries };
  const splitX = bounds.maxX - bounds.minX >= bounds.maxZ - bounds.minZ;
  const center = (box: Bounds) => splitX ? box.minX + box.maxX : box.minZ + box.maxZ;
  entries.sort((a, b) => center(a.bounds) - center(b.bounds));
  const middle = entries.length >> 1;
  return { bounds, left: branch(entries.slice(0, middle)), right: branch(entries.slice(middle)) };
}

export class SpatialIndex<T> {
  private readonly root?: Branch<T>;

  constructor(values: readonly T[], bounds: (value: T) => Bounds) {
    if (values.length) this.root = branch(values.map(value => ({ bounds: bounds(value), value })));
  }

  query(bounds: Bounds): T[] {
    const result: T[] = [];
    const visit = (node: Branch<T>) => {
      if (!meets(node.bounds, bounds)) return;
      if ('entries' in node) {
        for (const entry of node.entries) {
          if (meets(entry.bounds, bounds)) result.push(entry.value);
        }
      } else {
        visit(node.left);
        visit(node.right);
      }
    };
    if (this.root) visit(this.root);
    return result;
  }
}

export const onMillimeterGrid = (coordinate: number) => Math.abs(coordinate) <= 10_000
  && Math.abs(coordinate * 1000 - Math.round(coordinate * 1000)) <= 1e-6;

function validRing(ring: Ring, bounds: Bounds) {
  if (!ring.every(point => inBounds(point, bounds) && point.every(onMillimeterGrid)) || !signedArea(ring)) {
    throw new Error('Invalid ring bounds, precision or area');
  }
  const edges = ringEdges(ring);
  const index = new SpatialIndex(edges.map((edge, i) => ({ edge, i })), entry => segmentBounds(entry.edge));
  for (const [i, edge] of edges.entries()) {
    const previous = edges[(i + edges.length - 1) % edges.length];
    if (onSegment(previous[0], edge) || onSegment(edge[1], previous)
      || index.query(segmentBounds(edge)).some(other => other.i >= i + 2
        && !(i === 0 && other.i === edges.length - 1) && intersects(edge, other.edge))) {
      throw new Error('Intersecting or degenerate ring');
    }
  }
  return edges;
}

export class AreaBoundary {
  readonly bounds: Bounds;
  private readonly index: SpatialIndex<Segment>;

  constructor(readonly edges: readonly Segment[]) {
    this.bounds = edges.map(segmentBounds).reduce(combined);
    this.index = new SpatialIndex(edges, segmentBounds);
  }

  nearby(line: Segment) { return this.index.query(segmentBounds(line)); }

  side(point: Point) {
    const [x, z] = point;
    const epsilon = 1e-8;
    const ray = this.index.query({ minX: x - epsilon, maxX: this.bounds.maxX + epsilon, minZ: z - epsilon, maxZ: z + epsilon });
    let interior = false;
    for (const edge of ray) {
      if (onSegment(point, edge)) return 0;
      const [[ax, az], [bx, bz]] = edge;
      if ((az > z) !== (bz > z) && x < ax + (bx - ax) * (z - az) / (bz - az)) interior = !interior;
    }
    return interior ? 1 : -1;
  }

  samples(line: Segment) {
    return [...line, ...segmentSamples(line, this.nearby(line))];
  }

  coversLine(line: Segment) { return this.samples(line).every(point => this.side(point) >= 0); }

  covers(other: AreaBoundary) {
    return other.edges.every(edge => this.coversLine(edge)) && !this.interiorOn(other);
  }

  interiorOn(other: AreaBoundary) {
    return this.index.query(other.bounds).some(edge => other.samples(edge).some(point => other.side(point) > 0));
  }

  sharesLine(other: AreaBoundary) {
    return this.index.query(other.bounds).some(edge => other.nearby(edge).some(candidate => {
      const points = [...edge.filter(point => onSegment(point, candidate)), ...candidate.filter(point => onSegment(point, edge))];
      return points.some(point => point[0] !== points[0][0] || point[1] !== points[0][1]);
    }));
  }

  overlaps(other: AreaBoundary) {
    if (this.interiorOn(other) || other.interiorOn(this)) return true;
    // Coincident boundaries overlap only when both inside faces are on the same side.
    return this.index.query(other.bounds).some(edge => other.nearby(edge).some(candidate => {
      const points = [...edge.filter(point => onSegment(point, candidate)), ...candidate.filter(point => onSegment(point, edge))];
      const end = points.find(point => point[0] !== points[0][0] || point[1] !== points[0][1]);
      if (!end) return false;
      const [x, z] = mixPoint(points[0], end, 0.5);
      const dx = end[0] - points[0][0], dz = end[1] - points[0][1];
      const offset = 1e-7 / Math.hypot(dx, dz);
      return [-1, 1].some(sign => {
        const point: Point = [x - sign * dz * offset, z + sign * dx * offset];
        return this.side(point) > 0 && other.side(point) > 0;
      });
    }));
  }
}

function disjoint(areas: readonly AreaBoundary[]) {
  const index = new SpatialIndex(areas.map((area, i) => ({ area, i })), entry => entry.area.bounds);
  for (const [i, area] of areas.entries()) {
    if (index.query(area.bounds).some(other => other.i > i
      && (area.interiorOn(other.area) || other.area.interiorOn(area) || area.sharesLine(other.area)))) {
      throw new Error('Overlapping polygon parts or holes');
    }
  }
}

export function validateArea(area: Area, bounds: Bounds): AreaBoundary {
  const polygons = area.polygons.map(({ outer, holes }) => {
    const shell = new AreaBoundary(validRing(outer, bounds));
    const voids = holes.map(ring => new AreaBoundary(validRing(ring, bounds)));
    if (voids.some(hole => !shell.covers(hole) || shell.sharesLine(hole))) throw new Error('Hole outside polygon');
    disjoint(voids);
    return new AreaBoundary([...shell.edges, ...voids.flatMap(hole => hole.edges)]);
  });
  disjoint(polygons);
  return new AreaBoundary(polygons.flatMap(polygon => polygon.edges));
}
