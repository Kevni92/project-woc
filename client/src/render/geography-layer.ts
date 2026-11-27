import {
  BufferGeometry, CircleGeometry, ExtrudeGeometry, Float32BufferAttribute, Group,
  LineBasicMaterial, LineLoop, LineSegments, Mesh, MeshBasicMaterial, Shape, ShapeGeometry, Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { segments } from './city-data';
import type { City, Point } from './city-data';
import type { Palette } from './palette';

function shape(points: readonly Point[]) {
  const shape = new Shape();
  points.forEach(([x, z], index) => {
    if (index === 0) shape.moveTo(x, -z);
    else shape.lineTo(x, -z);
  });
  shape.closePath();
  return shape;
}

function surface(points: readonly Point[]) {
  return new ShapeGeometry(shape(points)).rotateX(-Math.PI / 2);
}

type SurfaceColor = Exclude<keyof Palette, 'label'>;

export class GeographyLayer {
  readonly group = new Group();
  readonly buildingMeshes: Mesh[] = [];
  private readonly volumes = new Group();
  private readonly shadows = new Group();
  private readonly surfaces = new Map<SurfaceColor, MeshBasicMaterial>();
  private readonly lines = new Map<SurfaceColor, LineBasicMaterial>();
  private readonly geometries = new Set<BufferGeometry>();
  private readonly buildings = new Map<string, { flat: Mesh; volume: Mesh }>();
  private selected?: string;

  constructor(city: City) {
    this.group.add(this.shadows, this.volumes);
    this.buildGround(city);
    this.buildRoads(city);
    this.material('selected');
    for (const building of city.buildings) {
      const { id, footprint, height } = building;
      const geometry = new ExtrudeGeometry(shape(footprint), { depth: height, bevelEnabled: false })
        .rotateX(-Math.PI / 2);
      const normals = geometry.getAttribute('normal');
      const tint: number[] = [];
      for (let vertex = 0; vertex < normals.count; vertex++) {
        const brightness = 0.85 + 0.1 * normals.getZ(vertex) - 0.1 * normals.getX(vertex);
        tint.push(brightness, brightness, brightness);
      }
      geometry.setAttribute('color', new Float32BufferAttribute(tint, 3));
      const volume = new Mesh(geometry, [this.material('roof'), this.material('wall')]);
      volume.userData.buildingId = id;
      this.volumes.add(volume);
      this.geometries.add(geometry);

      const flat = this.mesh(surface(footprint), 'roof', 0.26);
      flat.userData.buildingId = id;
      this.buildings.set(id, { flat, volume });
      this.buildingMeshes.push(volume, flat);

      flat.add(this.outline(footprint, 'wall', 0.004));
      volume.add(this.outline(footprint, 'wall', height + 0.006));

      const shadow = this.mesh(surface(footprint), 'shade', 0.20, this.shadows);
      shadow.position.x = height * 0.31;
      shadow.position.z = -height * 0.23;
    }
  }

  setPalette(palette: Palette) {
    for (const [key, material] of [...this.surfaces, ...this.lines]) material.color.copy(palette[key]);
  }

  setDetail(detail: number) {
    this.volumes.visible = detail > 0;
    this.volumes.position.y = 0.26;
    this.volumes.scale.y = detail;
    this.shadows.visible = detail > 0;
    this.material('shade').opacity = detail * 0.48;
    for (const { flat } of this.buildings.values()) flat.visible = detail === 0;
  }

  selectBuilding(id?: string) {
    if (id === this.selected) return;
    const previous = this.selected ? this.buildings.get(this.selected) : undefined;
    const next = id ? this.buildings.get(id) : undefined;
    for (const [building, color] of [[previous, 'roof'], [next, 'selected']] as const) {
      if (!building) continue;
      building.flat.material = this.material(color);
      building.volume.material = [this.material(color), this.material('wall')];
    }
    this.selected = id;
  }

  dispose() {
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of [...this.surfaces.values(), ...this.lines.values()]) material.dispose();
    this.group.clear();
  }

  private material(color: SurfaceColor) {
    let material = this.surfaces.get(color);
    if (!material) {
      material = new MeshBasicMaterial({
        name: color, transparent: color === 'shade', depthWrite: color !== 'shade', vertexColors: color === 'wall',
      });
      this.surfaces.set(color, material);
    }
    return material;
  }

  private lineMaterial(color: SurfaceColor) {
    let material = this.lines.get(color);
    if (!material) {
      material = new LineBasicMaterial({ name: color });
      this.lines.set(color, material);
    }
    return material;
  }

  private mesh(geometry: BufferGeometry, color: SurfaceColor, elevation: number, parent = this.group) {
    const mesh = new Mesh(geometry, this.material(color));
    mesh.position.y = elevation;
    this.geometries.add(geometry);
    parent.add(mesh);
    return mesh;
  }

  private outline(polygon: readonly Point[], color: SurfaceColor, elevation: number) {
    const geometry = new BufferGeometry().setFromPoints(polygon.map(([x, z]) => new Vector3(x, 0, z)));
    const line = new LineLoop(geometry, this.lineMaterial(color));
    line.position.y = elevation;
    this.geometries.add(geometry);
    return line;
  }

  private buildGround(city: City) {
    const grid: number[] = [];
    for (let offset = -3200; offset <= 3200; offset += 50) {
      grid.push(offset, -0.06, -3200, offset, -0.06, 3200, -3200, -0.06, offset, 3200, -0.06, offset);
    }
    const geometry = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(grid, 3));
    this.geometries.add(geometry);
    this.group.add(new LineSegments(geometry, this.lineMaterial('grid')));

    for (const polygon of city.land) {
      this.mesh(surface(polygon), 'land', 0);
      this.group.add(this.outline(polygon, 'coast', 0.08));
    }
    const districtColors = ['north', 'oldTown', 'docks'] as const;
    city.districts.forEach((district, index) => {
      this.mesh(surface(district.outline), districtColors[index % districtColors.length], 0.025);
    });
    for (const polygon of city.greens) {
      this.mesh(surface(polygon), 'park', 0.045);
      this.group.add(this.outline(polygon, 'parkEdge', 0.05));
    }
  }

  private buildRoads(city: City) {
    const groups = new Map<SurfaceColor, BufferGeometry[]>([
      ['roadEdge', []], ['street', []], ['avenue', []], ['roadMark', []],
    ]);
    const strip = ([x, z]: Point, [nextX, nextZ]: Point, width: number) => {
      const scale = width / (2 * Math.hypot(nextX - x, nextZ - z));
      const dx = (nextZ - z) * scale;
      const dz = (x - nextX) * scale;
      return surface([[x + dx, z + dz], [nextX + dx, nextZ + dz],
        [nextX - dx, nextZ - dz], [x - dx, z - dz]]);
    };
    for (const road of city.roads) {
      for (const [a, b] of segments(road.path, false)) {
        groups.get('roadEdge')!.push(strip(a, b, road.width + 3));
        groups.get(road.kind)!.push(strip(a, b, road.width));
        if (road.kind === 'avenue') {
          const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
          const at = (distance: number): Point => [
            a[0] + (b[0] - a[0]) * distance / length,
            a[1] + (b[1] - a[1]) * distance / length,
          ];
          for (let offset = 8; offset + 12 < length; offset += 23) {
            groups.get('roadMark')!.push(strip(at(offset), at(offset + 8), 0.55));
          }
        }
      }
      for (const [x, z] of road.path.slice(1, -1)) {
        for (const [color, width] of [['roadEdge', road.width + 3], [road.kind, road.width]] as const) {
          groups.get(color)!.push(new CircleGeometry(width / 2, 12)
            .rotateX(-Math.PI / 2).translate(x, 0, z));
        }
      }
    }
    let elevation = 0.10;
    for (const [color, geometries] of groups) {
      if (geometries.length) {
        this.mesh(mergeGeometries(geometries), color, elevation);
        for (const geometry of geometries) geometry.dispose();
      }
      elevation += 0.02;
    }
  }
}
