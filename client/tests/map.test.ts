import { Vector2, Vector3 } from 'three';
import { describe, expect, test } from 'vitest';
import definition from '../../content/breakwater.json';
import { city, parseCity } from '../src/render/city-data';
import type { Point } from '../src/render/city-data';
import { layoutMarkers } from '../src/render/map-anchors';
import { detailAt, MapCamera } from '../src/render/map-camera';
import { paletteAt, twilight } from '../src/render/palette';
import type { ClientState } from '../src/simulation/simulation-client';
import { projectMap } from '../src/ui/map-projection';

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
    for (const actor of [[0, 0], [10, 5], [4, 2], [5, 2], [6, 2]] as const) {
      expect(city.land.some(outline => contains(outline, actor))).toBe(true);
      expect(city.buildings.some(building => contains(building.footprint, actor))).toBe(false);
    }
    for (const location of city.locations) {
      expect(city.land.some(outline => contains(outline, location.position))).toBe(true);
    }
  });

  test('rejects bad bounds, duplicate IDs, invalid geometry and broken references', () => {
    expect(() => parseCity({ ...definition, version: 2 })).toThrow('Kartenformat');
    expect(() => parseCity({ ...definition, start: [9999, 0] })).toThrow('Kartengrenzen');
    expect(() => parseCity({ ...definition, roads: [...definition.roads, definition.roads[0]] })).toThrow('Karten-ID');
    expect(() => parseCity({ ...definition, greens: [[[1, 2], [2, 4], [3, 6]]] })).toThrow('Fläche');
    expect(() => parseCity({ ...definition, locations: [{ ...definition.locations[0], building: 'missing' }] }))
      .toThrow('Kartenreferenz');
  });
});

describe('map presentation', () => {
  test('zooms around the pointer across LODs, including intermediate frames', () => {
    const view = new MapCamera(city.bounds);
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
    expect(detailAt(300)).toBeGreaterThan(detailAt(500));
    expect(detailAt(650)).toBe(0);

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

  test('blends the palette by server game minutes and wraps at midnight', () => {
    expect([0, 300, 360, 420, 1080, 1140, 1200, 1440].map(twilight)).toEqual([0, 0, 0.5, 1, 1, 0.5, 0, 0]);
    const night = paletteAt(0);
    const day = paletteAt(480);
    expect(paletteAt(360).water).toEqual(night.water.clone().lerp(day.water, 0.5));
    expect(night.street.getHex()).not.toBe(night.land.getHex());
    expect(night.roof.getHex()).not.toBe(night.water.getHex());
    expect(paletteAt(1440)).toEqual(night);
  });
});

test('projects only the current public characters and private control state', () => {
  const state: ClientState = {
    status: 'connected', sessionId: 's1', synchronizing: false, error: null,
    view: {
      revision: 4, worldTick: 2, gameMinutes: 482, controlled: { id: 'ada', cash: 110 },
      characters: [
        { id: 'ada', name: 'Ada', position: { x: 1, z: 0 }, eligible: true, occupied: true },
        { id: 'ben', name: 'Ben', position: { x: 10, z: 5 }, eligible: true, occupied: false },
        { id: 'kim', name: 'Kim', position: { x: 20, z: 10 }, eligible: true, occupied: true },
        { id: 'npc', name: 'Passant', position: { x: 6, z: 2 }, eligible: false, occupied: false },
      ],
    },
  };
  const projected = projectMap(state);
  expect(projected.markers.map(marker => marker.kind)).toEqual(['owned', 'resident', 'occupied', 'ambient']);
  expect(projected.controlled).toMatchObject({ id: 'ada', position: [1, 0] });
  expect(projected.markers[3].position).toEqual([6, 2]);
  expect(projected.markers.every(marker => !Object.hasOwn(marker, 'cash'))).toBe(true);
  expect(projected.cash).toBe(110);
  expect(projected.canCommand).toBe(true);
  expect(projectMap(state, true).canCommand).toBe(false);
  for (const unavailable of [
    { ...state, synchronizing: true }, { ...state, status: 'disconnected' } as const,
  ]) {
    expect(projectMap(unavailable)).toMatchObject({ canCommand: false, markers: [], cash: undefined, controlled: undefined });
  }
});
