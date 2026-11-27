import { BufferGeometry, Group, Mesh, MeshBasicMaterial, type Raycaster } from 'three';
import type { Building, City, Point } from './city-data';
import { parts, type Area, type Ring } from './area-geometry';
import { mixPoint, ringEdges, signedArea } from './map-geometry';
import { MeshGeometry, raised } from './mesh-geometry';
import type { BuildingAppearance, ColorRole, MapTheme, MapVisuals, Windows } from './visual-data';

type Rectangle = readonly [Point, Point, Point, Point];

export function longRectangle(points: readonly Point[]): Rectangle | undefined {
  if (points.length !== 4) return;
  const edges = ringEdges(points).map(([[x, z], [nx, nz]]) => [nx - x, nz - z] as const);
  const lengths = edges.map(([x, z]) => Math.hypot(x, z));
  if (lengths.some((length, i) => length === 0
    || Math.abs(edges[i][0] * edges[(i + 1) % 4][0] + edges[i][1] * edges[(i + 1) % 4][1])
      > length * lengths[(i + 1) % 4] * 1e-5)) return;
  const start = lengths[0] >= lengths[1] ? 0 : 1;
  return [points[start], points[(start + 1) % 4], points[(start + 2) % 4], points[(start + 3) % 4]];
}

function insetRectangle([a, b, c, d]: Rectangle, along: number, across: number): Rectangle {
  return [
    mixPoint(mixPoint(a, b, along), mixPoint(d, c, along), across),
    mixPoint(mixPoint(b, a, along), mixPoint(c, d, along), across),
    mixPoint(mixPoint(c, d, along), mixPoint(b, a, along), across),
    mixPoint(mixPoint(d, c, along), mixPoint(a, b, along), across),
  ];
}

function gabledRoof(rectangle: Rectangle, eave: number, height: number, roof: MeshGeometry, walls: MeshGeometry) {
  const [a, b, c, d] = rectangle;
  const first = raised(mixPoint(a, d, 0.5), height);
  const last = raised(mixPoint(b, c, 0.5), height);
  roof.topQuad(raised(a, eave), raised(b, eave), last, first);
  roof.topQuad(first, last, raised(c, eave), raised(d, eave), 0.82);
  const clockwise = signedArea(rectangle) > 0;
  for (const [left, right, ridge] of [[b, c, last], [d, a, first]] as const) {
    walls.triangle(raised(clockwise ? right : left, eave), raised(clockwise ? left : right, eave), ridge, 0.8);
  }
}

function flatRoof(rectangle: Rectangle, eave: number, height: number, trim: MeshGeometry, detail: 'parapet' | 'raised') {
  const outer = detail === 'raised' ? insetRectangle(rectangle, 0.19, 0.32) : rectangle;
  trim.walls(outer, eave, height, 0.81);
  if (detail === 'raised') {
    trim.surface(outer, height);
    return;
  }
  const inner = insetRectangle(rectangle, 0.045, 0.055);
  trim.walls([...inner].reverse(), eave, height, 0.79);
  for (let i = 0; i < 4; i++) {
    const next = (i + 1) % 4;
    trim.topQuad(raised(outer[i], height), raised(outer[next], height), raised(inner[next], height), raised(inner[i], height));
  }
}

function wallsAndWindows(
  footprint: readonly Point[], height: number, walls: MeshGeometry, windows: MeshGeometry,
  style: Windows, floorHeight: number, spacing: number, inward = false,
) {
  const clockwise = (signedArea(footprint) > 0) !== inward;
  const rows = Math.min(5, Math.floor(height / floorHeight));
  for (const [a, b] of ringEdges(footprint)) {
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const length = Math.hypot(dx, dz);
    const sign = clockwise ? 1 : -1;
    const outward = [sign * dz / length, -sign * dx / length] as const;
    const shade = 0.89 - 0.13 * outward[0] - 0.11 * outward[1];
    walls.wall(a, b, 0, height, clockwise, shade);
    if (style === 'none' || length < 3.5 || !rows) continue;
    const columns = Math.min(12, Math.max(1, Math.floor(length / spacing)));
    const halfWidth = (style === 'bands' ? 0.39 : 0.23) / columns;
    const at = (t: number): Point => {
      const [x, z] = mixPoint(a, b, t);
      return [x + 0.026 * outward[0], z + 0.026 * outward[1]];
    };
    for (let col = 0; col < columns; col++) {
      const position = (col + 0.5) / columns;
      const start = at(position - halfWidth);
      const end = at(position + halfWidth);
      for (let row = 0; row < rows; row++) {
        const floor = (row + 0.52) * height / rows;
        const halfHeight = Math.min(1.05, height / rows * (style === 'bands' ? 0.12 : 0.18));
        windows.wall(start, end, floor - halfHeight, floor + halfHeight, clockwise, shade);
      }
    }
  }
}

