import Ajv from 'ajv';
import schema from '../../../content/city-v2.schema.json';
import schemaV3 from '../../../content/city-v3.schema.json';
import { onMillimeterGrid, segmentBounds, SpatialIndex, validateArea, type Area, type Ring } from './area-geometry';
import { isSimpleRing, segments } from './map-geometry';

export type Point = readonly [x: number, z: number];
type Polygon = readonly Point[];

export interface Bounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export interface District<Geometry = Ring> {
  readonly id: string;
  readonly name: string;
  readonly label: Point;
  readonly outline: Geometry;
}

export interface Road {
  readonly id: string;
  readonly kind: 'avenue' | 'street';
  readonly width: number;
  readonly path: readonly Point[];
}

export interface Building<Geometry = Ring> {
  readonly id: string;
  readonly district: string;
  readonly height: number;
  readonly footprint: Geometry;
}

export interface Location {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly district: string;
  readonly building?: string;
  readonly position: Point;
  readonly access: string;
  readonly description: string;
}

type Spawn = { readonly node: string } | { readonly edge: string; readonly offsetMm: number };

interface Navigation {
  readonly start: string;
  readonly nodes: readonly { readonly id: string; readonly position: Point }[];
  readonly edges: readonly {
    readonly id: string;
    readonly a: string;
    readonly b: string;
    readonly mode: 'foot';
    readonly lengthMm: number;
    readonly path: readonly Point[];
  }[];
  readonly spawns: Readonly<Record<string, Spawn>>;
  readonly ambientPatrol: readonly [string, string];
}

interface CityData<Geometry> {
  readonly id: string;
  readonly name: string;
  readonly bounds: Bounds;
  readonly start: Point;
  readonly districts: readonly District<Geometry>[];
  readonly greens: readonly Geometry[];
  readonly roads: readonly Road[];
  readonly buildings: readonly Building<Geometry>[];
  readonly locations: readonly Location[];
  readonly navigation: Navigation;
  readonly waterLabel: { readonly name: string; readonly position: Point };
}

export interface CityV2 extends CityData<Polygon> {
  readonly version: 2;
  readonly land: readonly Polygon[];
}

export interface CityV3 extends Omit<CityData<Area>, 'waterLabel'> {
  readonly version: 3;
  readonly land: Area;
  readonly aoi: Area;
  readonly boundaryMode: 'natural' | 'island';
  readonly waterLabel?: CityV2['waterLabel'];
}

export type City = CityV2 | CityV3;

const ajv = new Ajv();
const matchesSchema = ajv.compile<CityV2>(schema);
const matchesSchemaV3 = ajv.compile<CityV3>(schemaV3);

export function parseCity(value: unknown): City {
  if (!matchesSchema(value) && !matchesSchemaV3(value)) throw new Error('Ungültiges Kartenformat. '
    + ajv.errorsText(typeof value === 'object' && value && 'version' in value && value.version === 3
      ? matchesSchemaV3.errors : matchesSchema.errors));
  const { bounds, districts, roads, buildings, locations, start, waterLabel, navigation } = value;
  if (bounds.minX >= bounds.maxX || bounds.minZ >= bounds.maxZ) {
    throw new Error('Ungültige Kartengrenzen.');
  }

  const ids = [value.id, ...[districts, roads, buildings, locations, navigation.nodes, navigation.edges].flatMap(
    features => features.map(feature => feature.id),
  )];
  if (new Set(ids).size !== ids.length) throw new Error('Doppelte Karten-ID.');

  const polygons = value.version === 2
    ? [...value.land, ...value.greens, ...value.districts.map(d => d.outline), ...value.buildings.map(b => b.footprint)] : [];
  const points = [
    ...polygons.flat(), ...roads.flatMap(r => r.path),
    ...districts.map(d => d.label), ...locations.map(l => l.position), start, ...(waterLabel ? [waterLabel.position] : []),
    ...navigation.nodes.map(node => node.position), ...navigation.edges.flatMap(edge => edge.path),
  ];
  if (points.some(([x, z]) => x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ)) {
    throw new Error('Kartenpunkt außerhalb der Kartengrenzen.');
  }
  for (const polygon of polygons) {
    if (!isSimpleRing(polygon)) throw new Error('Ungültige Fläche im Kartenpolygon.');
  }
  for (const road of roads) segments(road.path, false);

  const districtIds = new Set(districts.map(district => district.id));
  const buildingDistricts = new Map(buildings.map(building => [building.id, building.district]));
  if ([...buildings, ...locations].some(feature => !districtIds.has(feature.district))
    || locations.some(location => location.building && buildingDistricts.get(location.building) !== location.district)) {
    throw new Error('Ungültige Kartenreferenz.');
  }
  const nodes = new Map(navigation.nodes.map(node => [node.id, node.position]));
  const edges = new Map(navigation.edges.map(edge => [edge.id, edge]));
  const samePoint = (a: Point | undefined, b: Point) => a?.[0] === b[0] && a[1] === b[1];
  if (!samePoint(nodes.get(navigation.start), start)
    || locations.some(location => !nodes.has(location.access))
    || navigation.ambientPatrol.some(node => !nodes.has(node))
    || Object.values(navigation.spawns).some(spawn => 'node' in spawn
      ? !nodes.has(spawn.node) : spawn.offsetMm >= (edges.get(spawn.edge)?.lengthMm ?? 0))
    || navigation.edges.some(edge => edge.a === edge.b || !samePoint(nodes.get(edge.a), edge.path[0])
      || !samePoint(nodes.get(edge.b), edge.path[edge.path.length - 1]))) {
    throw new Error('Ungültige Wegenetzreferenz.');
  }
  for (const edge of navigation.edges) segments(edge.path, false);
  if (value.version === 3) {
    if (Object.values(bounds).some(coordinate => !onMillimeterGrid(coordinate))
      || points.some(point => !point.every(onMillimeterGrid))) throw new Error('Kartenpunkt liegt nicht auf dem Millimeterraster.');
    validateCityV3(value);
  }
  return value;
}

