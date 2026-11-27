import {
  Color, DataTexture, LinearFilter, Mesh, PlaneGeometry, RedFormat, ShaderMaterial, UnsignedByteType,
} from 'three';
import type { Bounds, City, Point } from './city-data';
import { segmentBounds, SpatialIndex, type Area } from './area-geometry';
import { MeshGeometry } from './mesh-geometry';
import { ringEdges, type Segment } from './map-geometry';
import type { MapTheme } from './visual-data';
import type { Palette } from './palette';

const pointKey = ([x, z]: Point) => x + '/' + z;

export function extendLand(city: City, coast: readonly Segment[], margin: number) {
  if (city.version === 3) return { skirts: [], coast };
  const { bounds } = city;
  const clips = city.land.flatMap(ringEdges).filter(([[x, z], [nextX, nextZ]]) =>
    (x === nextX && (x === bounds.minX || x === bounds.maxX))
    || (z === nextZ && (z === bounds.minZ || z === bounds.maxZ)));
  const extrapolated = new Map<string, Point>();
  const outer = (point: Point): Point => {
    const key = pointKey(point);
    const cached = extrapolated.get(key);
    if (cached) return cached;
    const [x, z] = point;
    let dx = x === bounds.minX ? -margin : x === bounds.maxX ? margin : 0;
    let dz = z === bounds.minZ ? -margin : z === bounds.maxZ ? margin : 0;
    const shore = coast.find(segment => segment.some(endpoint => pointKey(endpoint) === key));
    const inland = shore?.find(endpoint => pointKey(endpoint) !== key);
    if (inland) {
      const [cx, cz] = inland;
      // Continue the shoreline past clipped north/south edges (and likewise for east/west).
      const slope = (along: number, outward: number) => outward ? Math.max(-0.78, Math.min(0.78, along / outward)) : 0;
      if (dz && !dx) dx = dz * slope(x - cx, z - cz);
      else if (dx && !dz) dz = dx * slope(z - cz, x - cx);
    }
    const result: Point = [x + dx, z + dz];
    extrapolated.set(key, result);
    return result;
  };
  const skirts = clips.map(([a, b]) => [a, b, outer(b), outer(a)]);
  const coastExtensions = new Map<string, Segment>();
  for (const point of coast.flat()) {
    const key = pointKey(point);
    const endpoint = extrapolated.get(key);
    if (endpoint) coastExtensions.set(key, [point, endpoint]);
  }
  return { skirts, coast: [...coast, ...coastExtensions.values()] };
}

export function depthSamples(bounds: Bounds, shore: readonly Segment[], resolution: number, horizon: number) {
  const depths = new Uint8Array(resolution * resolution);
  const segments = shore.map(edge => {
    const [[x, z], [nextX, nextZ]] = edge;
    const dx = nextX - x;
    const dz = nextZ - z;
    return { x, z, dx, dz, bounds: segmentBounds(edge), inverseLengthSquared: 1 / (dx * dx + dz * dz) };
  });
  const index = new SpatialIndex(segments, segment => segment.bounds);
  const stepX = (bounds.maxX - bounds.minX) / resolution;
  const stepZ = (bounds.maxZ - bounds.minZ) / resolution;
  for (let row = 0; row < resolution; row++) {
    const z = bounds.maxZ - (row + 0.5) * stepZ;
    for (let col = 0; col < resolution; col++) {
      const x = bounds.minX + (col + 0.5) * stepX;
      let closest = horizon * horizon;
      for (const segment of index.query({ minX: x - horizon, maxX: x + horizon, minZ: z - horizon, maxZ: z + horizon })) {
        const px = x - segment.x;
        const pz = z - segment.z;
        const t = Math.max(0, Math.min(1, (px * segment.dx + pz * segment.dz) * segment.inverseLengthSquared));
        closest = Math.min(closest, (px - t * segment.dx) ** 2 + (pz - t * segment.dz) ** 2);
      }
      depths[row * resolution + col] = Math.round(Math.sqrt(closest) * 255 / horizon);
    }
  }
  return depths;
}

export class WaterLayer {
  readonly mesh: Mesh<import('three').BufferGeometry, ShaderMaterial>;
  private readonly texture: DataTexture;
  private readonly shallow = new Color();
  private readonly mid = new Color();
  private readonly deep = new Color();
  private readonly horizon = new Color();

  constructor(bounds: Bounds, shore: readonly Segment[], theme: MapTheme['water'], mask?: Area) {
    const { minX, maxX, minZ, maxZ } = bounds;
    const [midAt, deepAt, horizonAt] = theme.distanceM;
    const { resolution } = theme;
    this.texture = new DataTexture(depthSamples(bounds, shore, resolution, horizonAt),
      resolution, resolution, RedFormat, UnsignedByteType);
    this.texture.magFilter = this.texture.minFilter = LinearFilter;
    this.texture.needsUpdate = true;
    const material = new ShaderMaterial({
      name: 'coastal water',
      uniforms: {
        depths: { value: this.texture },
        midAt: { value: midAt / horizonAt },
        deepAt: { value: deepAt / horizonAt },
        shallow: { value: this.shallow },
        mid: { value: this.mid },
        deep: { value: this.deep },
        horizon: { value: this.horizon },
        origin: { value: [minX, maxZ] },
        span: { value: [maxX - minX, minZ - maxZ] },
      },
      vertexShader: `
        varying vec2 depthUv;
        uniform vec2 origin;
        uniform vec2 span;
        void main() {
          depthUv = ((modelMatrix * vec4(position, 1.0)).xz - origin) / span;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 depthUv;
        uniform sampler2D depths;
        uniform float midAt;
        uniform float deepAt;
        uniform vec3 shallow;
        uniform vec3 mid;
        uniform vec3 deep;
        uniform vec3 horizon;
        void main() {
          float depth = texture2D(depths, depthUv).r;
          vec3 color = mix(shallow, mid, smoothstep(0.0, midAt, depth));
          color = mix(color, deep, smoothstep(midAt, deepAt, depth));
          color = mix(color, horizon, smoothstep(deepAt, 1.0, depth));
          gl_FragColor = vec4(color, 1.0);
          #include <colorspace_fragment>
        }
      `,
    });
    if (mask) {
      const water = new MeshGeometry();
      water.area(mask, -0.06);
      this.mesh = new Mesh(water.geometry(), material);
    } else {
      const plane = new PlaneGeometry(maxX - minX, maxZ - minZ).rotateX(-Math.PI / 2);
      this.mesh = new Mesh(plane, material);
      this.mesh.position.set((minX + maxX) / 2, -0.06, (minZ + maxZ) / 2);
    }
  }

  setPalette(palette: Palette) {
    this.shallow.copy(palette.waterShallow);
    this.mid.copy(palette.waterMid);
    this.deep.copy(palette.waterDeep);
    this.horizon.copy(palette.waterHorizon);
  }

  dispose() {
    this.texture.dispose();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