const roofRoles = { residential: 'roofResidential', commercial: 'roofCommercial', warehouse: 'roofWarehouse' } as const;
type BuildingColor = typeof roofRoles[keyof typeof roofRoles] | 'wall' | 'roofTrim';
type Batch = { geometry: MeshGeometry; owners: string[] };
type FaceRange = { geometry: MeshGeometry; from: number; to: number };

function record(batch: Batch, id: string, from: number): FaceRange {
  const to = batch.geometry.faceCount;
  for (let face = from; face < to; face++) batch.owners.push(id);
  return { geometry: batch.geometry, from, to };
}

export class BuildingLayer {
  readonly group = new Group();
  private readonly flat = new Group();
  private readonly volumes = new Group();
  private readonly owners = new Map<Mesh, string[]>();
  private readonly flatPick: Mesh[] = [];
  private readonly volumePick: Mesh[] = [];
  private readonly windows = new Group();
  private readonly windowMaterial: MeshBasicMaterial;
  private readonly shadows: Mesh<BufferGeometry, MeshBasicMaterial>;
  private readonly ranges = new Map<string, { flat: FaceRange; roof: FaceRange }>();
  private readonly selected: { flat: Mesh; roof: Mesh };
  private selection?: string;

  constructor(city: City, appearances: MapVisuals['buildings'], theme: MapTheme, material: (role: ColorRole) => MeshBasicMaterial) {
    this.group.add(this.flat, this.volumes);
    const buildBatch = (): Batch => ({ geometry: new MeshGeometry(), owners: [] });
    const flats = new Map<BuildingColor, Batch>();
    const volumes = new Map<BuildingColor, Batch>();
    const windows = new Map<string, MeshGeometry>();
    const shadows = new MeshGeometry();
    const appearanceById = new Map(appearances.map(appearance => [appearance.buildingId, appearance]));
    const level = theme.layerStepM * 13;
    this.flat.position.y = level;
    this.volumes.position.y = level;
    const batch = (batches: Map<BuildingColor, Batch>, color: BuildingColor) => {
      let result = batches.get(color);
      if (!result) {
        result = buildBatch();
        batches.set(color, result);
      }
      return result;
    };
    for (const building of city.buildings) {
      const appearance = appearanceById.get(building.id);
      const color = roofRoles[appearance?.profile ?? 'commercial'];
      const flat = batch(flats, color);
      const start = flat.geometry.faceCount;
      flat.geometry.area(building.footprint, 0);
      const flatRange = record(flat, building.id, start);
      const roof = batch(volumes, color);
      const walls = batch(volumes, 'wall');
      const trim = batch(volumes, 'roofTrim');
      const starts = [roof, walls, trim].map(({ geometry }) => geometry.faceCount);
      const [x, z] = parts(building.footprint)[0].outer[0];
      const cell = Math.floor(x / 175) + '/' + Math.floor(z / 175);
      let facade = windows.get(cell);
      if (!facade) {
        facade = new MeshGeometry();
        windows.set(cell, facade);
      }
      this.buildVolume(building, appearance, theme, roof.geometry, walls.geometry, trim.geometry, facade);
      const roofRange = record(roof, building.id, starts[0]);
      record(walls, building.id, starts[1]);
      record(trim, building.id, starts[2]);
      this.ranges.set(building.id, { flat: flatRange, roof: roofRange });
      if (city.version === 2) {
        const offset = (ring: Ring): Point[] => ring.map(([x, z]) => [x + building.height * 0.24, z + building.height * 0.31]);
        for (const { outer, holes } of parts(building.footprint)) {
          shadows.surface(offset(outer), theme.layerStepM * 7.5, 1, holes.map(offset));
        }
      }
    }
    for (const [entries, group, pick] of [[flats, this.flat, this.flatPick], [volumes, this.volumes, this.volumePick]] as const) {
      for (const [color, { geometry, owners }] of entries) {
        if (!geometry.faceCount) continue;
        const mesh = new Mesh(geometry.geometry(), material(color));
        group.add(mesh);
        this.owners.set(mesh, owners);
        pick.push(mesh);
      }
    }
    this.shadows = new Mesh(shadows.geometry(), material('shadow'));
    this.windowMaterial = material('window');
    for (const facade of windows.values()) {
      if (facade.faceCount) this.windows.add(new Mesh(facade.geometry(), this.windowMaterial));
    }
    this.group.add(this.shadows);
    this.volumes.add(this.windows);
    this.selected = {
      flat: new Mesh(new BufferGeometry(), material('selected')),
      roof: new Mesh(new BufferGeometry(), material('selected')),
    };
    this.selected.flat.visible = this.selected.roof.visible = false;
    this.flat.add(this.selected.flat);
    this.volumes.add(this.selected.roof);
  }

