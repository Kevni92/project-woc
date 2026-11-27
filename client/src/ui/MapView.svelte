<script lang="ts">
  import { tick, untrack } from 'svelte';
  import type { WorldPackage } from '../content/world-package';
  import type { Point } from '../render/city-data';
  import type { CommandResult, RoutePreviewResult } from '../simulation/protocol';
  import type { ClientState, SimulationClient } from '../simulation/simulation-client';
  import MapViewport from './MapViewport.svelte';
  import { formatClock, projectMap } from './map-projection';
  import type { MarkerKind } from './map-projection';

  type Selection = { kind: 'location' | 'building' | 'character'; id: string };

  let { client, world, debugUrl, ondebug }: {
    client: SimulationClient; world: WorldPackage; debugUrl: string; ondebug: (event: MouseEvent) => void;
  } = $props();
  const city = $derived(world.city);
  let viewport: MapViewport;
  let directory = $state<'places' | 'characters'>();
  let directoryTrigger: HTMLElement | undefined;
  let selectionOrigin: HTMLElement | undefined;
  let closeSelection: HTMLButtonElement;
  let session = $state.raw<ClientState>();
  let pending = $state(false);
  let awaitingRevision = $state<number>();
  let actionError = $state<string>();
  let selection = $state<Selection>();
  let preview = $state.raw<{ key: string; result: RoutePreviewResult }>();

  const waitingForUpdate = $derived(awaitingRevision !== undefined && (session?.view?.revision ?? -1) < awaitingRevision);
  const projection = $derived(projectMap(session, pending || waitingForUpdate));
  const selectedLocation = $derived(selection?.kind === 'location' ? city.locations.find(location => location.id === selection?.id) : undefined);
  const selectedBuilding = $derived(selection?.kind === 'building' ? city.buildings.find(building => building.id === selection?.id) : undefined);
  const selectedCharacter = $derived(selection?.kind === 'character' ? projection.markers.find(marker => marker.id === selection?.id) : undefined);
  const characterId = $derived(projection.controlled?.id);
  const locationId = $derived(selectedLocation?.id);
  const positionRevision = $derived(session?.view?.controlled?.positionRevision);
  const canPreview = $derived(!!characterId && !!locationId && !projection.travel);
  const snapshotSequence = $derived(session?.view?.snapshotSequence);
  const previewKey = $derived(canPreview
    ? [session?.sessionId, snapshotSequence, characterId, locationId, positionRevision].join('/') : undefined);
  const previewResult = $derived(preview?.key === previewKey ? preview?.result : undefined);
  const proposedRoute = $derived(previewResult?.accepted && previewResult.characterId === characterId
    && previewResult.locationId === locationId && previewResult.positionRevision === positionRevision
    ? previewResult.route : undefined);
  const route = $derived(projection.travel?.route ?? proposedRoute);
  const travelDestination = $derived(city.locations.find(location => location.id === projection.travel?.locationId));
  const arrivedAt = $derived(city.locations.find(location => location.id === projection.locationId));
  const districtName = (id: string) => city.districts.find(district => district.id === id)?.name;
  const meters = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });

  const markerLabels: Record<MarkerKind, string> = {
    owned: 'Eigene Steuerung', resident: 'Frei', occupied: 'Belegt', ambient: 'Ambient',
  };

  $effect(() => client.subscribe(value => {
    session = value;
    if (value.status === 'disconnected') {
      awaitingRevision = undefined;
      if (untrack(() => selection?.kind) === 'character') selection = undefined;
    }
  }));

  $effect(() => {
    const key = previewKey;
    const character = characterId;
    const location = locationId;
    if (!key || !character || !location) return;
    let current = true;
    void client.previewRoute(character, location).then(
      result => { if (current) preview = { key, result }; },
      error => {
        if (current) preview = { key, result: { accepted: false, code: error instanceof Error ? error.message : 'UNEXPECTED_ERROR' } };
      },
    );
    return () => { current = false; };
  });

  function select(next?: Selection, origin?: HTMLElement, focusPoint?: Point) {
    selection = next;
    actionError = undefined;
    if (!next) {
      selectionOrigin = undefined;
      return;
    }
    directory = undefined;
    if (origin) {
      selectionOrigin = origin;
      void tick().then(() => closeSelection?.focus({ preventScroll: true }));
    }
    if (focusPoint) viewport.focus(focusPoint);
  }

  function closeDetails() {
    const origin = selectionOrigin;
    select();
    if (origin?.isConnected && origin.getClientRects().length) origin.focus({ preventScroll: true });
    else viewport.focusSurface();
  }

  function toggleDirectory(next: typeof directory, trigger: HTMLElement) {
    directory = directory === next ? undefined : next;
    directoryTrigger = trigger;
    if (directory) select();
  }

  function fromDirectory(next: Selection, position: Point) {
    select(next, directoryTrigger, position);
  }

  function escape(event: KeyboardEvent) {
    if (event.key !== 'Escape' || (!selection && !directory)) return;
    event.preventDefault();
    if (selection) closeDetails();
    else {
      directory = undefined;
      directoryTrigger?.focus({ preventScroll: true });
    }
  }

  async function run(operation: () => Promise<CommandResult | void>) {
    pending = true;
    actionError = undefined;
    try {
      const result = await operation();
      if (result?.accepted) awaitingRevision = result.revision;
      else if (result) actionError = result.code;
    } catch (error) {
      actionError = error instanceof Error ? error.message : 'UNEXPECTED_ERROR';
    } finally {
      pending = false;
    }
  }
