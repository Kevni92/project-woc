import type { TransportFactory } from './transport';
import type { WorldInit } from '../content/world-package';
import { createWasmTransportFactory } from './wasm-transport';
import { WebSocketTransport } from './websocket-transport';

export function transportFactory(query: URLSearchParams, world: WorldInit): TransportFactory {
  if (query.get('transport') === 'ws') {
    const url = query.get('ws') ?? 'ws://127.0.0.1:8765';
    return () => new WebSocketTransport(url);
  }
  return createWasmTransportFactory(world);
}
