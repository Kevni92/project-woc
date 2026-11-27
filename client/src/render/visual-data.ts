import Ajv from 'ajv';
import visualSchema from '../../../content/city-visual-v1.schema.json';
import themeSchema from '../../../content/map-theme-v1.schema.json';
import type { City, Point } from './city-data';
import {
  containsRing, distanceSquaredBetween, inBounds, intersects, isSimpleRing, onSegment,
  ringEdges, ringsTouch, ringSide, segmentSamples, segments, type Segment,
} from './map-geometry';

export type BuildingProfile = 'residential' | 'commercial' | 'warehouse';
export type Roof = 'flat' | 'gabled';
export type Windows = 'none' | 'subtle' | 'bands';

export interface BuildingAppearance {
  readonly buildingId: string;
  readonly profile: BuildingProfile;
  readonly roof?: Roof;
  readonly roofHeightM?: number;
  readonly windows?: Windows;
}

export interface RoadAppearance {
  readonly roadId: string;
  readonly profile: 'main' | 'local';
  readonly markings?: 'none' | 'center';
  readonly sidewalkWidthM?: number;
}

export type SurfaceKind = 'parcel' | 'grass' | 'plaza' | 'promenade' | 'beach';

export interface MapVisuals {
  readonly visualVersion: 1;
  readonly worldId: string;
  readonly worldVersion: number;
  readonly revision?: number;
  readonly buildings: readonly BuildingAppearance[];
  readonly roads: readonly RoadAppearance[];
  readonly surfaces: readonly { id: string; kind: SurfaceKind; polygon: readonly Point[] }[];
  readonly coasts: readonly { id: string; path: readonly Point[] }[];
  readonly decorations: readonly { id: string; kind: 'pier'; polygon: readonly Point[]; elevationM: number }[];
}

export type ColorRole = keyof typeof themeSchema.definitions.palette.properties;
export interface MapLod {
  readonly flatSpanM: number;
  readonly fullHeightSpanM: number;
  readonly facadeSpanM: number;
  readonly markingsSpanM: number;
}
interface BuildingRules {
  readonly roof: Roof;
  readonly roofFraction: number;
  readonly flatDetail: 'none' | 'parapet' | 'raised';
  readonly trimHeightM: number;
  readonly windows: Windows;
  readonly floorHeightM: number;
  readonly windowSpacingM: number;
}
export interface MapTheme {
  readonly themeVersion: 1;
  readonly id: string;
  readonly day: Readonly<Record<ColorRole, string>>;
  readonly night: Readonly<Record<ColorRole, string>>;
  readonly layerStepM: number;
  readonly lod: MapLod;
  readonly water: { readonly resolution: number; readonly distanceM: readonly [number, number, number] };
  readonly roads: {
    readonly edgeFraction: number;
    readonly markingFraction: number;
    readonly dashLengthM: number;
    readonly dashGapM: number;
  };
  readonly buildings: Readonly<Record<BuildingProfile, BuildingRules>>;
}

const ajv = new Ajv();
const matchesVisual = ajv.compile<MapVisuals>(visualSchema);
const matchesTheme = ajv.compile<MapTheme>(themeSchema);

export function parseTheme(value: unknown): MapTheme {
  if (!matchesTheme(value)) throw new Error('Ungültiges Kartentheme. ' + ajv.errorsText(matchesTheme.errors));
  const { lod, water, buildings } = value;
  if (!(lod.facadeSpanM <= lod.fullHeightSpanM && lod.fullHeightSpanM < lod.flatSpanM
    && lod.markingsSpanM <= lod.flatSpanM)) throw new Error('Ungültige Detailgrenzen im Kartentheme.');
  const [mid, deep, horizon] = water.distanceM;
  if (!(mid < deep && deep < horizon)) throw new Error('Ungültige Wasserabstände im Kartentheme.');
  for (const [profile, rules] of Object.entries(buildings)) {
    if (rules.flatDetail !== 'none' && rules.trimHeightM <= 0) {
      throw new Error('Fehlende Dachaufbauhöhe im Kartentheme: ' + profile);
    }
  }
  return value;
}

