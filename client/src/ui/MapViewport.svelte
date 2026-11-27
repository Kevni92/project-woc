<script lang="ts">
  import { onMount } from 'svelte';
  import type { Snippet } from 'svelte';
  import type { WorldPackage } from '../content/world-package';
  import { MapRenderer } from '../render/map-renderer';
  import { pinPosition, type MarkerLayout } from '../render/map-anchors';
  import type { MapFrame } from '../render/map-renderer';
  import type { Point } from '../render/city-data';
  import type { Route } from '../simulation/protocol';
  import type { CharacterMarker } from './map-projection';
  import MapPopover from './MapPopover.svelte';
  import './map.css';

  interface Props {
    world: WorldPackage;
    markers: readonly CharacterMarker[];
    gameMinutes?: number;
    route?: Route;
    selection?: { kind: 'location' | 'building' | 'character'; id: string };
    focusPoint?: Point;
    onselect: (selection: Props['selection'], origin?: HTMLElement) => void;
    details?: Snippet;
  }

  let { world, markers, gameMinutes, route, selection, focusPoint, onselect, details }: Props = $props();
  const city = $derived(world.city);
  let canvas: HTMLCanvasElement;
  let surface: HTMLElement;
  let container: HTMLElement;
  let renderer = $state.raw<MapRenderer>();
  let frame = $state.raw<MapFrame>();
  let failure = $state('');
  const selectedPin = $derived(selection?.kind === 'character' ? frame?.characters.get(selection.id)
    : selection?.kind === 'location' ? frame?.locations.get(selection.id) : undefined);
  const anchor = $derived(selectedPin ? pinPosition(selectedPin)
    : selection?.kind === 'building' && frame?.building?.id === selection.id ? frame.building : undefined);
  const pins = $derived(frame ? [...frame.characters.values(), ...frame.locations.values()].map(pinPosition) : []);
  const turn = Math.PI / 6;

  onMount(() => {
    try {
      renderer = new MapRenderer(container, canvas, city, world.visuals, world.theme, value => { frame = value; }, id => {
        onselect(id ? { kind: 'building', id } : undefined);
      });
    } catch {
      failure = 'Die Karte braucht WebGL 2. Orte und Charaktere sind über die Listen verfügbar.';
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

  export function focusSurface() {
    surface.focus({ preventScroll: true });
  }

  function labelAbove(anchor: MarkerLayout, name: string, frame: MapFrame) {
    const pin = pinPosition(anchor);
    const halfWidth = name.length * 3.5 + 20;
    let blockedBelow = false;
    for (const marker of frame.characters.values()) {
      const character = pinPosition(marker);
      if (Math.abs(character.x - pin.x) >= halfWidth) continue;
      const gap = character.y - pin.y;
      if (gap > -48 && gap < 0) return false;
      if (gap >= 0 && gap < 48) blockedBelow = true;
    }
    return anchor.dy < 0 || blockedBelow;
  }

  function keydown(event: KeyboardEvent) {
    switch (event.key.toLowerCase()) {
      case '+':
      case '=': renderer?.zoom(0.64); break;
      case '-': renderer?.zoom(1 / 0.64); break;
      case 'arrowleft': renderer?.pan(-0.22, 0); break;
      case 'arrowright': renderer?.pan(0.22, 0); break;
      case 'arrowup': renderer?.pan(0, -0.22); break;
      case 'arrowdown': renderer?.pan(0, 0.22); break;
      case 'q': renderer?.rotate(-turn); break;
      case 'e': renderer?.rotate(turn); break;
      case 'n': renderer?.orientNorth(); break;
      case 'home': renderer?.reset(); break;
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
    bind:this={surface}
    role="application"
    tabindex={failure ? -1 : 0}
    aria-label={'Interaktive Karte von ' + city.name}
    aria-describedby="map-help"
    onkeydown={keydown}
  >
    <canvas bind:this={canvas}></canvas>
  </div>
  <p id="map-help" class="sr-only">
    Mit den Pfeiltasten verschieben, mit Plus und Minus zoomen. Q und E drehen, N richtet nach Norden aus.
    Pos1 setzt die Übersicht zurück. Orte und Charaktere lassen sich auch in den Listen auswählen.
  </p>

  {#if failure}
    <p class="map-failure" role="alert">{failure}</p>
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
          <button class="location-pin" class:active class:label-above={labelAbove(anchor, location.name, frame)}
            aria-label={location.name} aria-pressed={active}
            style:left={anchor.x + anchor.dx + 'px'} style:top={anchor.y + anchor.dy + 'px'}
            onclick={event => onselect({ kind: 'location', id: location.id }, event.currentTarget)}>
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
            onclick={event => onselect({ kind: 'character', id: marker.id }, event.currentTarget)}>
            <span class="marker-symbol" aria-hidden="true"></span>
            <span class="character-label" aria-hidden="true">{marker.name}</span>
          </button>
        {/if}
      {/each}
    </div>

    <div class="map-scale" aria-label={'Maßstab ' + frame.scale + ' Meter'}>
      <span>{frame.scale} m</span>
      <span class="scale-line" style:width={frame.scaleWidth + 'px'}></span>
    </div>
    <div class="map-controls" role="group" aria-label="Kartensteuerung" data-map-overlay>
      <div class="map-mode" aria-label="Kartendarstellung">{frame.detail === 0 ? '2D' : '3D'}</div>
      <button class="compass" onclick={() => renderer?.orientNorth()} aria-label="Nach Norden ausrichten" title="Nach Norden ausrichten (N)">
        <i style:transform={'rotate(' + frame.northAngle + 'rad)'}></i><span>N</span>
      </button>
      <div class="control-pair rotation-controls">
        <button onclick={() => renderer?.rotate(-turn)} aria-label="Nach links drehen" title="Nach links drehen (Q)">↶</button>
        <button onclick={() => renderer?.rotate(turn)} aria-label="Nach rechts drehen" title="Nach rechts drehen (E)">↷</button>
      </div>
      <button class="focus-button" onclick={() => focus(focusPoint ?? city.start)}
        aria-label={focusPoint ? 'Eigenen Charakter fokussieren' : 'Startbereich fokussieren'}
        title={focusPoint ? 'Eigenen Charakter fokussieren' : 'Startbereich fokussieren'}>⌖</button>
      <div class="control-pair zoom-controls">
        <button onclick={() => renderer?.zoom(0.64)} aria-label="Vergrößern" title="Vergrößern">+</button>
        <button onclick={() => renderer?.zoom(1 / 0.64)} aria-label="Verkleinern" title="Verkleinern">−</button>
      </div>
      <button onclick={() => renderer?.reset()} aria-label="Karte zurücksetzen" title="Karte zurücksetzen">↺</button>
    </div>
  {/if}
  {#if details}
    <MapPopover {anchor} {pins}>{@render details()}</MapPopover>
  {/if}
</section>
