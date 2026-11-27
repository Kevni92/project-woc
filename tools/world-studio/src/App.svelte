<script lang="ts">
  import { onMount } from 'svelte';
  import GeoMap from './GeoMap.svelte';
  import GamePreview from './GamePreview.svelte';
  import MapPreview from './MapPreview.svelte';
  import { api, type Polygon, type Project, type Job } from './api';
  let project = $state<Project>({ version: 1, id: 'mein-projekt', map: { aoi: null, pbf: '', land: '', config: {
    worldId: 'meine-welt', name: 'Meine Welt', revision: 1, seed: 'woc', mode: 'natural', paddingM: 0,
    landSource: { provider: '', url: '', license: '', attribution: '', dataDate: '' }, osmProvider: 'OpenStreetMap', osmUrl: 'https://www.openstreetmap.org/copyright', osmDataDate: '',
  } } });
  let map: GeoMap;
  let mapReady = $state(false);
  let info = $state({ dataRoot: '', workspace: '', exports: '' });
  let projects = $state<string[]>([]);
  let selectedProject = $state('');
  let error = $state('');
  let message = $state('');
  let metrics = $state<{ areaM2: number; widthM: number; heightM: number; bbox: number[] }>();
  let width = $state(5000), height = $state(5000);
  let job = $state<Job>();
  let starting = $state(false);
  let jobInput = $state('');
  let exported = $state('');
  let preview = $state<'map' | 'game'>('map');
  let measureSequence = 0;
  let pollGeneration = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  const config = $derived(project.map.config);
  const stale = $derived(!!job && JSON.stringify(project) !== jobInput);
  async function refreshProjects() { projects = await api<string[]>('/api/projects'); }
  onMount(() => {
    void api<typeof info>('/api/info').then(value => { info = value; }).catch(fail);
    void refreshProjects().catch(fail);
    return () => clearInterval(timer);
  });
  function fail(e: unknown) { error = e instanceof Error ? e.message : String(e); }
  function explainError(detail: string) {
    if (detail.includes('WORLD_PACKAGE_SIZE_LIMIT')) return 'Das Paket überschreitet die bestehende Dateigröße (Welt/Visual je höchstens 8 MiB). Bitte ein kleineres oder weniger dichtes Gebiet wählen. ' + detail;
    if (detail.includes('WorldBounds exceeds')) return 'Gebiet und Padding überschreiten die Koordinatengrenze von ±10 km. Bitte Auswahl oder Padding verkleinern. ' + detail;
    return detail;
  }
  async function selection(aoi: Polygon | null) {
    project.map.aoi = aoi; metrics = undefined; error = '';
    const sequence = ++measureSequence;
    if (!aoi) return;
    try {
      const value = await api<NonNullable<typeof metrics>>('/api/measure', aoi);
      if (sequence === measureSequence) metrics = value;
    } catch (e) { if (sequence === measureSequence) fail(e); }
  }
  async function rectangle() {
    try { const aoi = await api<Polygon>('/api/rectangle', { ...map.center(), width, height }); map.setSelection(aoi); }
    catch (e) { fail(e); }
  }
  async function save() {
    try { await api(`/api/projects/${encodeURIComponent(project.id)}`, project, 'PUT'); await refreshProjects(); message = 'Projekt gespeichert.'; error = ''; }
    catch (e) { fail(e); }
  }
  async function load() {
    try { project = await api<Project>(`/api/projects/${encodeURIComponent(selectedProject)}`); map.setSelection(project.map.aoi); message = 'Projekt geladen.'; }
    catch (e) { fail(e); }
  }
  async function loadAoi(event: Event) {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    try { const json = JSON.parse(await file.text()); const aoi = json.type === 'Feature' ? json.geometry : json;
      if (aoi.type !== 'Polygon') throw new Error('GeoJSON muss ein Polygon enthalten.'); map.setSelection(aoi); }
    catch (e) { fail(e); }
  }
  function downloadAoi() {
    if (!project.map.aoi) return;
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([JSON.stringify(project.map.aoi)], { type: 'application/geo+json' }));
    link.download = `${project.id}-aoi.geojson`; link.click(); URL.revokeObjectURL(link.href);
  }
  async function poll() {
    if (!job) return;
    const generation = pollGeneration, id = job.id;
    try {
      const result = await api<Job>(`/api/jobs/${id}`);
      if (generation !== pollGeneration || job?.id !== id) return;
      job = result; if (!['running', 'queued'].includes(job.status)) clearInterval(timer);
    } catch (e) { if (generation === pollGeneration) { clearInterval(timer); fail(e); } }
  }
  async function start() {
    starting = true; ++pollGeneration; clearInterval(timer); job = undefined;
    try { error = ''; exported = ''; jobInput = JSON.stringify(project); job = await api<Job>('/api/jobs', JSON.parse(jobInput)); timer = setInterval(poll, 700); void poll(); }
    catch (e) { fail(e); }
    finally { starting = false; }
  }
  async function cancel() {
    if (!job) return;
    ++pollGeneration; clearInterval(timer);
    try { job = await api<Job>(`/api/jobs/${job.id}/cancel`, {}); }
    catch (e) { fail(e); timer = setInterval(poll, 700); }
  }
  async function exportWorld() {
    if (!job) return;
    try { const result = await api<{ path: string }>(`/api/jobs/${job.id}/export`, {}); exported = result.path; }
    catch (e) { fail(e); }
  }
