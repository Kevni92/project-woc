<script lang="ts">
  import { onMount } from 'svelte';
  import * as maplibregl from 'maplibre-gl';
  import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
  import { TerraDraw, TerraDrawFreehandMode, TerraDrawRectangleMode, TerraDrawSelectMode, TerraDrawRenderMode } from 'terra-draw';
  import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter';
  import type { Polygon } from './api';
  let { onselection, onready }: { onselection: (aoi: Polygon | null) => void; onready: () => void } = $props();
  let container: HTMLDivElement;
  let map: maplibregl.Map;
  let draw: TerraDraw;
  let ready = $state(false);
  let error = $state('');
  let mode = $state('pan');
  let query = $state('');
  let styleUrl = $state(localStorage.getItem('woc-map-style') ?? '');
  let geocoder = $state(localStorage.getItem('woc-geocoder') ?? '');
  let holes: number[][][] = [];
  let previousOuter: number[][] = [];
  let gestureStartOuter: number[][] | undefined;
  function displayHoles() {
    const source = map?.getSource('woc-aoi-holes') as maplibregl.GeoJSONSource | undefined;
    source?.setData({ type: 'FeatureCollection', features: holes.map(coordinates => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } })) });
  }
  function updateSelection(outer: number[][]) {
    previousOuter = outer.map(point => [...point]);
    onselection({ type: 'Polygon', coordinates: [outer, ...holes] });
  }
  const flags = { feature: { draggable: true, coordinates: { draggable: true, midpoints: true, deletable: true } } };
  onMount(() => {
    maplibregl.setWorkerUrl(workerUrl);
    const style = styleUrl || { version: 8 as const, sources: {}, layers: [{ id: 'background', type: 'background' as const, paint: { 'background-color': '#e2e9e5' } }] };
    map = new maplibregl.Map({ container, style, center: [8.8072, 53.0785], zoom: 12, attributionControl: false });
    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    map.on('error', e => { error = e.error?.message ?? 'Kartenstil konnte nicht geladen werden.'; });
    map.on('load', () => {
      map.addSource('woc-aoi-holes', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'woc-aoi-hole-lines', type: 'line', source: 'woc-aoi-holes', paint: { 'line-color': '#ba2929', 'line-width': 2, 'line-dasharray': [2, 2] } });
      draw = new TerraDraw({ adapter: new TerraDrawMapLibreGLAdapter({ map, coordinatePrecision: 9 }), modes: [
        new TerraDrawRectangleMode({ drawInteraction: 'click-drag' }),
        new TerraDrawFreehandMode({ drawInteraction: 'click-drag', smoothing: 0 }),
        new TerraDrawSelectMode({ flags: { rectangle: flags, freehand: flags } }),
        new TerraDrawRenderMode({ modeName: 'navigation', styles: {} }),
      ] });
      draw.on('finish', (id, context) => {
        const feature = draw.getSnapshotFeature(id);
        if (!feature || feature.geometry.type !== 'Polygon') return;
        if (context.mode === 'select') {
          const outer = feature.geometry.coordinates[0];
          if (context.action === 'dragFeature' && holes.length && gestureStartOuter?.length) {
            const dx = outer[0][0] - gestureStartOuter[0][0], dy = outer[0][1] - gestureStartOuter[0][1];
            holes = holes.map(ring => ring.map(([x, y]) => [x + dx, y + dy])); displayHoles();
          }
          gestureStartOuter = undefined; updateSelection(outer); return;
        }
        for (const other of draw.getSnapshot()) if (other.id !== id && other.geometry.type === 'Polygon') draw.removeFeatures([other.id!]);
        holes = []; displayHoles();
        updateSelection(feature.geometry.coordinates[0]);
        draw.setMode('select'); mode = 'select';
      });
      draw.on('change', (_ids, type) => {
        if (type === 'update' && draw.getMode() === 'select') {
          const feature = draw.getSnapshot().find(f => f.geometry.type === 'Polygon');
          if (feature && feature.geometry.type === 'Polygon') {
            const outer = feature.geometry.coordinates[0];
            if (!gestureStartOuter && JSON.stringify(outer) !== JSON.stringify(previousOuter)) gestureStartOuter = previousOuter.map(point => [...point]);
            updateSelection(outer);
          }
        } else if (type === 'delete' && draw.getMode() === 'select' && !draw.getSnapshot().some(f => f.geometry.type === 'Polygon')) {
          holes = []; displayHoles(); previousOuter = []; onselection(null);
        }
      });
      draw.start(); draw.setMode('navigation'); ready = true; onready();
    });
    return () => { draw?.stop(); map.remove(); };
  });
  export function setSelection(aoi: Polygon | null) {
    if (!draw) return;
    draw.clear();
    gestureStartOuter = undefined;
    holes = aoi?.coordinates.slice(1).map(ring => ring.map(point => [...point])) ?? [];
    displayHoles();
    if (aoi) {
      const outer = aoi.coordinates[0].map(point => point.map(value => Number(value.toFixed(9))));
      previousOuter = outer.map(point => [...point]);
      const [result] = draw.addFeatures([{ id: crypto.randomUUID(), type: 'Feature', geometry: { type: 'Polygon', coordinates: [outer] }, properties: { mode: 'freehand' } }]);
      if (!result.valid) { error = `Auswahl kann nicht geladen werden: ${result.reason ?? 'ungültige Geometrie'}`; onselection(null); return; }
      const coords = aoi.coordinates[0];
      const xs = coords.map(p => p[0]), ys = coords.map(p => p[1]);
      map.fitBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], { padding: 60, maxZoom: 16, duration: 0 });
    } else previousOuter = [];
    onselection(aoi);
  }
  export function center() { const p = map.getCenter(); return { lon: p.lng, lat: p.lat }; }
  function selectMode(next: string) {
    mode = next;
    draw.setMode(next === 'pan' ? 'navigation' : next);
  }
  async function search() {
    error = '';
    const match = query.trim().match(/^(-?\d+(?:\.\d+)?)\s*[,; ]\s*(-?\d+(?:\.\d+)?)$/);
    if (match) {
      const lat = Number(match[1]), lon = Number(match[2]);
      if (Math.abs(lat) >= 85 || Math.abs(lon) >= 180) { error = 'Koordinaten außerhalb des unterstützten Bereichs.'; return; }
      map.flyTo({ center: [lon, lat], zoom: 13 }); return;
    }
    if (!geocoder.includes('{query}')) { error = 'Für Ortssuche zuerst eine zulässige Geocoder-URL mit {query} konfigurieren.'; return; }
    try {
      const url = new URL(geocoder.replace('{query}', encodeURIComponent(query)));
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Nur HTTP(S) erlaubt');
      const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const results = await response.json();
      const first = Array.isArray(results) ? results[0] : undefined;
      if (!first || !Number.isFinite(Number(first.lat)) || !Number.isFinite(Number(first.lon))) throw new Error('Kein Ergebnis');
      map.flyTo({ center: [Number(first.lon), Number(first.lat)], zoom: 13 });
    } catch (e) { error = `Ortssuche fehlgeschlagen: ${String(e)}`; }
  }
