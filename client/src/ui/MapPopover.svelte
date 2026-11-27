<script lang="ts">
  import { onMount } from 'svelte';
  import type { Snippet } from 'svelte';
  import { placePopover, type ScreenAnchor } from '../render/map-anchors';

  let { anchor, pins, children }: { anchor?: ScreenAnchor; pins: readonly ScreenAnchor[]; children: Snippet } = $props();
  let area: HTMLDivElement;
  let bounds = $state({ left: 0, top: 0, width: 0, height: 0 });
  let width = $state(0);
  let height = $state(0);
  const placement = $derived(placePopover(bounds, width, height, anchor, pins));

  onMount(() => {
    const measure = () => {
      bounds = { left: area.offsetLeft, top: area.offsetTop, width: area.clientWidth, height: area.clientHeight };
    };
    const observer = new ResizeObserver(measure);
    observer.observe(area);
    measure();
    return () => observer.disconnect();
  });
</script>

<div class="map-popover-area" bind:this={area}>
  {#if anchor && placement.x !== undefined && placement.y !== undefined}
    {@const dx = placement.x - anchor.x}
    {@const dy = placement.y - anchor.y}
    <span aria-hidden="true" class="popover-leader" style:left={anchor.x - bounds.left + 'px'}
      style:top={anchor.y - bounds.top + 'px'} style:width={Math.hypot(dx, dy) + 'px'}
      style:transform={'rotate(' + Math.atan2(dy, dx) + 'rad)'}></span>
  {/if}
  <div class="map-popover-panel" data-map-overlay bind:offsetWidth={width} bind:offsetHeight={height}
    style:--popover-x={placement.left - bounds.left + 'px'} style:--popover-y={placement.top - bounds.top + 'px'}>
    {@render children()}
  </div>
</div>
