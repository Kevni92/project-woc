export async function api<T>(path: string, data?: unknown, method = 'POST'): Promise<T> {
  const response = await fetch(path, data === undefined ? undefined : {
    method, headers: { 'Content-Type': 'application/json', 'X-WOC-Studio': '1' }, body: JSON.stringify(data),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail ?? `HTTP ${response.status}`);
  }
  return response.json();
}
export type Polygon = { type: 'Polygon'; coordinates: number[][][] };
export type Project = {
  version: 1; id: string;
  map: { aoi: Polygon | null; pbf: string; land: string; config: {
    worldId: string; name: string; revision: number; seed: string; mode: 'natural' | 'island'; paddingM: number;
    landSource: { provider: string; url: string; license: string; attribution: string; dataDate: string };
    osmProvider: string; osmUrl: string; osmDataDate: string;
  } };
};
export type Job = { id: string; status: 'queued' | 'running' | 'cancelled' | 'failed' | 'done';
  phase: string; error?: string; report?: Record<string, unknown>; worldId: string };
