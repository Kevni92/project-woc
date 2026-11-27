import { Raycaster, Scene, Vector2, Vector3, WebGLRenderer } from 'three';
import { MapCamera } from './map-camera';
import { GeographyLayer } from './geography-layer';
import { layoutMarkers } from './map-anchors';
import { paletteAt, twilight } from './palette';
import type { City, Point } from './city-data';
import type { Anchor, MarkerLayout, ScreenAnchor } from './map-anchors';

export interface MapFrame {
  readonly districts: ReadonlyMap<string, ScreenAnchor>;
  readonly water?: ScreenAnchor;
  readonly locations: ReadonlyMap<string, MarkerLayout>;
  readonly characters: ReadonlyMap<string, MarkerLayout>;
  readonly detail: number;
  readonly northAngle: number;
  readonly labelColor: string;
  readonly scale: number;
  readonly scaleWidth: number;
}

export class MapRenderer {
  private readonly scene = new Scene();
  private readonly renderer: WebGLRenderer;
  private readonly geography: GeographyLayer;
  private readonly view: MapCamera;
  private readonly observer: ResizeObserver;
  private readonly events = new AbortController();
  private readonly districts: Anchor[];
  private readonly water: Anchor;
  private readonly locations: Anchor[];
  private readonly raycaster = new Raycaster();
  private readonly fingers = new Map<number, Vector2>();
  private pointerStart?: Vector2;
  private dragged = false;
  private characters: readonly Anchor[] = [];
  private daylight = -1;
  private labelColor = '';
  private width = 0;
  private height = 0;
  private animation = 0;
  private lastFrame = 0;
  private reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  constructor(
    container: HTMLElement,
    private readonly canvas: HTMLCanvasElement,
    city: City,
    private readonly onFrame: (frame: MapFrame) => void,
    private readonly onPick: (buildingId?: string) => void,
  ) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true });
    this.geography = new GeographyLayer(city);
    this.view = new MapCamera(city.bounds);
    this.districts = city.districts.map(district => ({ id: district.id, position: district.label }));
    this.water = { id: city.id, position: city.waterLabel.position };
    const heights = new Map(city.buildings.map(building => [building.id, building.height]));
    this.locations = city.locations.map(location => ({
      id: location.id,
      position: location.position,
      height: location.building ? heights.get(location.building) : undefined,
    }));
    this.scene.add(this.geography.group);
    this.setTime(480);

    const { signal } = this.events;
    container.addEventListener('wheel', this.wheel, { passive: false, signal });
    canvas.addEventListener('pointerdown', this.pointerDown, { signal });
    canvas.addEventListener('pointermove', this.pointerMove, { signal });
    canvas.addEventListener('pointerup', this.pointerUp, { signal });
    canvas.addEventListener('pointercancel', this.pointerCancel, { signal });
    canvas.addEventListener('lostpointercapture', this.pointerCancel, { signal });

    this.observer = new ResizeObserver(() => this.resize());
    this.resize();
    this.view.advance(0, true);
    this.observer.observe(canvas);
  }

  setTime(minutes: number) {
    const daylight = twilight(minutes);
    if (daylight === this.daylight) return;
    this.daylight = daylight;
    const palette = paletteAt(minutes);
    this.scene.background = palette.water;
    this.labelColor = '#' + palette.label.getHexString();
    this.geography.setPalette(palette);
    this.invalidate();
  }

  setCharacters(characters: readonly Anchor[]) {
    this.characters = characters;
    this.invalidate();
  }

  selectBuilding(id?: string) {
    this.geography.selectBuilding(id);
    this.invalidate();
  }

  zoom(factor: number) {
    this.view.zoom(factor);
    this.invalidate();
  }

  pan(x: number, z: number) {
    this.view.stop();
    this.view.pan(new Vector2(), new Vector2(-x, z));
    this.invalidate();
  }

  reset() {
    this.view.reset();
    this.invalidate();
  }

  focus(point: Point, span?: number) {
    this.view.focus(point, span);
    this.invalidate();
  }

  dispose() {
    cancelAnimationFrame(this.animation);
    this.observer.disconnect();
    this.events.abort();
    this.geography.dispose();
    this.scene.clear();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }

  private resize() {
    const { clientWidth: width, clientHeight: height } = this.canvas;
    if (!width || !height || (width === this.width && height === this.height)) return;
    this.width = width;
    this.height = height;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(width, height, false);
    this.view.resize(width, height);
    this.invalidate();
  }

  private invalidate() {
    if (!this.animation) this.animation = requestAnimationFrame(this.draw);
  }

  private readonly draw = (time: number) => {
    this.animation = 0;
    if (!this.width || !this.height) return;
    const seconds = this.lastFrame ? Math.min((time - this.lastFrame) / 1000, 0.05) : 1 / 60;
    const moving = this.view.advance(seconds, this.reducedMotion.matches);
    this.lastFrame = time;
    const { detail, camera, verticalSpan } = this.view;
    this.geography.setDetail(detail);
    this.renderer.render(this.scene, camera);
    const projected = new Vector3();
    const project = (anchors: readonly Anchor[]) => anchors.flatMap(({ id, position: [x, z], height }) => {
      projected.set(x, (height ?? 0) * detail, z).project(camera);
      if (Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1 || Math.abs(projected.z) > 1) return [];
      return [{ id, x: (projected.x + 1) * this.width / 2, y: (1 - projected.y) * this.height / 2 }];
    });
    const metersPerPixel = verticalSpan / this.height;
    const scale = [500, 200, 100, 50, 20, 10, 5, 2, 1].find(meters => meters <= metersPerPixel * 108) ?? 1;
    const characters = project(this.characters);
    const layout = layoutMarkers([...characters, ...project(this.locations)], this.width, this.height);
    this.onFrame({
      districts: new Map(project(this.districts).map(anchor => [anchor.id, anchor])),
      water: project([this.water])[0],
      locations: new Map(layout.slice(characters.length).map(anchor => [anchor.id, anchor])),
      characters: new Map(layout.slice(0, characters.length).map(anchor => [anchor.id, anchor])),
      detail,
      northAngle: this.view.northAngle,
      labelColor: this.labelColor,
      scale,
      scaleWidth: scale / metersPerPixel,
    });
    if (moving) this.invalidate();
    else this.lastFrame = 0;
  };

  private screen(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect();
    return new Vector2(
      2 * (clientX - rect.left) / rect.width - 1,
      1 - 2 * (clientY - rect.top) / rect.height,
    );
  }

  private readonly wheel = (event: WheelEvent) => {
    event.preventDefault();
    const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.height : 1);
    const factor = Math.exp(Math.max(-1.4, Math.min(1.4, pixels * 0.0018)));
    this.view.zoom(factor, this.screen(event.clientX, event.clientY));
    this.invalidate();
  };

  private readonly pointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || this.fingers.size === 2) return;
    this.view.stop();
    this.canvas.setPointerCapture(event.pointerId);
    this.fingers.set(event.pointerId, new Vector2(event.clientX, event.clientY));
    if (this.fingers.size === 1) {
      this.pointerStart = new Vector2(event.clientX, event.clientY);
      this.dragged = false;
    } else {
      this.dragged = true;
      this.canvas.classList.add('dragging');
    }
  };

  private readonly pointerMove = (event: PointerEvent) => {
    const previous = this.fingers.get(event.pointerId);
    if (!previous) return;
    const current = new Vector2(event.clientX, event.clientY);
    this.fingers.set(event.pointerId, current);
    const dragFrom = this.dragged ? previous : this.pointerStart!;
    if (!this.dragged && dragFrom.distanceTo(current) < 4) return;
    this.dragged = true;
    this.canvas.classList.add('dragging');
    if (this.fingers.size === 2) {
      const other = [...this.fingers.entries()].find(([id]) => id !== event.pointerId)![1];
      const midpoint = (point: Vector2) => this.screen((point.x + other.x) / 2, (point.y + other.y) / 2);
      const nextCenter = midpoint(current);
      this.view.pan(midpoint(previous), nextCenter);
      this.view.zoom(Math.max(1, previous.distanceTo(other)) / Math.max(1, current.distanceTo(other)), nextCenter, true);
    } else {
      this.view.pan(this.screen(dragFrom.x, dragFrom.y), this.screen(current.x, current.y));
    }
    this.invalidate();
  };

  private readonly pointerUp = (event: PointerEvent) => {
    if (!this.fingers.has(event.pointerId)) return;
    this.pointerCancel(event);
    if (this.dragged) return;
    this.raycaster.setFromCamera(this.screen(event.clientX, event.clientY), this.view.camera);
    const hits = this.raycaster.intersectObjects(this.geography.buildingMeshes, false);
    const building = hits.find(hit => hit.object.visible && hit.object.parent?.visible);
    this.onPick(building?.object.userData.buildingId);
  };

  private readonly pointerCancel = (event: PointerEvent) => {
    this.fingers.delete(event.pointerId);
    if (!this.fingers.size) this.canvas.classList.remove('dragging');
  };
}
