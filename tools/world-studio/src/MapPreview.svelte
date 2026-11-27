<script lang="ts">
  import { onMount } from 'svelte';
  import { loadWorldPackage } from '../../../client/src/content/world-package';
  import type { WorldPackage } from '../../../client/src/content/world-package';
  import type { Area } from '../../../client/src/render/area-geometry';
  import type { Point } from '../../../client/src/render/city-data';
  let { jobId }: { jobId: string } = $props();
  let canvas: HTMLCanvasElement;
  let world = $state.raw<WorldPackage>();
  let error = $state('');
  let layers = $state({ buildings: true, roads: true, water: true, greens: true, graph: true, spawns: true });
  onMount(() => { void loadWorldPackage(new URL(`/api/jobs/${jobId}/package/`, location.href)).then(w => { world = w; }).catch(e => { error = String(e); }); });
  $effect(() => {
    const w = world;
    const visible = { ...layers };
    if (!w || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const city = w.city;
    const bounds = city.bounds;
    const scale = Math.min(760 / (bounds.maxX - bounds.minX), 450 / (bounds.maxZ - bounds.minZ));
    const project = ([x, z]: Point) => [20 + (x - bounds.minX) * scale, 20 + (z - bounds.minZ) * scale];
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = visible.water ? '#9ac8d5' : '#eee'; ctx.fillRect(0, 0, 800, 490);
    function line(points: readonly Point[], close = false) {
      points.forEach((point, i) => { const [x, y] = project(point); if (!i) ctx!.moveTo(x, y); else ctx!.lineTo(x, y); });
      if (close) ctx!.closePath();
    }
    function area(value: Area | readonly Point[], color: string) {
      ctx!.beginPath();
      const polygons = Array.isArray(value) ? [{ outer: value as readonly Point[], holes: [] }] : (value as Area).polygons;
      for (const poly of polygons) { line(poly.outer, true); for (const hole of poly.holes) line(hole, true); }
      ctx!.fillStyle = color; ctx!.fill('evenodd');
    }
    if (city.version === 3) area(city.land, '#ddd9bd');
    else for (const land of city.land) area(land, '#ddd9bd');
    if (visible.greens) for (const surface of w.visuals.surfaces) if (surface.kind === 'grass') area(surface.polygon, '#8fbf83');
    if (visible.roads) for (const road of city.roads) { ctx.beginPath(); line(road.path); ctx.strokeStyle = '#837c73'; ctx.lineWidth = Math.max(1, road.width * scale); ctx.stroke(); }
    if (visible.buildings) for (const building of city.buildings) area(building.footprint, '#b36c54');
    if (visible.graph) for (const edge of city.navigation.edges) { ctx.beginPath(); line(edge.path); ctx.strokeStyle = '#793cd2'; ctx.lineWidth = 1.5; ctx.stroke(); }
    if (visible.spawns) {
      const nodes = new Map(city.navigation.nodes.map(n => [n.id, n.position]));
      for (const spawn of Object.values(city.navigation.spawns)) if ('node' in spawn) {
        const point = nodes.get(spawn.node); if (!point) continue; const [x, y] = project(point);
        ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fillStyle = '#df2935'; ctx.fill();
      }
    }
  });
</script>
<div class="layers">
  {#each Object.entries({ buildings: 'Gebäude', roads: 'Straßen', water: 'Gewässer', greens: 'Grünflächen', graph: 'Fußwegenetz', spawns: 'Startpositionen' }) as [key, label]}
    <label><input type="checkbox" bind:checked={layers[key as keyof typeof layers]}>{label}</label>
  {/each}
</div>
<canvas class="map-preview" width="800" height="490" bind:this={canvas} aria-label="Importierte Kartenvorschau"></canvas>
{#if error}<p role="alert">Kartenvorschau: {error}</p>{/if}