</script>
<header><div><h1>World Studio</h1><p>Lokaler Kartengenerator · Project WOC</p></div><span>© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a></span></header>
{#if error}<p class="notice error" role="alert">{error}</p>{/if}
{#if message}<p class="notice" role="status">{message}</p>{/if}
<main>
  <section class="workspace">
    <h2>1. Gebiet auswählen</h2>
    <GeoMap bind:this={map} onselection={selection} onready={() => { mapReady = true; }}/>
    <div class="toolbar"><label>Breite (m) <input type="number" min="1" max="20000" bind:value={width}></label>
      <label>Höhe (m) <input type="number" min="1" max="20000" bind:value={height}></label><button disabled={!mapReady} onclick={rectangle}>Rechteck um Kartenmitte setzen</button>
      <button disabled={!project.map.aoi} onclick={downloadAoi}>Auswahl als GeoJSON speichern</button><label>GeoJSON laden <input disabled={!mapReady} type="file" accept=".json,.geojson,application/json" onchange={loadAoi}></label></div>
    {#if metrics}<p data-testid="metrics">Fläche {(metrics.areaM2 / 1000000).toFixed(3)} km² · Ausdehnung {metrics.widthM.toFixed(1)} × {metrics.heightM.toFixed(1)} m · BBox {metrics.bbox.map(n => n.toFixed(5)).join(', ')}</p>{:else}<p>Keine gültige Auswahl vermessen.</p>{/if}
    <h2>3. Import und Vorschau</h2>
    <button onclick={start} disabled={starting || !project.map.aoi || !metrics || job?.status === 'running' || job?.status === 'queued'}>Import starten</button>
    {#if job}
      <button onclick={cancel} disabled={!['queued', 'running'].includes(job.status)}>Abbrechen</button>
      <p role="status">Job: {job.status} · Phase: {job.phase}</p>
      {#if job.error}<p class="error" role="alert">Import fehlgeschlagen: {explainError(job.error)}</p>{/if}
      {#if job.report}<details><summary>Qualitätsbericht</summary><pre>{JSON.stringify(job.report, null, 2)}</pre></details>{/if}
      {#if job.status === 'done'}
        {#if stale}<p role="status">Das Projekt wurde nach dem Import geändert. Für den Export bitte erneut importieren.</p>{/if}
        <div class="toolbar"><button onclick={() => preview = 'map'}>Kartenvorschau</button><button onclick={() => preview = 'game'}>Spielvorschau</button><button disabled={stale} onclick={exportWorld}>Validiertes Paket exportieren</button></div>
        {#key job.id + preview}{#if preview === 'map'}<MapPreview jobId={job.id}/>{:else}<GamePreview jobId={job.id}/>{/if}{/key}
      {/if}
    {/if}
    {#if exported}<p>Export: <code>{exported}</code></p><p><a target="_blank" rel="noreferrer" href={`http://127.0.0.1:5173/?world=${encodeURIComponent(job?.worldId ?? '')}&worldBase=${encodeURIComponent(location.origin + '/worlds/')}`}>Im Spiel öffnen (WASM-Client auf Port 5173)</a></p>{/if}
  </section>
  <aside>
    <h2>2. Projekt und Import</h2>
    <label>Projekt-ID <input bind:value={project.id}></label>
    <div class="toolbar"><button onclick={save}>Projekt speichern</button><select aria-label="Gespeichertes Projekt" bind:value={selectedProject}><option value="">Projekt wählen</option>{#each projects as name}<option value={name}>{name}</option>{/each}</select><button disabled={!selectedProject || !mapReady} onclick={load}>Laden</button></div>
    <p>Projekte: <code>{info.workspace}</code></p>
    <label>World-ID <input bind:value={config.worldId}></label>
    <label>Name <input bind:value={config.name}></label>
    <label>Revision <input type="number" min="1" bind:value={config.revision}></label>
    <label>Seed <input bind:value={config.seed}></label>
    <label>Randmodus <select value={config.mode} onchange={e => { const next = e.currentTarget.value as 'natural' | 'island'; if (next === 'island' && config.paddingM === 0) config.paddingM = 500; else if (next === 'natural' && config.paddingM === 500) config.paddingM = 0; config.mode = next; }}><option value="natural">Natural</option><option value="island">Island</option></select></label>
    <label>Padding (m) <input type="number" min="0" max="10000" bind:value={config.paddingM}></label>
    <p>Quelldateien relativ zu <code>{info.dataRoot}</code></p>
    <label>OSM-PBF <input bind:value={project.map.pbf} placeholder="region.osm.pbf"></label>
    <label>Land-GeoJSON <input bind:value={project.map.land} placeholder="land.geojson"></label>
    <details><summary>Quellen und Lizenz</summary>
      <label>OSM-Anbieter <input bind:value={config.osmProvider}></label><label>OSM-URL <input bind:value={config.osmUrl}></label><label>OSM-Datum <input bind:value={config.osmDataDate}></label>
      <label>Land-Anbieter <input bind:value={config.landSource.provider}></label><label>Land-URL <input bind:value={config.landSource.url}></label><label>Lizenz <input bind:value={config.landSource.license}></label><label>Attribution <input bind:value={config.landSource.attribution}></label><label>Datendatum <input bind:value={config.landSource.dataDate}></label>
    </details>
    <p>Die Rohdaten bleiben lokal. Dichte Gebiete können die bestehenden 8-MiB-Grenzen je Welt- und Visualdatei überschreiten.</p>
  </aside>
</main>
