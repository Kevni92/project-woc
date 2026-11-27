<script lang="ts">
  import { onMount } from 'svelte';
  import { loadWorldPackage } from '../../../client/src/content/world-package';
  import { MapRenderer } from '../../../client/src/render/map-renderer';
  let { jobId }: { jobId: string } = $props();
  let canvas: HTMLCanvasElement;
  let container: HTMLDivElement;
  let error = $state('');
  let ready = $state(false);
  onMount(() => {
    let renderer: MapRenderer | undefined;
    let disposed = false;
    void loadWorldPackage(new URL(`/api/jobs/${jobId}/package/`, location.href)).then(world => {
      if (!disposed) { renderer = new MapRenderer(container, canvas, world.city, world.visuals, world.theme, () => {}, () => {}); ready = true; }
    }).catch(e => { error = String(e); });
    return () => { disposed = true; renderer?.dispose(); };
  });
</script>
<div class="game-preview" bind:this={container}><canvas bind:this={canvas} aria-label="Three.js Spielvorschau"></canvas></div>
<p role="status">{ready ? 'Spielvorschau bereit' : 'Spielvorschau wird geladen …'}</p>
{#if error}<p role="alert">Spielvorschau: {error}</p>{/if}