export function parseVisuals(value: unknown, city: City, theme: MapTheme): MapVisuals {
  if (!matchesVisual(value)) throw new Error('Ungültiges Karten-Visualformat. ' + ajv.errorsText(matchesVisual.errors));
  if (value.worldId !== city.id || value.worldVersion !== city.version) {
    throw new Error('Visualdaten passen nicht zur Welt-ID oder Weltversion.');
  }
  const buildings = new Map(city.buildings.map(building => [building.id, building]));
  const roads = new Map(city.roads.map(road => [road.id, road]));
  const ids = new Set([
    city.id, ...buildings.keys(), ...roads.keys(),
    ...[city.districts, city.locations, city.navigation.nodes, city.navigation.edges].flatMap(items => items.map(item => item.id)),
  ]);
  for (const { id } of [...value.surfaces, ...value.coasts, ...value.decorations]) {
    if (ids.has(id)) throw new Error('Doppelte Karten-ID in Visualdaten: ' + id);
    ids.add(id);
  }
  const buildingOverrides = new Set<string>();
  for (const { buildingId, profile, roof, roofHeightM } of value.buildings) {
    const building = buildings.get(buildingId);
    if (!building || buildingOverrides.has(buildingId)) throw new Error('Ungültige Gebäude-Referenz: ' + buildingId);
    buildingOverrides.add(buildingId);
    if (roofHeightM !== undefined && (roofHeightM >= building.height || (roof ?? theme.buildings[profile].roof) !== 'gabled')) {
      throw new Error('Ungültige Dachhöhe: ' + buildingId);
    }
  }
  const roadOverrides = new Set<string>();
  for (const { roadId, sidewalkWidthM } of value.roads) {
    const road = roads.get(roadId);
    if (!road || roadOverrides.has(roadId)) throw new Error('Ungültige Straßen-Referenz: ' + roadId);
    roadOverrides.add(roadId);
    if (sidewalkWidthM !== undefined && sidewalkWidthM * 2 > road.width * 0.4) {
      throw new Error('Gehwegbreite außerhalb des Straßenkorridors: ' + roadId);
    }
  }

  const landEdges = city.land.flatMap(ringEdges);
  const landAt = (point: Point) => city.land.some(ring => ringSide(point, ring) === 1);
  const coastEdges: Segment[] = [];
  const { bounds } = city;
  for (const { id, path } of value.coasts) {
    if (!path.every(point => inBounds(point, bounds))) throw new Error('Küste außerhalb der Kartengrenzen: ' + id);
    for (const edge of segments(path, false)) {
      const [[x, z], [nextX, nextZ]] = edge;
      const mapEdge = (x === nextX && (x === bounds.minX || x === bounds.maxX))
        || (z === nextZ && (z === bounds.minZ || z === bounds.maxZ));
      if (mapEdge || !landEdges.some(border => edge.every(point => onSegment(point, border)))) {
        throw new Error('Küste liegt nicht auf einer physischen Landgrenze: ' + id);
      }
      const length = Math.hypot(nextX - x, nextZ - z);
      const dx = (nextZ - z) * 0.001 / length;
      const dz = (x - nextX) * 0.001 / length;
      if (segmentSamples(edge, landEdges).some(([px, pz]) =>
        landAt([px + dx, pz + dz]) === landAt([px - dx, pz - dz]))) {
        throw new Error('Küste grenzt nicht zugleich an Land und Wasser: ' + id);
      }
      coastEdges.push(edge);
    }
  }

  const corridors = city.roads.map(road => ({ width: road.width, edges: segments(road.path, false) }));
  for (const { id, polygon, kind } of [...value.surfaces, ...value.decorations]) {
    if (!polygon.every(point => inBounds(point, bounds)) || !isSimpleRing(polygon)) {
      throw new Error('Ungültiges Visualpolygon oder Kartengrenze: ' + id);
    }
    const edges = ringEdges(polygon);
    if (city.buildings.some(building => ringsTouch(polygon, building.footprint))
      || corridors.some(({ width, edges: paths }) => paths.some(path =>
        ringSide(path[0], polygon) >= 0 || edges.some(edge => distanceSquaredBetween(path, edge) < width ** 2 / 4)))) {
      throw new Error('Visualpolygon berührt Gebäude oder Straßenkorridor: ' + id);
    }
    if (kind === 'pier') {
      const touchesCoast = edges.some(edge => coastEdges.some(coast => intersects(edge, coast)));
      if (!touchesCoast || !polygon.some(landAt)
        || !polygon.some(point => city.land.every(ring => ringSide(point, ring) === -1))) {
        throw new Error('Steg braucht Landanschluss und Wasseranteil: ' + id);
      }
    } else if (!city.land.some(ring => containsRing(ring, polygon))) {
      throw new Error('Visualfläche liegt nicht vollständig auf Land: ' + id);
    }
  }
  return value;
}