</script>
<div class="toolbar">
  <label>Ort oder Koordinaten (Breite, Länge) <input bind:value={query} onkeydown={e => e.key === 'Enter' && search()}></label><button onclick={search}>Suchen</button>
  {#each [['pan', 'Navigation'], ['rectangle', 'Rechteck'], ['freehand', 'Freihand'], ['select', 'Bearbeiten']] as [value, title]}
    <button disabled={!ready} class:active={mode === value} onclick={() => selectMode(value)}>{title}</button>
  {/each}
  <button disabled={!ready} onclick={() => setSelection(null)}>Auswahl löschen</button>
</div>
<div class="geo-map" bind:this={container} aria-label="Geografische Karte"></div>
{#if error}<p role="alert">{error}</p>{/if}
<details><summary>Kartenanbieter und Geocoder</summary>
  <p>Leer: offline nutzbare Hintergrundkarte. Für externe Dienste gelten deren Nutzungsbedingungen und Attribution. Geocoder: JSON-Array mit lat/lon; keine automatische Suche.</p>
  <label>MapLibre-Stil-URL <input bind:value={styleUrl}></label>
  <label>Geocoder-URL mit {'{query}'} <input bind:value={geocoder}></label>
  <button onclick={() => { localStorage.setItem('woc-map-style', styleUrl); localStorage.setItem('woc-geocoder', geocoder); location.reload(); }}>Konfiguration speichern und neu laden</button>
</details>
