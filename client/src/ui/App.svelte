<script lang="ts">
  import { onMount } from 'svelte';
  import type { WorldPackage } from '../content/world-package';
  import type { SimulationClient } from '../simulation/simulation-client';
  import SessionPanel from './SessionPanel.svelte';

  const { clients, world }: { clients: [SimulationClient, SimulationClient]; world: WorldPackage } = $props();
  const originalUrl = new URL(location.href);
  const mapUrl = new URL(originalUrl);
  mapUrl.searchParams.delete('view');
  const debugUrl = new URL(originalUrl);
  debugUrl.searchParams.set('view', 'debug');
  let debug = $state(originalUrl.searchParams.get('view') === 'debug');
  let openedMap = false;

  function applyRoute() {
    debug = new URLSearchParams(location.search).get('view') === 'debug';
    if (debug || openedMap) return;
    openedMap = true;
    const unsubscribe = clients[0].subscribe(state => {
      if (state.status === 'disconnected') {
        // On first entry, the map opens a session. Connection errors reach its subscriber.
        void clients[0].connect().catch(() => {});
      }
    });
    unsubscribe();
  }

  function navigate(event: MouseEvent, url: URL) {
    if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    history.pushState(null, '', url);
    applyRoute();
  }

  onMount(() => {
    applyRoute();
    return () => {
      for (const client of clients) void client.disconnect();
    };
  });
</script>

<svelte:window onpopstate={applyRoute} />

{#if debug}
  <main>
    <header>
      <a class="debug-nav" href={mapUrl.href} onclick={event => navigate(event, mapUrl)}>Zur Stadtkarte</a>
      <p class="project-name">Project WOC</p>
      <h1>Simulations-Debugger</h1>
    </header>
    <div class="sessions">
      <SessionPanel client={clients[0]} city={world.city} title="Client A" />
      <SessionPanel client={clients[1]} city={world.city} title="Client B" />
    </div>
  </main>
{:else}
  {#await import('./MapView.svelte') then { default: MapView }}
    <MapView client={clients[0]} {world} debugUrl={debugUrl.href} ondebug={event => navigate(event, debugUrl)} />
  {/await}
{/if}