</script>

<svelte:window onkeydown={escape} />

{#snippet context()}
  <section class="map-details" aria-label="Auswahl">
    <div class="details-heading">
      <p class="atlas-kicker">{selectedLocation?.type ?? (selectedBuilding ? 'Gebäude' : 'Charakter')}</p>
      <button class="clear-selection" aria-label="Auswahl schließen" bind:this={closeSelection} onclick={closeDetails}>×</button>
    </div>
    {#if selectedLocation}
      <h2>{selectedLocation.name}</h2>
      <p class="detail-meta">{districtName(selectedLocation.district)}</p>
      <p class="detail-description">{selectedLocation.description}</p>
      {#if proposedRoute}
        {#if proposedRoute.distanceMm > 0}
          <p class="detail-meta route-preview">{meters.format(proposedRoute.distanceMm / 1000)} m · {proposedRoute.durationTicks} Spielmin.</p>
          {@const ownId = characterId}
          {@const destinationId = selectedLocation.id}
          {#if ownId}
            <button class="detail-action claim" disabled={!projection.canCommand}
              onclick={() => run(() => client.moveTo(ownId, destinationId))}>Zu Fuß gehen</button>
          {/if}
        {:else}
          <p class="detail-meta">Bereits am Ziel</p>
        {/if}
      {:else if previewResult && !previewResult.accepted}
        <p class="atlas-error" role="alert">{previewResult.code}</p>
      {/if}
    {:else if selectedBuilding}
      <h2>{selectedBuilding.id.toUpperCase()}</h2>
      <p class="detail-meta">{districtName(selectedBuilding.district)} · {selectedBuilding.height} m Höhe</p>
      {#each city.locations.filter(location => location.building === selectedBuilding?.id) as location (location.id)}
        <button class="detail-action" onclick={() => select({ kind: 'location', id: location.id })}>{location.name} ↗</button>
      {/each}
    {:else if selectedCharacter}
      {@const marker = selectedCharacter}
      <h2>{marker.name}</h2>
      <p class="detail-meta">{markerLabels[marker.kind]}</p>
      <dl class="character-details">
        <div><dt>Position</dt><dd>{meters.format(marker.position[0])} m / {meters.format(marker.position[1])} m</dd></div>
        {#if marker.kind === 'owned'}<div><dt>Bargeld</dt><dd>{projection.cash}</dd></div>{/if}
      </dl>
      {#if marker.kind === 'owned'}
        <button class="detail-action" disabled={!projection.canCommand}
          onclick={() => run(() => client.releaseCharacter(marker.id))}>Freigeben</button>
      {:else if marker.kind === 'resident' || marker.kind === 'occupied'}
        <button class="detail-action claim" disabled={!projection.canCommand || marker.kind === 'occupied'}
          onclick={() => run(() => client.acquireCharacter(marker.id))}>Übernehmen</button>
      {/if}
    {/if}
  </section>
{/snippet}

<main class="atlas">
  <header class="atlas-navigation">
    <div class="atlas-brand">
      <div class="atlas-logo"><span aria-hidden="true">◈</span> PROJECT WOC</div>
      <h1>{city.name}</h1>
    </div>
    <nav class="atlas-menu" aria-label="Kartenmenü">
      <button aria-expanded={directory === 'places'} aria-controls="map-places"
        onclick={event => toggleDirectory('places', event.currentTarget)}>Orte</button>
      <button aria-expanded={directory === 'characters'} aria-controls="map-characters"
        onclick={event => toggleDirectory('characters', event.currentTarget)}>Charaktere</button>
      <a class="debug-link" href={debugUrl} onclick={ondebug}>Debugger <span aria-hidden="true">↗</span></a>
    </nav>
    <section class="atlas-directory" id="map-places" aria-label="Orte" hidden={directory !== 'places'}>
      <ul>
        {#each city.locations as location (location.id)}
          <li>
            <button class="directory-item" aria-pressed={selectedLocation?.id === location.id}
              onclick={() => fromDirectory({ kind: 'location', id: location.id }, location.position)}>
              <span class="legend-location"></span>
              <span>{location.name}<small>{districtName(location.district)}</small></span>
              <span class="directory-arrow" aria-hidden="true">↗</span>
            </button>
          </li>
        {/each}
      </ul>
    </section>

    <section class="atlas-directory" id="map-characters" aria-label="Charaktere" hidden={directory !== 'characters'}>
      {#if projection.markers.length}
        <ul>
          {#each projection.markers as marker (marker.id)}
            <li>
              <button class="directory-item {marker.kind}" aria-pressed={selectedCharacter?.id === marker.id}
                onclick={() => fromDirectory({ kind: 'character', id: marker.id }, marker.position)}>
                <span class="marker-symbol"></span>
                <span>{marker.name}<small>{markerLabels[marker.kind]}</small></span>
                <span class="directory-arrow" aria-hidden="true">↗</span>
              </button>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="directory-empty">{projection.synchronizing ? 'Warte auf den Weltzustand.' : 'Keine Live-Daten.'}</p>
      {/if}
    </section>
  </header>

  <div class="atlas-session">
    <dl class="atlas-telemetry">
      <div><dt>Spielzeit</dt><dd>{projection.gameMinutes === undefined ? '–' : formatClock(projection.gameMinutes)}</dd></div>
      {#if projection.controlled}
        <div><dt>Steuerung</dt><dd>{projection.controlled.name}</dd></div>
        <div><dt>Bargeld</dt><dd>{projection.cash}</dd></div>
      {/if}
    </dl>
    <div class="atlas-status">
      <span class="atlas-live" class:online={session?.status === 'connected' && !projection.synchronizing} role="status">
        {projection.synchronizing ? 'Synchronisiert …' : session?.status === 'connected' ? 'Verbunden'
          : session?.status === 'connecting' ? 'Verbindet …' : 'Getrennt'}
      </span>
      {#if session?.status === 'connected'}
        <button class="atlas-quiet" disabled={pending} onclick={() => run(() => client.disconnect())}>Trennen</button>
      {:else if session?.status !== 'connecting'}
        <button class="atlas-quiet" disabled={pending} onclick={() => run(() => client.connect())}>Verbinden</button>
      {/if}
    </div>
  </div>

  <div class="atlas-feedback">
    {#if session?.error || actionError}
      <p class="atlas-error" role="alert">{session?.error ?? actionError}</p>
    {/if}
    {#if projection.travel && travelDestination}
      <section class="travel-details" aria-label="Laufende Reise">
        <p class="atlas-kicker">Zu Fuß unterwegs</p>
        <h2>{travelDestination.name}</h2>
        <p class="detail-meta">Noch {projection.travel.remainingTicks} Spielmin.</p>
      </section>
    {:else if arrivedAt}
      <p class="travel-arrival" role="status">Angekommen · {arrivedAt.name}</p>
    {/if}
  </div>
  <MapViewport bind:this={viewport} {world} markers={projection.markers} gameMinutes={projection.gameMinutes}
    {selection} {route} focusPoint={projection.controlled?.position} onselect={select}
    details={selectedLocation || selectedBuilding || selectedCharacter ? context : undefined} />
</main>
