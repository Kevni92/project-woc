<script lang="ts">
  import { onMount } from 'svelte';
  import { city } from '../render/city-data';
  import { MapRenderer } from '../render/map-renderer';
  import type { MarkerLayout } from '../render/map-anchors';
  import type { MapFrame } from '../render/map-renderer';
  import type { Point } from '../render/city-data';
  import type { Route } from '../simulation/protocol';
  import type { CharacterMarker } from './map-projection';
  import './map.css';

  interface Props {
    markers: readonly CharacterMarker[];
    gameMinutes?: number;
    route?: Route;
    selection?: { kind: 'location' | 'building' | 'character'; id: string };
    focusPoint?: Point;
    onselect: (selection: Props['selection']) => void;
  }

  let { markers, gameMinutes, route, selection, focusPoint, onselect }: Props = $props();
  let canvas: HTMLCanvasElement;
  let container: HTMLElement;
  let renderer = $state.raw<MapRenderer>();
  let frame = $state.raw<MapFrame>();
  let failed = $state(false);

  onMount(() => {
    try {
      renderer = new MapRenderer(container, canvas, city, value => { frame = value; }, id => {
        onselect(id ? { kind: 'building', id } : undefined);
      });
    } catch (error) {
      console.error(error);
      failed = true;
    }
    return () => renderer?.dispose();
  });

  $effect(() => {
    const characters = markers;
    renderer?.setCharacters(characters);
  });

  $effect(() => {
    const minutes = gameMinutes ?? 480;
    renderer?.setTime(minutes);
  });

  $effect(() => renderer?.setRoute(route));

  $effect(() => {
    const buildingId = selection?.kind === 'building' ? selection.id
      : selection?.kind === 'location' ? city.locations.find(location => location.id === selection?.id)?.building
      : undefined;
    renderer?.selectBuilding(buildingId);
  });

  export function focus(position: Point) {
    renderer?.focus(position);
  }

  function keydown(event: KeyboardEvent) {
    switch (event.key) {
      case '+':
      case '=': renderer?.zoom(0.64); break;
      case '-': renderer?.zoom(1 / 0.64); break;
      case 'ArrowLeft': renderer?.pan(-0.22, 0); break;
      case 'ArrowRight': renderer?.pan(0.22, 0); break;
      case 'ArrowUp': renderer?.pan(0, -0.22); break;
      case 'ArrowDown': renderer?.pan(0, 0.22); break;
      case 'Home': renderer?.reset(); break;
      case 'Escape': onselect(undefined); break;
      default: return;
    }
    event.preventDefault();
  }
</script>

{#snippet leader(anchor: MarkerLayout)}
  {#if anchor.dx || anchor.dy}
    <span class="marker-leader" aria-hidden="true" style:left={anchor.x + 'px'} style:top={anchor.y + 'px'}
      style:width={Math.hypot(anchor.dx, anchor.dy) + 'px'}
      style:transform={'rotate(' + Math.atan2(anchor.dy, anchor.dx) + 'rad)'}></span>
  {/if}
{/snippet}

<section bind:this={container} class="map-viewport" aria-label="Stadtkarte" style:--map-label={frame?.labelColor}>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions (The application is a keyboard-operated spatial canvas.) -->
  <div class="map-surface"
    role="application"
    tabindex={failed ? -1 : 0}
    aria-label={'Interaktive Karte von ' + city.name}
    aria-describedby="map-help"
    onkeydown={keydown}
  >
    <canvas bind:this={canvas}></canvas>
  </div>
  <p id="map-help" class="sr-only">
    Mit den Pfeiltasten verschieben, mit Plus und Minus zoomen, mit Pos1 zurücksetzen.
    Orte und Charaktere lassen sich auch in der Seitenleiste auswählen.
  </p>

  {#if failed}
    <p class="map-failure" role="alert">Die Karte braucht WebGL 2. Orte und Charaktere sind über die Liste verfügbar.</p>
  {:else if frame}
    {@const water = frame.water}
    <div class="map-labels" aria-hidden="true">
      {#each city.districts as district (district.id)}
        {@const anchor = frame.districts.get(district.id)}
        {#if anchor && frame.detail < 0.7}
          <span class="district-label" style:left={anchor.x + 'px'} style:top={anchor.y + 'px'}>{district.name}</span>
        {/if}
      {/each}
      {#if water && frame.detail < 0.45}
        <span class="water-label" style:left={water.x + 'px'} style:top={water.y + 'px'}>{city.waterLabel.name}</span>
      {/if}
    </div>

    <div class="map-locations">
      {#each city.locations as location (location.id)}
        {@const anchor = frame.locations.get(location.id)}
        {@const active = selection?.kind === 'location' && selection.id === location.id}
        {#if anchor}
          {@render leader(anchor)}
          <button class="location-pin" class:active class:label-above={anchor.dy < 0} aria-label={location.name} aria-pressed={active}
            style:left={anchor.x + anchor.dx + 'px'} style:top={anchor.y + anchor.dy + 'px'}
            onclick={() => onselect({ kind: 'location', id: location.id })}>
            <span class="pin-dot" aria-hidden="true"></span><span class="pin-label">{location.name}</span>
          </button>
        {/if}
      {/each}
    </div>

    <div class="map-markers">
      {#each markers as marker (marker.id)}
        {@const anchor = frame.characters.get(marker.id)}
        {@const active = selection?.kind === 'character' && selection.id === marker.id}
        {#if anchor}
          {@render leader(anchor)}
          <button class="character-pin {marker.kind}" class:active aria-label={marker.name} aria-pressed={active}
            style:left={anchor.x + anchor.dx + 'px'} style:top={anchor.y + anchor.dy + 'px'}
            onclick={() => onselect({ kind: 'character', id: marker.id })}>
            <span class="marker-symbol" aria-hidden="true"></span>
            <span class="character-label" aria-hidden="true">{marker.name}</span>
          </button>
        {/if}
      {/each}
    </div>

    <div class="compass" title="Kartennorden" aria-label="Kartennorden">
      <span>N</span><i style:transform={'rotate(' + frame.northAngle + 'rad)'}></i>
    </div>
    <div class="map-mode" aria-label="Kartendarstellung">{frame.detail === 0 ? '2D' : '3D'}</div>
    <div class="map-scale" aria-label={'Maßstab ' + frame.scale + ' Meter'}>
      <span>{frame.scale} m</span>
      <span class="scale-line" style:width={frame.scaleWidth + 'px'}></span>
    </div>
    <div class="map-controls" role="group" aria-label="Kartensteuerung">
      <button class="focus-button" onclick={() => focus(focusPoint ?? city.start)}
        aria-label={focusPoint ? 'Eigenen Charakter fokussieren' : 'Startbereich fokussieren'}
        title={focusPoint ? 'Eigenen Charakter fokussieren' : 'Startbereich fokussieren'}>⌖</button>
      <div class="zoom-controls">
        <button onclick={() => renderer?.zoom(0.64)} aria-label="Vergrößern" title="Vergrößern">+</button>
        <button onclick={() => renderer?.zoom(1 / 0.64)} aria-label="Verkleinern" title="Verkleinern">−</button>
      </div>
      <button onclick={() => renderer?.reset()} aria-label="Karte zurücksetzen" title="Karte zurücksetzen">↺</button>
    </div>
  {/if}
</section>