  private buildVolume(
    { footprint, height }: Building<Area | Ring>, appearance: BuildingAppearance | undefined, theme: MapTheme,
    roof: MeshGeometry, walls: MeshGeometry, trim: MeshGeometry, windows: MeshGeometry,
  ) {
    const rules = theme.buildings[appearance?.profile ?? 'commercial'];
    const polygons = parts(footprint);
    const rectangle = polygons.length === 1 && !polygons[0].holes.length ? longRectangle(polygons[0].outer) : undefined;
    const gabled = (appearance?.roof ?? rules.roof) === 'gabled' && rectangle;
    const flatDetail = rules.flatDetail;
    const trimHeight = rectangle && flatDetail !== 'none' ? Math.min(rules.trimHeightM, height * 0.19) : 0;
    const eave = height - (gabled ? appearance?.roofHeightM ?? height * rules.roofFraction : trimHeight);
    const wall = (ring: Ring, inward: boolean) =>
      wallsAndWindows(ring, eave, walls, windows, appearance?.windows ?? rules.windows, rules.floorHeightM, rules.windowSpacingM, inward);
    for (const { outer, holes } of polygons) {
      wall(outer, false);
      for (const hole of holes) wall(hole, true);
    }
    if (gabled) gabledRoof(gabled, eave, height, roof, walls);
    else {
      roof.area(footprint, eave);
      if (rectangle && trimHeight && flatDetail !== 'none') flatRoof(rectangle, eave, height, trim, flatDetail);
    }
  }

  setDetail(detail: number, facadeOpacity: number) {
    this.flat.visible = detail === 0;
    this.volumes.visible = this.shadows.visible = detail > 0;
    this.volumes.scale.y = detail;
    this.shadows.material.opacity = detail * 0.21;
    this.windows.visible = facadeOpacity > 0;
    this.windowMaterial.opacity = facadeOpacity;
  }

  pick(raycaster: Raycaster) {
    const hit = raycaster.intersectObjects(this.volumes.visible ? this.volumePick : this.flatPick, false)[0];
    return hit?.faceIndex == null ? undefined : this.owners.get(hit.object as Mesh)?.[hit.faceIndex];
  }

  select(id?: string) {
    if (id === this.selection) return;
    this.selection = id;
    const ranges = id ? this.ranges.get(id) : undefined;
    for (const key of ['flat', 'roof'] as const) {
      const mesh = this.selected[key];
      mesh.visible = !!ranges;
      if (ranges) {
        const { geometry, from, to } = ranges[key];
        mesh.geometry.dispose();
        mesh.geometry = geometry.geometry(from, to);
      }
    }
  }
}
