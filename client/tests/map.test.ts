import { Raycaster, Vector2, Vector3 } from 'three';
import { describe, expect, test } from 'vitest';
import { parseCity } from '../src/render/city-data';
import { parseTheme, parseVisuals } from '../src/render/visual-data';
import { packageJson } from './package-files';
import { longRectangle } from '../src/render/building-layer';
import type { Point } from '../src/render/city-data';
import { GeographyLayer } from '../src/render/geography-layer';
import { layoutMarkers, placePopover } from '../src/render/map-anchors';
import { detailAt, MapCamera, visibilityAt } from '../src/render/map-camera';
import { MapPalette, twilight } from '../src/render/palette';
import { roadMarkings } from '../src/render/road-layer';
import { depthSamples, extendLand } from '../src/render/water-layer';
import { segments } from '../src/render/map-geometry';
import type { ClientState } from '../src/simulation/simulation-client';
import { projectMap } from '../src/ui/map-projection';

const definition = packageJson('breakwater', 'world.json');
const city = parseCity(definition);
const theme = parseTheme(packageJson('breakwater', 'theme.json'));
const visuals = parseVisuals(packageJson('breakwater', 'visual.json'), city, theme);

function contains(polygon: readonly Point[], [x, z]: Point): boolean {
  let inside = false;
  for (let a = 0, b = polygon.length - 1; a < polygon.length; b = a++) {
    const [ax, az] = polygon[a];
    const [bx, bz] = polygon[b];
    if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) inside = !inside;
  }
  return inside;
}

describe('city definition', () => {
  test('contains the required features and the spawn area in host coordinates', () => {
    expect(city.id).toBe('p0-test-world');
    expect(city.districts).toHaveLength(3);
    expect(city.locations.length).toBeGreaterThanOrEqual(6);
    expect(city.buildings.length).toBeGreaterThanOrEqual(30);
    expect(city.buildings.length).toBeLessThanOrEqual(50);
    for (const actor of [[0, 0], [10, 4], [4, 4], [134, 4]] as const) {
      expect(city.land.some(outline => contains(outline, actor))).toBe(true);
      expect(city.buildings.some(building => contains(building.footprint, actor))).toBe(false);
    }
    for (const location of city.locations) {
      expect(city.land.some(outline => contains(outline, location.position))).toBe(true);
      expect(city.navigation.nodes.some(node => node.id === location.access)).toBe(true);
    }
  });

  test('rejects bad bounds, duplicate IDs, invalid geometry and broken references', () => {
    expect(() => parseCity({ ...definition, version: 1 })).toThrow('Kartenformat');
    expect(() => parseCity({ ...definition, start: [9999, 0] })).toThrow('Kartengrenzen');
    expect(() => parseCity({ ...definition, roads: [...definition.roads, definition.roads[0]] })).toThrow('Karten-ID');
    expect(() => parseCity({ ...definition, greens: [[[1, 2], [2, 4], [3, 6]]] })).toThrow('Fläche');
    expect(() => parseCity({ ...definition, locations: [{ ...definition.locations[0], building: 'missing' }] }))
      .toThrow('Kartenreferenz');
    expect(() => parseCity({ ...definition, locations: [{ ...definition.locations[0], access: 'missing' }] }))
      .toThrow('Wegenetzreferenz');
  });
});

