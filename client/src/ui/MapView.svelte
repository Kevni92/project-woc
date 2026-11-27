<script lang="ts">
  import { untrack } from 'svelte';
  import { city } from '../render/city-data';
  import type { Point } from '../render/city-data';
  import type { CommandResult } from '../simulation/protocol';
  import type { ClientState, SimulationClient } from '../simulation/simulation-client';
  import MapViewport from './MapViewport.svelte';
  import { formatClock, projectMap } from './map-projection';
  import type { MarkerKind } from './map-projection';

  type Selection = { kind: 'location' | 'building' | 'character'; id: string };

  let { client, debugUrl, ondebug }: { client: SimulationClient; debugUrl: string; ondebug: (event: MouseEvent) => void } = $props();
  let viewport: MapViewport;
  let session = $state.raw<ClientState>();
  let pending = $state(false);
  let awaitingRevision = $state<number>();
  let actionError = $state<string>();
  let selection = $state<Selection>();

  const waitingForUpdate = $derived(awaitingRevision !== undefined && (session?.view?.revision ?? -1) < awaitingRevision);
  const projection = $derived(projectMap(session, pending || waitingForUpdate));
  const selectedLocation = $derived(selection?.kind === 'location' ? city.locations.find(location => location.id === selection?.id) : undefined);
  const selectedBuilding = $derived(selection?.kind === 'building' ? city.buildings.find(building => building.id === selection?.id) : undefined);
  const selectedCharacter = $derived(selection?.kind === 'character' ? projection.markers.find(marker => marker.id === selection?.id) : undefined);
  const districtName = (id: string) => city.districts.find(district => district.id === id)?.name;

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

  function select(next?: Selection, focusPoint?: Point) {
    selection = next;
    actionError = undefined;
    if (focusPoint) viewport.focus(focusPoint);
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

<header class="atlas-header">
  <div class="atlas-header-inner">
    <div class="atlas-logo"><span aria-hidden="true">◈</span> PROJECT <strong>WOC</strong></div>
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
    <a class="debug-link" href={debugUrl} onclick={ondebug}>Debugger <span aria-hidden="true">↗</span></a>
  </div>
</header>

<main class="atlas">
  <div class="atlas-title">
    <div>
      <p class="atlas-kicker">Stadtkarte</p>
      <h1>{city.name}</h1>
    </div>
    <dl class="atlas-telemetry">
      <div>
        <dt>Spielzeit</dt>
        <dd>{projection.gameMinutes === undefined ? '–' : formatClock(projection.gameMinutes)}</dd>
      </div>
      <div>
        <dt>Steuerung</dt>
        <dd>{projection.controlled?.name ?? '–'}</dd>
      </div>
    </dl>
  </div>

  <div class="atlas-body">
    <div class="atlas-map">
      <MapViewport bind:this={viewport} markers={projection.markers} gameMinutes={projection.gameMinutes}
        {selection} focusPoint={projection.controlled?.position} onselect={select} />
      <ul class="map-legend" aria-label="Kartenlegende">
        <li class="owned"><span class="marker-symbol"></span> Eigene Steuerung</li>
        <li class="resident"><span class="marker-symbol"></span> Bewohner</li>
        <li class="ambient"><span class="marker-symbol"></span> Passant</li>
        <li><span class="legend-location"></span> Ort</li>
      </ul>
    </div>

    <aside class="atlas-sidebar" aria-label="Kartendetails">
      {#if session?.error || actionError}
        <p class="atlas-error" role="alert">{session?.error ?? actionError}</p>
      {/if}
      {#if selectedLocation || selectedBuilding || selectedCharacter}
        <section class="map-details" aria-label="Auswahl">
          <div class="details-heading">
            <p class="atlas-kicker">{selectedLocation?.type ?? (selectedBuilding ? 'Gebäude' : 'Charakter')}</p>
            <button class="clear-selection" aria-label="Auswahl schließen" onclick={() => select()}>×</button>
          </div>
          {#if selectedLocation}
            <h2>{selectedLocation.name}</h2>
            <p class="detail-meta">{districtName(selectedLocation.district)}</p>
            <p class="detail-description">{selectedLocation.description}</p>
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
              <div><dt>Position</dt><dd>{marker.position[0]} m / {marker.position[1]} m</dd></div>
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
      {/if}

      <section class="atlas-directory" aria-labelledby="places-heading">
        <h2 id="places-heading">Orte</h2>
        <ul>
          {#each city.locations as location (location.id)}
            <li>
              <button class="directory-item" aria-pressed={selectedLocation?.id === location.id}
                onclick={() => select({ kind: 'location', id: location.id }, location.position)}>
                <span class="legend-location"></span>
                <span>{location.name}<small>{districtName(location.district)}</small></span>
                <span class="directory-arrow" aria-hidden="true">↗</span>
              </button>
            </li>
          {/each}
        </ul>
      </section>

      <section class="atlas-directory" aria-labelledby="characters-heading">
        <h2 id="characters-heading">Charaktere</h2>
        {#if projection.markers.length}
          <ul>
            {#each projection.markers as marker (marker.id)}
              <li>
                <button class="directory-item {marker.kind}" aria-pressed={selectedCharacter?.id === marker.id}
                  onclick={() => select({ kind: 'character', id: marker.id }, marker.position)}>
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
    </aside>
  </div>
</main>