function validateCityV3(city: CityV3) {
  const { bounds, navigation } = city;
  const aoi = validateArea(city.aoi, bounds);
  const land = validateArea(city.land, bounds);
  if (!aoi.covers(land)) throw new Error('Land außerhalb der AOI.');
  const validateOnLand = (area: Area) => {
    const boundary = validateArea(area, bounds);
    if (!land.covers(boundary)) throw new Error('Fläche außerhalb des Landes.');
    return boundary;
  };
  for (const green of city.greens) validateOnLand(green);
  for (const district of city.districts) {
    if (validateOnLand(district.outline).side(district.label) < 0) throw new Error('Viertellabel außerhalb des Viertels.');
  }
  if (city.locations.some(location => land.side(location.position) < 0)) throw new Error('Ort außerhalb des Landes.');
  const buildings = new SpatialIndex(city.buildings.map(building => validateOnLand(building.footprint)), area => area.bounds);
  for (const road of city.roads) {
    if (segments(road.path, false).some(line => !aoi.coversLine(line))) throw new Error('Straße außerhalb der AOI.');
  }

  const adjacency = new Map(navigation.nodes.map(node => [node.id, [] as string[]]));
  const positions = new Set(navigation.nodes.map(node => node.position.join('/')));
  const ambient = navigation.spawns['ambient-01'];
  if (positions.size !== navigation.nodes.length || new Set(city.locations.map(location => location.access)).size !== city.locations.length
    || !('node' in ambient) || ambient.node !== navigation.ambientPatrol[0]) {
    throw new Error('Ungültige Start-, Orts- oder Knotenposition.');
  }
  for (const edge of navigation.edges) {
    let length = 0;
    for (const segment of segments(edge.path, false)) {
      const [[ax, az], [bx, bz]] = segment;
      length += Math.round(Math.hypot(Math.round(bx * 1000) - Math.round(ax * 1000),
        Math.round(bz * 1000) - Math.round(az * 1000)));
      if (!land.coversLine(segment) || buildings.query(segmentBounds(segment))
        .some(building => building.samples(segment).some(point => building.side(point) >= 0))) {
        throw new Error('Blockierte Fußkante: ' + edge.id);
      }
    }
    if (length !== edge.lengthMm) throw new Error('Ungültige Fußkantenlänge: ' + edge.id);
    adjacency.get(edge.a)!.push(edge.b);
    adjacency.get(edge.b)!.push(edge.a);
  }
  const queue = [navigation.start];
  const reached = new Set(queue);
  for (let i = 0; i < queue.length; i++) {
    for (const id of adjacency.get(queue[i])!) {
      if (reached.has(id)) continue;
      reached.add(id);
      queue.push(id);
    }
  }
  if (queue.length !== adjacency.size) throw new Error('Getrennte Komponenten im Fußwegenetz.');
}