describe('map presentation', () => {
  test('zooms around the pointer across LODs, including intermediate frames', () => {
    const view = new MapCamera(city.bounds, theme.lod);
    view.resize(1000, 600);
    view.advance(0, true);
    expect(view.detail).toBe(0);
    const cursor = new Vector2(0.4, -0.35);
    const atCursor = view.groundAt(cursor);
    view.zoom(0.09, cursor);
    for (let frame = 0; frame < 30; frame++) {
      view.advance(1 / 60);
      expect(view.groundAt(cursor).distanceTo(atCursor)).toBeLessThan(0.0001);
    }
    expect(view.detail).toBe(1);
    expect(detailAt(300, theme.lod)).toBeGreaterThan(detailAt(500, theme.lod));
    expect(detailAt(650, theme.lod)).toBe(0);

    view.focus([10, 5]);
    view.advance(0, true);
    expect(view.groundAt(new Vector2()).distanceTo(new Vector3(10, 0, 5))).toBeLessThan(0.0001);
    view.pan(new Vector2(), cursor);
    expect(view.groundAt(cursor).distanceTo(new Vector3(10, 0, 5))).toBeLessThan(0.0001);
    view.reset();
    view.resize(380, 580);
    view.advance(0, true);
    for (const x of [city.bounds.minX, city.bounds.maxX]) {
      expect(Math.abs(new Vector3(x, 0, 0).project(view.camera).x)).toBeLessThan(1);
    }
  });

  test('keeps dense hit targets apart with their world anchors intact', () => {
    const anchors = [
      { id: 'ada', x: 150, y: 140 }, { id: 'ben', x: 152, y: 142 }, { id: 'cafe', x: 158, y: 136 },
    ];
    const [ada, ben, cafe] = layoutMarkers(anchors, 360, 400);
    expect(ada).toMatchObject({ ...anchors[0], dx: 0, dy: 0 });
    expect(ben).toMatchObject(anchors[1]);
    expect(cafe).toMatchObject(anchors[2]);
    expect(Math.hypot(ben.x + ben.dx - cafe.x - cafe.dx, ben.y + ben.dy - cafe.y - cafe.dy)).toBeGreaterThan(34);
  });

  test('rotates in both directions around the pivot with stable projection and cursor zoom', () => {
    const view = new MapCamera(city.bounds, theme.lod);
    view.resize(1440, 960);
    const pivot = new Vector3(40, 0, 10);
    const pointer = new Vector2(0.43, -0.34);
    const north = pivot.clone().add(new Vector3(0, 0, -20));
    view.advance(0, true);
    for (const direction of [1, -1]) {
      for (let quarter = 1; quarter <= 4; quarter++) {
        view.rotate(direction * Math.PI / 2, true);
        expect(view.groundAt(new Vector2()).distanceTo(pivot)).toBeLessThan(1e-6);
        const screen = north.clone().project(view.camera);
        const projectedAngle = Math.atan2(screen.x * 1.5, screen.y);
        expect(Math.sin(projectedAngle - view.northAngle)).toBeCloseTo(0);
        expect(Math.cos(projectedAngle - view.northAngle)).toBeCloseTo(1);
        expect(Math.sin(view.northAngle)).toBeCloseTo(Math.sin(direction * quarter * Math.PI / 2));
      }
    }
    view.rotate(Math.PI - 0.05, true);
    view.rotate(0.1);
    view.advance(1 / 60);
    expect(view.northAngle).toBeGreaterThan(Math.PI - 0.05);
    view.advance(0, true);
    const world = view.groundAt(pointer);
    view.zoom(0.08, pointer);
    view.advance(0, true);
    expect(view.detail).toBe(1);
    expect(view.groundAt(pointer).distanceTo(world)).toBeLessThan(1e-6);
    view.focus([40, 10]);
    view.resize(375, 812);
    view.advance(0, true);
    expect(view.groundAt(new Vector2()).distanceTo(pivot)).toBeLessThan(1e-6);
    expect(Math.abs(view.northAngle)).toBeGreaterThan(3);
    view.orientNorth();
    view.advance(0, true);
    expect(view.northAngle).toBeCloseTo(0);
  });

  test('places context beside the pin and clamps against the HUD bounds', () => {
    const area = { left: 15, top: 110, width: 900, height: 600 };
    expect(placePopover(area, 240, 150, { id: 'pin', x: 880, y: 120 }))
      .toEqual({ left: 616, top: 110, x: 856, y: 120 });
    expect(placePopover(area, 240, 150, { id: 'pin', x: 0, y: 716 })).toMatchObject({ left: 24, top: 560 });
    expect(placePopover(area, 240, 150)).toEqual({ left: 675, top: 110 });
    const neighbor = { id: 'neighbor', x: 545, y: 485 };
    expect(placePopover(area, 240, 150, { id: 'pin', x: 500, y: 500 }, [neighbor]))
      .toMatchObject({ left: 236 });
  });

  test('blends the palette by server game minutes and wraps at midnight', () => {
    expect([0, 300, 360, 420, 1080, 1140, 1200, 1440].map(twilight)).toEqual([0, 0, 0.5, 1, 1, 0.5, 0, 0]);
    const night = new MapPalette(theme).at(twilight(0));
    const palette = new MapPalette(theme);
    const dayShallows = palette.at(twilight(480)).waterShallow.clone();
    expect(palette.at(twilight(360)).waterShallow).toEqual(night.waterShallow.clone().lerp(dayShallows, 0.5));
    expect(night.roadLocal.getHex()).not.toBe(night.land.getHex());
    expect(night.roofResidential.getHex()).not.toBe(night.waterHorizon.getHex());
    expect(palette.at(twilight(1440))).toEqual(night);
  });
});

