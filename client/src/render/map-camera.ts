import { MathUtils, OrthographicCamera, Plane, Raycaster, Vector2, Vector3 } from 'three';
import type { Bounds, Point } from './city-data';
import type { MapLod } from './visual-data';

const GROUND = new Plane(new Vector3(0, 1, 0));
const MIN_SPAN = 20;
export const FOCUS_SPAN = 76;
const MAX_DETAIL_TILT = Math.PI * 0.29;
const TAU = 2 * Math.PI;
const wrapAngle = (angle: number) => MathUtils.euclideanModulo(angle + Math.PI, TAU) - Math.PI;

export function detailAt(span: number, lod: MapLod): number {
  return 1 - MathUtils.smoothstep(span, lod.fullHeightSpanM, lod.flatSpanM);
}

export function visibilityAt(span: number, threshold: number): number {
  return 1 - MathUtils.smoothstep(span, 0.76 * threshold, threshold);
}

export class MapCamera {
  readonly camera = new OrthographicCamera(-1, 1, 1, -1, 1, 6000);
  private readonly raycaster = new Raycaster();
  private readonly center = new Vector3();
  private readonly target = new Vector3();
  private span = 1;
  private targetSpan = 1;
  private yaw = 0;
  private targetYaw = 0;
  private aspect = 1;
  private anchor?: { screen: Vector2; world: Vector3 };
  private fitted = true;

  constructor(private readonly bounds: Bounds, private readonly lod: MapLod) {
    this.reset();
    this.advance(0, true);
  }

  get detail() { return detailAt(this.span, this.lod); }
  get verticalSpan() { return this.span; }
  get northAngle() {
    return Math.atan2(Math.sin(this.yaw), Math.cos(this.yaw) * Math.cos(this.detail * MAX_DETAIL_TILT));
  }

  private get fitSpan() {
    return Math.max(
      (this.bounds.maxX - this.bounds.minX + 120) / this.aspect,
      this.bounds.maxZ - this.bounds.minZ + 120,
    );
  }

  resize(width: number, height: number) {
    this.aspect = width / height;
    this.targetSpan = this.fitted ? this.fitSpan : Math.min(this.targetSpan, this.fitSpan * 1.25);
    this.anchor = undefined;
    this.updateCamera();
  }

  reset() {
    const { minX, maxX, minZ, maxZ } = this.bounds;
    this.fitted = true;
    this.target.set((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
    this.targetSpan = this.fitSpan;
    this.orientNorth();
    this.anchor = undefined;
  }

  focus([x, z]: Point, span = FOCUS_SPAN) {
    this.fitted = false;
    this.target.set(x, 0, z);
    this.targetSpan = span;
    this.anchor = undefined;
  }

  zoom(factor: number, screen = new Vector2(), immediate = false) {
    const span = MathUtils.clamp(this.targetSpan * factor, MIN_SPAN, this.fitSpan * 1.25);
    if (span === this.targetSpan) return;
    this.fitted = false;
    this.anchor = { screen, world: this.groundAt(screen) };
    this.target.copy(this.center);
    this.targetSpan = span;
    if (immediate) this.advance(0, true);
  }

  stop() {
    this.targetSpan = this.span;
    this.targetYaw = this.yaw;
    this.target.copy(this.center);
    this.anchor = undefined;
  }

  rotate(radians: number, immediate = false) {
    this.targetYaw = wrapAngle(this.targetYaw + radians);
    if (immediate) {
      this.yaw = this.targetYaw;
      this.updateCamera();
    }
  }

  orientNorth() {
    this.targetYaw = 0;
  }

  pan(from: Vector2, to: Vector2) {
    this.fitted = false;
    this.center.add(this.groundAt(from).sub(this.groundAt(to)));
    this.target.copy(this.center);
    this.updateCamera();
  }

  groundAt(screen: Vector2): Vector3 {
    this.raycaster.setFromCamera(screen, this.camera);
    // The tilt stays below 90 degrees, so a ray always intersects the ground.
    return this.raycaster.ray.intersectPlane(GROUND, new Vector3())!;
  }

  advance(seconds: number, snap = false): boolean {
    const turn = wrapAngle(this.targetYaw - this.yaw);
    const moving = Math.abs(this.span - this.targetSpan) > 0.02
      || this.center.distanceToSquared(this.target) > 0.0004 || Math.abs(turn) > 0.0001;
    const blend = snap || !moving ? 1 : 1 - Math.exp(-14 * seconds);
    this.span = MathUtils.lerp(this.span, this.targetSpan, blend);
    this.center.lerp(this.target, blend);
    this.yaw = blend === 1 ? this.targetYaw : wrapAngle(this.yaw + blend * turn);
    this.updateCamera();
    if (this.anchor) {
      this.center.add(this.anchor.world.clone().sub(this.groundAt(this.anchor.screen)));
      this.target.copy(this.center);
      this.updateCamera();
      if (blend === 1) this.anchor = undefined;
    }
    return moving && !snap;
  }

  private updateCamera() {
    const { camera } = this;
    const halfHeight = this.span / 2;
    camera.left = -halfHeight * this.aspect;
    camera.right = -camera.left;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    const angle = this.detail * MAX_DETAIL_TILT;
    const azimuth = this.yaw;
    const offset = Math.sin(angle) * 2000;
    camera.position.set(this.center.x + Math.sin(azimuth) * offset, Math.cos(angle) * 2000,
      this.center.z + Math.cos(azimuth) * offset);
    camera.up.set(-Math.sin(azimuth), 0, -Math.cos(azimuth));
    camera.lookAt(this.center);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }
}
