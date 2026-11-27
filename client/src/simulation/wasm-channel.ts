import type { WorldInit } from '../content/world-package';

export type WorkerRequest = { type: 'send'; wire: string } | { type: 'close' };
export type WorkerResponse = { type: 'ready' } | { type: 'message'; wire: string };
export type WorkerAttach = { type: 'attach'; port: MessagePort };
export type WorkerStart = { type: 'start'; clock: 'realtime' | 'manual'; world: WorldInit };
