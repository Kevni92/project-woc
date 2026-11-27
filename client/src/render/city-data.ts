import Ajv from 'ajv';
import definition from '../../../content/breakwater.json';
import schema from '../../../content/city-v1.schema.json';

export type Point = readonly [x: number, z: number];
type Polygon = readonly Point[];

export interface Bounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export interface District {
  readonly id: string;
  readonly name: string;
  readonly label: Point;
  readonly outline: Polygon;
}

export interface Road {
  readonly id: string;
  readonly kind: 'avenue' | 'street';
  readonly width: number;
  readonly path: readonly Point[];
}

export interface Building {
  readonly id: string;
  readonly district: string;
  readonly height: number;
  readonly footprint: Polygon;
}

export interface Location {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly district: string;
  readonly building?: string;
  readonly position: Point;
  readonly description: string;
}

export interface City {
  readonly version: 1;
  readonly id: string;
  readonly name: string;
  readonly bounds: Bounds;
  readonly start: Point;
  readonly land: readonly Polygon[];
  readonly districts: readonly District[];
  readonly greens: readonly Polygon[];
  readonly roads: readonly Road[];
  readonly buildings: readonly Building[];
  readonly locations: readonly Location[];
  readonly waterLabel: { readonly name: string; readonly position: Point };
}

const ajv = new Ajv();
const matchesSchema = ajv.compile<City>(schema);

export function parseCity(value: unknown): City {
  if (!matchesSchema(value)) {
    throw new Error('Ungültiges Kartenformat. ' + ajv.errorsText(matchesSchema.errors));
  }
  const { bounds, land, greens, districts, roads, buildings, locations, start, waterLabel } = value;
  if (bounds.minX >= bounds.maxX || bounds.minZ >= bounds.maxZ) {
    throw new Error('Ungültige Kartengrenzen.');
  }

  const ids = [value.id, ...[districts, roads, buildings, locations].flatMap(
    features => features.map(feature => feature.id),
  )];
  if (new Set(ids).size !== ids.length) throw new Error('Doppelte Karten-ID.');

  const polygons = [...land, ...greens, ...districts.map(d => d.outline), ...buildings.map(b => b.footprint)];
  const points = [
    ...polygons.flat(), ...roads.flatMap(r => r.path),
    ...districts.map(d => d.label), ...locations.map(l => l.position), start, waterLabel.position,
  ];
  if (points.some(([x, z]) => x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ)) {
    throw new Error('Kartenpunkt außerhalb der Kartengrenzen.');
  }
  for (const polygon of polygons) {
    let area = 0;
    for (const [[x, z], [nextX, nextZ]] of segments(polygon, true)) area += x * nextZ - nextX * z;
    if (area === 0) throw new Error('Kartenpolygon ohne Fläche.');
  }
  for (const road of roads) segments(road.path, false);

  const districtIds = new Set(districts.map(district => district.id));
  const buildingDistricts = new Map(buildings.map(building => [building.id, building.district]));
  if ([...buildings, ...locations].some(feature => !districtIds.has(feature.district))
    || locations.some(location => location.building && buildingDistricts.get(location.building) !== location.district)) {
    throw new Error('Ungültige Kartenreferenz.');
  }
  return value;
}

export function segments(points: readonly Point[], closed: boolean): [Point, Point][] {
  return points.slice(0, closed ? points.length : -1).map((point, index) => {
    const next = points[(index + 1) % points.length];
    if (point[0] === next[0] && point[1] === next[1]) throw new Error('Kartensegment ohne Länge.');
    return [point, next];
  });
}

export const city = parseCity(definition);
