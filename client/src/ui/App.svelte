<script lang="ts">
  import type { SimulationClient } from '../simulation/simulation-client';
  import SessionPanel from './SessionPanel.svelte';

  const { clients }: { clients: [SimulationClient, SimulationClient] } = $props();
</script>

<main>
  <header>
    <p class="project-name">Project WOC</p>
    <h1>Simulations-Debugger</h1>
  </header>
  <div class="sessions">
    <SessionPanel client={clients[0]} title="Client A" />
    <SessionPanel client={clients[1]} title="Client B" />
  </div>
</main>
