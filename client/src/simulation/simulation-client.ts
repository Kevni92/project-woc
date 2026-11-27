import { decodeServer, PROTOCOL_VERSION } from './protocol';
import type { Command, CommandResult, Request, ServerMessage, View } from './protocol';
import type { Transport, TransportFactory } from './transport';
import { applyDelta, fromSnapshot } from './view-store';

export interface ClientState {
  readonly status: 'disconnected' | 'connecting' | 'connected';
  readonly sessionId: string | null;
  readonly view: View | null;
  readonly synchronizing: boolean;
  readonly error: string | null;
}

type ReplyType = 'Welcome' | 'CommandResult' | 'Snapshot';
type Reply = Extract<ServerMessage, { type: ReplyType }>;
type PendingReply = {
  expected: ReplyType;
  resolve(message: Reply): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
};

const OFFLINE: ClientState = {
  status: 'disconnected', sessionId: null, view: null, synchronizing: false, error: null,
};
const INITIAL_SNAPSHOT = '';
const TIMEOUT_MS = 5000;

export class SimulationClient {
  private transport: Transport | null = null;
  private state: ClientState = OFFLINE;
  private lastSequence = 0;
  private nextRequest = 1;
  private recovering = false;
  private readonly pending = new Map<string, PendingReply>();
  private readonly listeners = new Set<(state: ClientState) => void>();

  constructor(private readonly factory: TransportFactory) {}

  subscribe(listener: (state: ClientState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => { this.listeners.delete(listener); };
  }

  async connect(): Promise<void> {
    if (this.transport) throw new Error('ALREADY_CONNECTED');
    this.publish({ ...OFFLINE, status: 'connecting' });

    let transport: Transport | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      transport = this.factory();
      this.transport = transport;
      await Promise.race([
        transport.open({
          message: wire => {
            if (this.transport === transport) this.receive(wire);
          },
          closed: reason => {
            if (this.transport === transport) this.stop(reason ?? new Error('TRANSPORT_CLOSED'));
          },
        }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('CONNECT_TIMEOUT')), TIMEOUT_MS);
        }),
      ]);
      if (this.transport !== transport) throw new Error('TRANSPORT_CLOSED');

      const initial = this.waitFor(INITIAL_SNAPSHOT, 'Snapshot');
      await Promise.all([this.exchange({ type: 'Hello', payload: {} }, 'Welcome'), initial]);
      if (this.transport !== transport) throw new Error('TRANSPORT_CLOSED');
      this.publish({ ...this.state, status: 'connected' });
    } catch (error) {
      const reason = error instanceof Error ? error : new Error('CONNECT_FAILED');
      if (this.transport === transport || (!transport && !this.transport)) this.stop(reason);
      throw reason;
    } finally {
      clearTimeout(timer);
    }
  }

  async disconnect(): Promise<void> {
    this.stop();
  }

  async sendCommand(command: Command): Promise<CommandResult> {
    const reply = await this.exchange({ type: 'Command', payload: command }, 'CommandResult');
    return reply.payload;
  }

  acquireCharacter(characterId: string): Promise<CommandResult> {
    return this.sendCommand({ action: 'AcquireCharacter', characterId });
  }

  releaseCharacter(characterId: string): Promise<CommandResult> {
    return this.sendCommand({ action: 'ReleaseCharacter', characterId });
  }

  async requestSnapshot(): Promise<View> {
    const message = await this.exchange({ type: 'SnapshotRequest', payload: {} }, 'Snapshot');
    return fromSnapshot(message);
  }

  private waitFor(requestId: string, expected: ReplyType): Promise<Reply> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.reject(requestId, new Error('REQUEST_TIMEOUT')), TIMEOUT_MS);
      this.pending.set(requestId, { expected, resolve, reject, timer });
    });
  }

  private async exchange<T extends ReplyType>(
    request: Request, expected: T,
  ): Promise<Extract<Reply, { type: T }>> {
    if (!this.transport || (request.type !== 'Hello' && !this.state.sessionId)) {
      throw new Error('TRANSPORT_CLOSED');
    }

    const requestId = 'request-' + this.nextRequest++;
    const reply = this.waitFor(requestId, expected);
    try {
      this.transport.send(JSON.stringify({ ...request, protocolVersion: PROTOCOL_VERSION, requestId }));
    } catch (error) {
      this.reject(requestId, error instanceof Error ? error : new Error('TRANSPORT_SEND_FAILED'));
    }
    // complete() matches the reply type before resolving the pending request.
    return await reply as Extract<Reply, { type: T }>;
  }

  private takePending(requestId: string): PendingReply | undefined {
    const pending = this.pending.get(requestId);
    if (pending) {
      this.pending.delete(requestId);
      clearTimeout(pending.timer);
    }
    return pending;
  }

  private reject(requestId: string, error: Error): boolean {
    const pending = this.takePending(requestId);
    pending?.reject(error);
    return pending !== undefined;
  }

  private complete(requestId: string, message: Reply): void {
    if (this.pending.get(requestId)?.expected === message.type) {
      this.takePending(requestId)?.resolve(message);
    }
  }

  private receive(wire: string): void {
    let message: ServerMessage;
    try {
      message = decodeServer(wire);
    } catch {
      this.stop(new Error('INVALID_SERVER_MESSAGE'));
      return;
    }
    if (message.streamSeq <= this.lastSequence) return;
    const gap = message.streamSeq !== this.lastSequence + 1;
    this.lastSequence = message.streamSeq;
    const requestId = message.requestId ?? INITIAL_SNAPSHOT;

    switch (message.type) {
      case 'Welcome':
        if (this.pending.get(requestId)?.expected === 'Welcome') {
          this.publish({ ...this.state, sessionId: message.payload.sessionId });
          this.complete(requestId, message);
        }
        break;
      case 'Snapshot':
        if (this.state.sessionId) {
          this.publish({ ...this.state, view: fromSnapshot(message), synchronizing: false });
          this.complete(INITIAL_SNAPSHOT, message);
          this.complete(requestId, message);
        }
        return;
      case 'Delta': {
        const view = this.state.view;
        if (gap || !view || this.state.synchronizing
          || view.revision !== message.payload.baseRevision
          || view.revision >= message.payload.revision) {
          this.recover();
        } else {
          this.publish({ ...this.state, view: applyDelta(view, message) });
        }
        return;
      }
      case 'CommandResult':
        this.complete(requestId, message);
        break;
      case 'Error': {
        const error = message.payload.code;
        if (!message.requestId || !this.reject(requestId, new Error(error))) {
          this.publish({ ...this.state, error });
        }
        break;
      }
    }
    if (gap) this.recover();
  }

  private recover(): void {
    const transport = this.transport;
    if (!transport || !this.state.sessionId) return;
    if (!this.state.synchronizing) this.publish({ ...this.state, synchronizing: true });
    if (this.recovering) return;

    this.recovering = true;
    void this.requestSnapshot().then(() => {
      if (this.transport !== transport) return;
      this.recovering = false;
      if (this.state.synchronizing) this.recover();
    }, error => {
      if (this.transport === transport) this.stop(error);
    });
  }

  private stop(error?: Error): void {
    const transport = this.transport;
    this.transport = null;
    transport?.close();
    for (const id of this.pending.keys()) this.reject(id, error ?? new Error('TRANSPORT_CLOSED'));
    this.lastSequence = 0;
    this.nextRequest = 1;
    this.recovering = false;
    this.publish({ ...OFFLINE, error: error?.message ?? null });
  }

  private publish(state: ClientState): void {
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }
}
