import { BufferGeometry, Group, Mesh, MeshBasicMaterial, type Raycaster } from 'three';
import { BuildingLayer } from './building-layer';
import { segments, mixPoint, ringSide } from './map-geometry';
import type { Area, Ring } from './area-geometry';
import { MeshGeometry } from './mesh-geometry';
import { roadGeometry } from './road-layer';
import { extendLand, WaterLayer } from './water-layer';
import type { City, CityV2, Point } from './city-data';
import type { Palette } from './palette';
import type { ColorRole, MapTheme, MapVisuals, SurfaceKind } from './visual-data';

const surfaces: readonly SurfaceKind[] = ['parcel', 'grass', 'plaza', 'promenade', 'beach'];

export class GeographyLayer {
  readonly group = new Group();
  private readonly water: WaterLayer;
  private readonly buildings: BuildingLayer;
  private readonly materials = new Map<ColorRole, MeshBasicMaterial>();
  private readonly markings?: Mesh<BufferGeometry, MeshBasicMaterial>;
  private readonly piles?: Mesh;

  constructor(city: City, visuals: MapVisuals, theme: MapTheme) {
    const margin = Math.max(city.bounds.maxX - city.bounds.minX, city.bounds.maxZ - city.bounds.minZ, theme.water.distanceM[2]);
    const coastline = (visuals.visualVersion === 2 ? visuals.coasts.filter(shore => shore.kind !== 'cut') : visuals.coasts)
      .flatMap(({ path }) => segments(path, false));
    const { skirts, coast } = city.version === 2 ? extendLand(city, coastline, margin) : { skirts: [], coast: coastline };
    const bounds = {
      minX: city.bounds.minX - margin, maxX: city.bounds.maxX + margin,
      minZ: city.bounds.minZ - margin, maxZ: city.bounds.maxZ + margin,
    };
    const mask = city.version === 3 && city.boundaryMode === 'natural' ? city.aoi : undefined;
    this.water = new WaterLayer(mask ? city.bounds : bounds, coast, theme.water, mask);
    this.group.add(this.water.mesh);
    const step = theme.layerStepM;
    this.polygons(city.version === 2 ? [...city.land, ...skirts] : [city.land], 'land', 0);
    this.polygons(city.districts.map(district => district.outline), 'district', step);
    this.polygons(city.greens, 'grass', step * 2);
    surfaces.forEach((kind, index) => this.polygons(
      visuals.surfaces.filter(surface => surface.kind === kind).map(surface => surface.polygon), kind, (index + 3) * step,
    ));
    const { roadEdge, roadLocal, roadMain, marking } = roadGeometry(city, visuals, theme);
    this.mesh(roadEdge, 'roadEdge');
    this.mesh(roadLocal, 'roadLocal');
    this.mesh(roadMain, 'roadMain');
    this.markings = this.mesh(marking, 'marking');
    this.buildings = new BuildingLayer(city, visuals.buildings, theme, role => this.material(role));
    this.group.add(this.buildings.group);
    if (city.version === 2) this.piles = this.buildPiers(city, visuals);
  }

  setPalette(palette: Palette) {
    for (const [role, material] of this.materials) material.color.copy(palette[role]);
    this.water.setPalette(palette);
  }

  setDetail(detail: number, facadeOpacity: number, markingOpacity: number) {
    this.buildings.setDetail(detail, facadeOpacity);
    if (this.markings) {
      this.markings.visible = markingOpacity > 0;
      this.markings.material.opacity = markingOpacity;
    }
    if (this.piles) this.piles.visible = detail > 0.08;
  }

  pickBuilding(raycaster: Raycaster) {
    return this.buildings.pick(raycaster);
  }

  selectBuilding(id?: string) {
    this.buildings.select(id);
  }

  dispose() {
    this.group.remove(this.water.mesh);
    this.water.dispose();
    this.group.traverse(object => { if (object instanceof Mesh) object.geometry.dispose(); });
    for (const material of this.materials.values()) material.dispose();
    this.group.clear();
  }

  private material(role: ColorRole) {
    let material = this.materials.get(role);
    if (!material) {
      const transparent = role === 'shadow' || role === 'window' || role === 'marking' || role === 'selected';
      material = new MeshBasicMaterial({
        name: role, transparent, depthWrite: !transparent, vertexColors: true, opacity: role === 'selected' ? 0.65 : 1,
        polygonOffset: role === 'selected', polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      });
      this.materials.set(role, material);
    }
    return material;
  }

  private mesh(batch: MeshGeometry, role: ColorRole) {
    if (!batch.faceCount) return;
    const mesh = new Mesh(batch.geometry(), this.material(role));
    this.group.add(mesh);
    return mesh;
  }

  private polygons(polygons: readonly (Area | Ring)[], role: ColorRole, elevation: number) {
    const batch = new MeshGeometry();
    for (const polygon of polygons) batch.area(polygon, elevation);
    this.mesh(batch, role);
  }

  private buildPiers(city: CityV2, visuals: MapVisuals) {
    const decks = new MeshGeometry();
    const supports = new MeshGeometry();
    for (const { polygon, elevationM } of visuals.decorations) {
      decks.surface(polygon, elevationM);
      decks.walls(polygon, elevationM - 0.45, elevationM, 0.69);
      const [sx, sz] = polygon.reduce(([x, z], [px, pz]) => [x + px, z + pz], [0, 0]);
      const center: Point = [sx / polygon.length, sz / polygon.length];
      const candidates = polygon.flatMap((point, i) => [
        mixPoint(point, center, 0.16),
        mixPoint(mixPoint(point, polygon[(i + 1) % polygon.length], 0.5), center, 0.16),
      ]);
      for (const [x, z] of candidates) {
        const r = 0.54;
        const pile: Point[] = [[x - r, z - r], [x + r, z - r], [x + r, z + r], [x - r, z + r]];
        if (city.land.some(land => ringSide([x, z], land) >= 0)
          || pile.some(point => ringSide(point, polygon) !== 1)) continue;
        supports.walls(pile, -0.06, elevationM - 0.43);
      }
    }
    this.mesh(decks, 'pier');
    return this.mesh(supports, 'pierSupport');
  }
}
