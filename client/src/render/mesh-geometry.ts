import { BufferGeometry, Float32BufferAttribute, ShapeUtils, Vector2 } from 'three';
import type { Point } from './city-data';
import { parts, type Area, type Ring } from './area-geometry';
import { signedArea } from './map-geometry';

export type Vertex = readonly [x: number, y: number, z: number];
export const raised = ([x, z]: Point, y: number): Vertex => [x, y, z];

export class MeshGeometry {
  readonly positions: number[] = [];
  private readonly shades: number[] = [];

  get faceCount() { return this.positions.length / 9; }

  triangle(a: Vertex, b: Vertex, c: Vertex, shade = 1) {
    this.positions.push(...a, ...b, ...c);
    this.shades.push(shade, shade, shade);
  }

  quad(a: Vertex, b: Vertex, c: Vertex, d: Vertex, shade = 1) {
    this.triangle(a, b, c, shade);
    this.triangle(a, c, d, shade);
  }

  top(a: Vertex, b: Vertex, c: Vertex, shade = 1) {
    const crossY = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    if (crossY > 0) this.triangle(a, b, c, shade);
    else this.triangle(a, c, b, shade);
  }

  topQuad(a: Vertex, b: Vertex, c: Vertex, d: Vertex, shade = 1) {
    this.top(a, b, c, shade);
    this.top(a, c, d, shade);
  }

  surface(points: Ring, elevation: number, shade = 1, holes: readonly Ring[] = []) {
    const vertices = [...points, ...holes.flat()].map(point => raised(point, elevation));
    const vectors = (ring: Ring) => ring.map(([x, z]) => new Vector2(x, z));
    const faces = ShapeUtils.triangulateShape(vectors(points), holes.map(vectors));
    for (const [a, b, c] of faces) this.top(vertices[a], vertices[b], vertices[c], shade);
  }

  area(geometry: Area | Ring, elevation: number, shade = 1) {
    for (const { outer, holes } of parts(geometry)) this.surface(outer, elevation, shade, holes);
  }

  wall(a: Point, b: Point, bottom: number, top: number, clockwise: boolean, shade = 1) {
    const [left, right] = clockwise ? [b, a] : [a, b];
    this.quad(raised(left, bottom), raised(right, bottom), raised(right, top), raised(left, top), shade);
  }

  walls(points: readonly Point[], bottom: number, top: number, shade = 1) {
    const clockwise = signedArea(points) > 0;
    for (let i = 0; i < points.length; i++) {
      this.wall(points[i], points[(i + 1) % points.length], bottom, top, clockwise, shade);
    }
  }

  geometry(from = 0, to = this.faceCount) {
    const colors = this.shades.slice(from * 3, to * 3).flatMap(shade => [shade, shade, shade]);
    return new BufferGeometry()
      .setAttribute('position', new Float32BufferAttribute(this.positions.slice(from * 9, to * 9), 3))
      .setAttribute('color', new Float32BufferAttribute(colors, 3));
  }
}
