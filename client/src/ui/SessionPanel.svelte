<script lang="ts">
  import type { City } from '../render/city-data';
  import type { CommandResult } from '../simulation/protocol';
  import type { ClientState, SimulationClient } from '../simulation/simulation-client';

  const { client, city, title }: { client: SimulationClient; city: City; title: string } = $props();
  let session: ClientState | undefined = $state();
  let pending = $state(false);
  let actionError: string | null = $state(null);

  const statuses = {
    disconnected: 'Getrennt',
    connecting: 'Verbindet',
    connected: 'Verbunden',
  } as const;

  $effect(() => client.subscribe(value => { session = value; }));

  async function run(operation: () => Promise<unknown>) {
    pending = true;
    actionError = null;
    try {
      await operation();
    } catch (error) {
      actionError = error instanceof Error ? error.message : 'UNEXPECTED_ERROR';
    } finally {
      pending = false;
    }
  }

  async function command(operation: () => Promise<CommandResult>) {
    await run(async () => {
      const result = await operation();
      if (!result.accepted) actionError = result.code;
    });
  }

  function formatTime(minutes: number): string {
    const absoluteHour = Math.floor(minutes / 60);
    const hour = String(absoluteHour % 24).padStart(2, '0');
    const minute = String(minutes % 60).padStart(2, '0');
    return 'Tag ' + (Math.floor(absoluteHour / 24) + 1) + ', ' + hour + ':' + minute;
  }
</script>

<section aria-label={title} class="session">
  <div class="session-header">
    <div>
      <h2>{title}</h2>
      <p class="status" aria-live="polite">
        {statuses[session?.status ?? 'disconnected']}{session?.sessionId ? ' · ' + session.sessionId : ''}
      </p>
    </div>
    {#if session?.status === 'connected'}
      <button onclick={() => run(() => client.disconnect())} disabled={pending}>Trennen</button>
    {:else}
      <button class="primary" onclick={() => run(() => client.connect())} disabled={pending}>Verbinden</button>
    {/if}
  </div>

  {#if session?.error || actionError}
    <p class="error" role="alert">Fehler · {session?.error ?? actionError}</p>
  {/if}

  {#if session?.view}
    {@const view = session.view}
    <dl class="world">
      <div><dt>Spielzeit</dt><dd>{formatTime(view.gameMinutes)}</dd></div>
      <div><dt>Tick</dt><dd>{view.worldTick}</dd></div>
      <div><dt>Revision</dt><dd>{view.revision}</dd></div>
    </dl>
    {#if session.synchronizing}
      <p role="status">Zustand wird neu synchronisiert.</p>
    {/if}
    <ul class="characters" aria-label="Charaktere">
      {#each view.characters as character (character.id)}
        {@const controlled = view.controlled?.id === character.id ? view.controlled : null}
        {@const destination = city.locations.find(location => location.id !== controlled?.locationId)}
        <li aria-label={character.name}>
          <div>
            <strong>{character.name}</strong>
            <p>{character.position.x} m / {character.position.z} m ·
              {controlled ? 'Eigene Steuerung' : character.occupied ? 'Belegt' : character.eligible ? 'Frei' : 'Ambient'}
            </p>
            {#if controlled}<p>Bargeld · {controlled.cash}</p>{/if}
            {#if controlled?.travel}
              <p>Unterwegs · {controlled.travel.locationId} · {controlled.travel.remainingTicks} Spielmin.</p>
            {/if}
          </div>
          {#if controlled}
            <div class="actions">
              {#if destination}
                <button disabled={pending || session.synchronizing || !!controlled.travel}
                  onclick={() => command(() => client.moveTo(character.id, destination.id))}>
                  Zu Fuß zu {destination.name}
                </button>
              {/if}
              <button disabled={pending || session.synchronizing}
                onclick={() => command(() => client.releaseCharacter(character.id))}>
                Freigeben
              </button>
            </div>
          {:else if character.eligible}
            <button disabled={pending || session.synchronizing}
              onclick={() => command(() => client.acquireCharacter(character.id))}>
              Übernehmen
            </button>
          {/if}
        </li>
      {/each}
    </ul>
    <button class="snapshot" disabled={pending || session.synchronizing}
      onclick={() => run(() => client.requestSnapshot())}>Snapshot anfordern</button>
  {/if}
</section>
