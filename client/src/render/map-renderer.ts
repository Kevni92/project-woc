import { Color, Raycaster, Scene, Vector2, Vector3, WebGLRenderer } from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { MapCamera, visibilityAt } from './map-camera';
import { GeographyLayer } from './geography-layer';
import { layoutMarkers } from './map-anchors';
import { MapPalette, twilight } from './palette';
import type { City, Point } from './city-data';
import { parts } from './area-geometry';
import type { Anchor, MarkerLayout, ScreenAnchor } from './map-anchors';
import type { Route } from '../simulation/protocol';
import type { MapTheme, MapVisuals } from './visual-data';

export interface MapFrame {
  readonly districts: ReadonlyMap<string, ScreenAnchor>;
  readonly water?: ScreenAnchor;
  readonly locations: ReadonlyMap<string, MarkerLayout>;
  readonly characters: ReadonlyMap<string, MarkerLayout>;
  readonly building?: ScreenAnchor;
  readonly detail: number;
  readonly northAngle: number;
  readonly labelColor: string;
  readonly scale: number;
  readonly scaleWidth: number;
}

export class MapRenderer {
  private readonly scene = new Scene();
  private readonly routeLine = new Line2(
    new LineGeometry(), new LineMaterial({ linewidth: 3 }),
  );
  private routePoints?: Route['points'];
  private readonly renderer: WebGLRenderer;
  private readonly geography: GeographyLayer;
  private readonly view: MapCamera;
  private readonly palette: MapPalette;
  private readonly observer: ResizeObserver;
  private readonly events = new AbortController();
  private readonly districts: Anchor[];
  private readonly water?: Anchor;
  private readonly outside?: Color;
  private readonly locations: Anchor[];
  private readonly buildings: ReadonlyMap<string, Anchor>;
  private readonly raycaster = new Raycaster();
  private readonly fingers = new Map<number, Vector2>();
  private pointerStart?: Vector2;
  private dragged = false;
  private rotating = false;
  private selectedBuilding?: string;
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
    visuals: MapVisuals,
    private readonly theme: MapTheme,
    private readonly onFrame: (frame: MapFrame) => void,
    private readonly onPick: (buildingId?: string) => void,
  ) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true });
    this.geography = new GeographyLayer(city, visuals, theme);
    this.view = new MapCamera(city.bounds, theme.lod);
    this.palette = new MapPalette(theme);
    this.districts = city.districts.map(district => ({ id: district.id, position: district.label }));
    this.water = city.waterLabel && { id: city.id, position: city.waterLabel.position };
    if (city.version === 3 && city.boundaryMode === 'natural') this.outside = new Color('#303639');
    const heights = new Map(city.buildings.map(building => [building.id, building.height]));
    this.locations = city.locations.map(location => ({
      id: location.id,
      position: location.position,
      height: location.building ? heights.get(location.building) : undefined,
    }));
    this.buildings = new Map(city.buildings.map(({ id, footprint, height }) => {
      const ring = parts(footprint)[0].outer;
      const center = ring.reduce(([x, z], [px, pz]) => [x + px, z + pz], [0, 0]);
      return [id, { id, position: [center[0] / ring.length, center[1] / ring.length], height }];
    }));
    this.scene.add(this.geography.group);
    this.routeLine.visible = false;
    this.routeLine.frustumCulled = false;
    this.scene.add(this.routeLine);
    this.setTime(480);

    const { signal } = this.events;
    container.addEventListener('wheel', this.wheel, { passive: false, signal });
    canvas.addEventListener('pointerdown', this.pointerDown, { signal });
    canvas.addEventListener('pointermove', this.pointerMove, { signal });
    canvas.addEventListener('pointerup', this.pointerUp, { signal });
    canvas.addEventListener('pointercancel', this.pointerCancel, { signal });
    canvas.addEventListener('lostpointercapture', this.pointerCancel, { signal });
    canvas.addEventListener('contextmenu', this.contextMenu, { signal });

    this.observer = new ResizeObserver(() => this.resize());
    this.resize();
    this.view.advance(0, true);
    this.observer.observe(canvas);
  }

  setTime(minutes: number) {
    const daylight = twilight(minutes);
    if (daylight === this.daylight) return;
    this.daylight = daylight;
    const palette = this.palette.at(daylight);
    this.scene.background = this.outside ?? palette.waterHorizon;
    this.labelColor = '#' + palette.label.getHexString();
    this.geography.setPalette(palette);
    this.routeLine.material.color.copy(palette.route);
    this.invalidate();
  }

  setCharacters(characters: readonly Anchor[]) {
    this.characters = characters;
    this.invalidate();
  }

  setRoute(route?: Route) {
    const points = route?.points;
    const visible = !!points && points.length > 1;
    const changed = visible !== this.routeLine.visible;
    this.routeLine.visible = visible;
    if (visible && points && (points.length !== this.routePoints?.length
      || !points.every((point, i) => point.x === this.routePoints?.[i].x && point.z === this.routePoints?.[i].z))) {
      this.routePoints = points;
      this.routeLine.geometry.dispose();
      this.routeLine.geometry = new LineGeometry().setPositions(points.flatMap(({ x, z }) => [x, 12 * this.theme.layerStepM, z]));
      this.invalidate();
    }
    if (changed) this.invalidate();
  }

  selectBuilding(id?: string) {
    this.selectedBuilding = id;
    this.geography.selectBuilding(id);
    this.invalidate();
  }

  rotate(radians: number) {
    this.view.rotate(radians);
    this.invalidate();
  }

  orientNorth() {
    this.view.orientNorth();
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
    this.routeLine.geometry.dispose();
    this.routeLine.material.dispose();
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
    this.geography.setDetail(detail, visibilityAt(verticalSpan, this.theme.lod.facadeSpanM),
      visibilityAt(verticalSpan, this.theme.lod.markingsSpanM));
    this.renderer.render(this.scene, camera);
    const projected = new Vector3();
    const project = (anchors: readonly Anchor[]) => anchors.flatMap(({ id, position: [x, z], height }) => {
      const y = height === undefined ? 0 : 13 * this.theme.layerStepM + height * detail;
      projected.set(x, y, z).project(camera);
      if (Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1 || Math.abs(projected.z) > 1) return [];
      return [{ id, x: (projected.x + 1) * this.width / 2, y: (1 - projected.y) * this.height / 2 }];
    });
    const metersPerPixel = verticalSpan / this.height;
    const maxScaleWidth = this.width <= 380 ? 54 : 108;
    const scale = [500, 200, 100, 50, 20, 10, 5, 2, 1].find(meters => meters <= metersPerPixel * maxScaleWidth) ?? 1;
    const characters = project(this.characters);
    const layout = layoutMarkers([...characters, ...project(this.locations)], this.width, this.height);
    const building = this.selectedBuilding ? this.buildings.get(this.selectedBuilding) : undefined;
    this.onFrame({
      districts: new Map(project(this.districts).map(anchor => [anchor.id, anchor])),
      water: this.water && project([this.water])[0],
      locations: new Map(layout.slice(characters.length).map(anchor => [anchor.id, anchor])),
      characters: new Map(layout.slice(0, characters.length).map(anchor => [anchor.id, anchor])),
      building: building && project([building])[0],
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
    if ((event.target as Element).closest('[data-map-overlay]')) return;
    event.preventDefault();
    const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.height : 1);
    const factor = Math.exp(Math.max(-1.4, Math.min(1.4, pixels * 0.0018)));
    this.view.zoom(factor, this.screen(event.clientX, event.clientY));
    this.invalidate();
  };

  private readonly pointerDown = (event: PointerEvent) => {
    if (![0, 2].includes(event.button) || this.fingers.size === 2) return;
    if (this.fingers.size && event.pointerType !== 'touch') return;
    this.view.stop();
    this.canvas.setPointerCapture(event.pointerId);
    this.fingers.set(event.pointerId, new Vector2(event.clientX, event.clientY));
    if (this.fingers.size === 1) {
      this.pointerStart = new Vector2(event.clientX, event.clientY);
      this.dragged = false;
      this.rotating = event.button === 2 || event.shiftKey;
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
    } else if (this.rotating) {
      this.view.rotate((current.x - dragFrom.x) * 0.009, true);
    } else {
      this.view.pan(this.screen(dragFrom.x, dragFrom.y), this.screen(current.x, current.y));
    }
    this.invalidate();
  };

  private readonly pointerUp = (event: PointerEvent) => {
    if (!this.fingers.has(event.pointerId)) return;
    this.pointerCancel(event);
    if (this.dragged || this.rotating) return;
    this.raycaster.setFromCamera(this.screen(event.clientX, event.clientY), this.view.camera);
    this.onPick(this.geography.pickBuilding(this.raycaster));
  };

  private readonly pointerCancel = (event: PointerEvent) => {
    this.fingers.delete(event.pointerId);
    if (!this.fingers.size) this.canvas.classList.remove('dragging');
  };

  private readonly contextMenu = (event: MouseEvent) => {
    if (event.button === 2 && this.rotating) event.preventDefault();
  };
}