describe('cartographic geometry', () => {
  test('uses long-axis ridges, rejects trapezoids and picks the same building in flat and tilted views', () => {
    const house = city.buildings.find(({ id }) => id === 'north-01')!;
    const ridge = longRectangle(house.footprint)!;
    expect(ridge.slice(0, 2)).toEqual([[-448, -393], [-448, -332]]);
    expect(longRectangle([[0, 0], [8, 0], [6, 6], [0, 6]])).toBeUndefined();
    const layer = new GeographyLayer(city, visuals, theme);
    const view = new MapCamera(city.bounds, theme.lod);
    const ray = new Raycaster();
    try {
      view.resize(1440, 960);
      for (const [detail, angle] of [[0, Math.PI / 2], [0.5, Math.PI], [1, Math.PI * 1.5]]) {
        view.focus([-465, -364], detail === 0 ? 800 : detail < 1 ? 392.5 : 76);
        view.rotate(angle);
        view.advance(0, true);
        layer.setDetail(view.detail, visibilityAt(view.verticalSpan, theme.lod.facadeSpanM), 0);
        layer.group.updateMatrixWorld(true);
        const roof = new Vector3(-468, 0.42 + view.detail * (house.height - 0.3), -364)
          .project(view.camera);
        ray.setFromCamera(new Vector2(roof.x, roof.y), view.camera);
        expect(layer.pickBuilding(ray)).toBe(house.id);
      }
      expect(visibilityAt(90, theme.lod.facadeSpanM)).toBe(1);
      expect(visibilityAt(117, theme.lod.facadeSpanM)).toBeGreaterThan(0);
      expect(visibilityAt(135, theme.lod.facadeSpanM)).toBe(0);
    } finally {
      layer.dispose();
    }
  });

  test('water depth samples follow the physical coast and have no false shoreline along map cuts', () => {
    const coast = visuals.coasts.flatMap(({ path }) => segments(path, false));
    const { skirts, coast: renderedCoast } = extendLand(city, coast, 800);
    expect(skirts).toHaveLength(3);
    expect(renderedCoast).toHaveLength(coast.length + 2);
    const depth = depthSamples({ minX: 0, maxX: 100, minZ: 0, maxZ: 100 }, [[[10, 0], [10, 100]]], 10, 75);
    expect(depth[1]).toBeLessThan(depth[3]);
    expect(depth[3]).toBeLessThan(depth[6]);
    expect(depth[9]).toBe(255);
    expect(depth.slice(0, 10)).toEqual(depth.slice(90));
  });

  test('road markings retain their phase at waypoints and end within the centerline', () => {
    const segments = roadMarkings([[0, 0], [7, 0], [14, 0], [14, 9]], 6, 4);
    expect(segments).toEqual([[[2, 0], [7, 0]], [[7, 0], [8, 0]], [[12, 0], [14, 0]],
      [[14, 0], [14, 4]], [[14, 8], [14, 9]]]);
  });
});

test('projects only the current public characters and private control state', () => {
  const state: ClientState = {
    status: 'connected', sessionId: 's1', synchronizing: false, error: null,
    view: {
      revision: 4, worldTick: 2, gameMinutes: 482, snapshotSequence: 2,
      controlled: { id: 'ada', cash: 100, positionRevision: 2, locationId: null, travel: {
        locationId: 'market', startTick: 1, progressMm: 66666, remainingTicks: 1,
        route: { distanceMm: 125000, durationTicks: 2, points: [{ x: 0, z: 0 }, { x: 89, z: -28 }], edgeIds: ['path-market-01'] },
      } },
      characters: [
        { id: 'ada', name: 'Ada', position: { x: 1, z: 0 }, eligible: true, occupied: true, status: 'Traveling' },
        { id: 'ben', name: 'Ben', position: { x: 10, z: 4 }, eligible: true, occupied: false, status: 'Idle' },
        { id: 'kim', name: 'Kim', position: { x: 20, z: 10 }, eligible: true, occupied: true, status: 'Idle' },
        { id: 'npc', name: 'Passant', position: { x: 6, z: 2 }, eligible: false, occupied: false, status: 'Traveling' },
      ],
    },
  };
  const projected = projectMap(state);
  expect(projected.markers.map(marker => marker.kind)).toEqual(['owned', 'resident', 'occupied', 'ambient']);
  expect(projected.controlled).toMatchObject({ id: 'ada', position: [1, 0] });
  expect(projected.markers[3].position).toEqual([6, 2]);
  expect(projected.markers.every(marker => !Object.hasOwn(marker, 'cash'))).toBe(true);
  expect(projected.cash).toBe(100);
  expect(projected.travel?.remainingTicks).toBe(1);
  expect(projected.canCommand).toBe(true);
  expect(projectMap(state, true).canCommand).toBe(false);
  for (const unavailable of [
    { ...state, synchronizing: true }, { ...state, status: 'disconnected' } as const,
  ]) {
    expect(projectMap(unavailable)).toMatchObject({
      canCommand: false, markers: [], cash: undefined, controlled: undefined, travel: undefined,
    });
  }
});
