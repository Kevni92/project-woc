import type { Bounds, Point } from './city-data';

export type Segment = readonly [Point, Point];
const epsilon = 1e-9;
const cross = (ax: number, az: number, bx: number, bz: number) => ax * bz - az * bx;

export function segments(points: readonly Point[], closed: boolean): Segment[] {
  return points.slice(0, closed ? points.length : -1).map((point, index) => {
    const next = points[(index + 1) % points.length];
    if (point[0] === next[0] && point[1] === next[1]) throw new Error('Kartensegment ohne Länge.');
    return [point, next];
  });
}

export function mixPoint([ax, az]: Point, [bx, bz]: Point, t: number): Point {
  return [ax + (bx - ax) * t, az + (bz - az) * t];
}

export function signedArea(points: readonly Point[]) {
  return points.reduce((area, [x, z], i) => {
    const [nextX, nextZ] = points[(i + 1) % points.length];
    return area + x * nextZ - nextX * z;
  }, 0) / 2;
}

export function inBounds([x, z]: Point, bounds: Bounds) {
  return x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ;
}

export function onSegment([x, z]: Point, [[ax, az], [bx, bz]]: Segment) {
  return x >= Math.min(ax, bx) - epsilon && x <= Math.max(ax, bx) + epsilon
    && z >= Math.min(az, bz) - epsilon && z <= Math.max(az, bz) + epsilon
    && Math.abs(cross(x - ax, z - az, bx - ax, bz - az)) <= epsilon * Math.hypot(bx - ax, bz - az);
}

export function ringEdges(ring: readonly Point[]): Segment[] {
  return ring.map((point, index) => [point, ring[(index + 1) % ring.length]]);
}

// Classifies points on the boundary separately so land contact can be tested explicitly.
export function ringSide([x, z]: Point, ring: readonly Point[]): -1 | 0 | 1 {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, az] = ring[j];
    const [bx, bz] = ring[i];
    if (onSegment([x, z], [ring[j], ring[i]])) return 0;
    if ((az > z) !== (bz > z) && x < ax + (bx - ax) * (z - az) / (bz - az)) inside = !inside;
  }
  return inside ? 1 : -1;
}

function projection([x, z]: Point, [[ax, az], [bx, bz]]: Segment) {
  const dx = bx - ax;
  const dz = bz - az;
  return ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz);
}

export function distanceSquaredToSegment(point: Point, segment: Segment) {
  const t = Math.max(0, Math.min(1, projection(point, segment)));
  const closest = mixPoint(...segment, t);
  return (point[0] - closest[0]) ** 2 + (point[1] - closest[1]) ** 2;
}

// Returns parameters on the first segment, including the ends of any collinear overlap.
function intersectionParameters(first: Segment, second: Segment): number[] {
  const [[ax, az], [bx, bz]] = first;
  const [[cx, cz], [dx, dz]] = second;
  const uX = bx - ax;
  const uZ = bz - az;
  const vX = dx - cx;
  const vZ = dz - cz;
  const det = cross(uX, uZ, vX, vZ);
  if (Math.abs(det) < 1e-14) {
    return [
      ...second.filter(point => onSegment(point, first)).map(point => projection(point, first)),
      ...first.flatMap((point, index) => onSegment(point, second) ? [index] : []),
    ];
  }
  const t = cross(cx - ax, cz - az, vX, vZ) / det;
  const s = cross(cx - ax, cz - az, uX, uZ) / det;
  return t >= -epsilon && t <= 1 + epsilon && s >= -epsilon && s <= 1 + epsilon ? [t] : [];
}

export function intersects(first: Segment, second: Segment) {
  return intersectionParameters(first, second).length > 0;
}

export function distanceSquaredBetween(first: Segment, second: Segment) {
  if (intersects(first, second)) return 0;
  return Math.min(
    ...first.map(point => distanceSquaredToSegment(point, second)),
    ...second.map(point => distanceSquaredToSegment(point, first)),
  );
}

export function segmentSamples(segment: Segment, boundaries: readonly Segment[]) {
  const cuts = [0, 1, ...boundaries.flatMap(edge => intersectionParameters(segment, edge))]
    .filter(t => t >= 0 && t <= 1).sort((a, b) => a - b);
  return cuts.slice(1).flatMap((end, i) => end - cuts[i] > epsilon
    ? [mixPoint(...segment, (cuts[i] + end) / 2)] : []);
}

export function isSimpleRing(ring: readonly Point[]) {
  if (Math.abs(signedArea(ring)) < epsilon) return false;
  const edges = ringEdges(ring);
  return edges.every((edge, i) => {
    const previous = edges[(i + edges.length - 1) % edges.length];
    if (onSegment(previous[0], edge) || onSegment(edge[1], previous)) return false;
    return edges.slice(i + 2).every((other, j) =>
      (i === 0 && j === edges.length - 3) || !intersects(edge, other));
  });
}

export function containsRing(outer: readonly Point[], inner: readonly Point[]) {
  const boundary = ringEdges(outer);
  return inner.every(point => ringSide(point, outer) >= 0)
    && ringEdges(inner).every(edge => segmentSamples(edge, boundary).every(point => ringSide(point, outer) >= 0));
}

export function ringsTouch(first: readonly Point[], second: readonly Point[]) {
  const edges = ringEdges(second);
  return ringSide(first[0], second) >= 0 || ringSide(second[0], first) >= 0
    || ringEdges(first).some(edge => edges.some(other => intersects(edge, other)));
}
