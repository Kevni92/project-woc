export interface TransportListener {
  message(wire: string): void;
  closed(reason?: Error): void;
}

export interface Transport {
  open(listener: TransportListener): Promise<void>;
  send(wire: string): void;
  close(): void;
}

export type TransportFactory = () => Transport;
