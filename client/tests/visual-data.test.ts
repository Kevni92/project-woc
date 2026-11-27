import { describe, expect, test } from 'vitest';
import { parseCity } from '../src/render/city-data';
import { validateArea } from '../src/render/area-geometry';
import { containsRing, distanceSquaredBetween, isSimpleRing } from '../src/render/map-geometry';
import { MeshGeometry } from '../src/render/mesh-geometry';
import { parseTheme, parseVisuals } from '../src/render/visual-data';
import { packageJson } from './package-files';

const cove = { world: packageJson('cove', 'world.json'), visuals: packageJson('cove', 'visual.json') };
const coastal = packageJson('breakwater', 'theme.json');
const world = parseCity(cove.world);
const theme = parseTheme(coastal);
const check = (visuals: unknown) => parseVisuals(visuals, world, theme);

describe('visual content contract', () => {
  test('loads Breakwater and an independent export in local meters', () => {
    expect(parseVisuals(packageJson('breakwater', 'visual.json'), parseCity(packageJson('breakwater', 'world.json')), theme)
      .decorations).toHaveLength(2);
    expect(check(cove.visuals)).toBe(cove.visuals);
    expect(check({ ...cove.visuals, buildings: [], roads: [], surfaces: [], coasts: [], decorations: [] }).worldId).toBe('cove');
  });

  test('rejects unknown schemas, mismatched worlds and broken feature references', () => {
    const base = cove.visuals;
    expect(() => check({ ...base, visualVersion: 2 })).toThrow('Visualformat');
    expect(() => check({ ...base, worldVersion: 3 })).toThrow('Weltversion');
    expect(() => check({ ...base, worldId: 'elsewhere' })).toThrow('Welt-ID');
    expect(() => check({ ...base, buildings: [{ ...base.buildings[0], buildingId: 'missing' }] })).toThrow('Gebäude-Referenz');
    expect(() => check({ ...base, buildings: [...base.buildings, ...base.buildings] })).toThrow('Gebäude-Referenz');
    expect(() => check({ ...base, buildings: [{ ...base.buildings[0], roofHeightM: 7 }] })).toThrow('Dachhöhe');
    expect(() => check({ ...base, buildings: [{ ...base.buildings[0], roof: 'flat' }] })).toThrow('Dachhöhe');
    expect(() => check({ ...base, roads: [{ ...base.roads[0], roadId: 'missing' }] })).toThrow('Straßen-Referenz');
    expect(() => check({ ...base, roads: [{ ...base.roads[0], sidewalkWidthM: 2 }] })).toThrow('Gehwegbreite');
    expect(() => check({ ...base, surfaces: [{ ...base.surfaces[0], id: 'small-pier' }] })).toThrow('Doppelte Karten-ID');
  });

  test('rejects invalid polygons, map cuts, roads and unconnected decorations', () => {
    const base = cove.visuals;
    const withBeach = (polygon: number[][]) => ({ ...base, surfaces: [{ ...base.surfaces[0], polygon }] });
    expect(() => check(withBeach([[40, 70], [55, 85], [50, 80]]))).toThrow('Visualpolygon');
    expect(() => check(withBeach([[32, 40], [60, 60], [33, 70], [61, 50]]))).toThrow('Visualpolygon');
    expect(() => check(withBeach([[32, 40], [121, 50], [33, 70]]))).toThrow('Kartengrenze');
    expect(() => check(withBeach([[32, 40], [65, 50], [33, 70]]))).toThrow('vollständig auf Land');
    expect(() => check(withBeach([[32, 20], [33, 31], [39, 20]]))).toThrow('Straßenkorridor');
    expect(() => check(withBeach([[3, 38], [23, 39], [21, 55], [4, 54]]))).toThrow('Gebäude');
    expect(() => check(withBeach([[32, 40], [NaN, 50], [33, 70]]))).toThrow('Visualformat');
    expect(() => check({ ...base, coasts: [{ id: 'false-coast', path: [[0, 0], [60, 0]] }] })).toThrow('physischen Landgrenze');
    expect(() => check({ ...base, coasts: [{ id: 'false-coast', path: [[20, 0], [60, 100]] }] })).toThrow('physischen Landgrenze');
    expect(() => check({ ...base, decorations: [{ ...base.decorations[0], polygon: [[75, 62], [86, 62], [87, 71], [75, 70]] }] }))
      .toThrow('Landanschluss');
  });

  test('enforces the complete color palette and ordered meter thresholds', () => {
    expect(() => parseTheme({ ...coastal, themeVersion: 2 })).toThrow('Kartentheme');
    expect(() => parseTheme({ ...coastal, day: { ...coastal.day, window: 'gold' } })).toThrow('Kartentheme');
    expect(() => parseTheme({ ...coastal, lod: { ...coastal.lod, facadeSpanM: 200 } })).toThrow('Detailgrenzen');
    expect(() => parseTheme({ ...coastal, water: { ...coastal.water, distanceM: [90, 70, 500] } })).toThrow('Wasserabstände');
  });
});

test('polygon containment checks the edges across concave land and detects self intersections', () => {
  const land = [[0, 0], [10, 0], [10, 8], [7, 8], [7, 2], [3, 2], [3, 8], [0, 8]] as const;
  expect(containsRing(land, [[2, 6], [8, 6], [5, 1]])).toBe(false);
  expect(containsRing(land, [[0, 0], [10, 0], [5, 1]])).toBe(true);
  expect(isSimpleRing([[0, 0], [4, 0], [2, 0], [4, 2], [0, 2]])).toBe(false);
  expect(distanceSquaredBetween([[0, 0], [0, 5]], [[3, 2], [7, 2]])).toBe(9);
});

test('City v3 boundaries and triangulation retain a hole and a disjoint polygon', () => {
  const outer = [[0, 0], [10, 0], [10, 10], [0, 10]] as const;
  const hole = [[3, 3], [3, 7], [7, 7], [7, 3]] as const;
  const island = [[12, 0], [14, 0], [14, 4], [12, 4]] as const;
  const geometry = { polygons: [{ outer, holes: [hole] }, { outer: island, holes: [] }] };
  const bounds = { minX: -1, maxX: 20, minZ: -1, maxZ: 20 };
  const area = validateArea(geometry, bounds);
  expect(area.side([5, 5])).toBe(-1);
  expect(area.side([13, 2])).toBe(1);
  expect(area.coversLine([[0, 5], [10, 5]])).toBe(false);
  expect(() => validateArea({ polygons: [{ outer, holes: [island] }] }, bounds)).toThrow('Hole outside');
  expect(() => validateArea({ polygons: [{ outer, holes: [] }, { outer, holes: [] }] }, bounds)).toThrow('Overlapping');
  const mesh = new MeshGeometry();
  mesh.area(geometry, 0);
  let triangleArea = 0;
  for (let i = 0; i < mesh.positions.length; i += 9) {
    const [ax, , az, bx, , bz, cx, , cz] = mesh.positions.slice(i, i + 9);
    triangleArea += Math.abs((bx - ax) * (cz - az) - (cx - ax) * (bz - az)) / 2;
  }
  expect(triangleArea).toBe(100 - 16 + 8);
});
