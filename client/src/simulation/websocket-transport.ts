import type { Transport, TransportListener } from './transport';

export class WebSocketTransport implements Transport {
  private socket: WebSocket | null = null;
  private rejectOpen: ((reason: Error) => void) | null = null;

  constructor(private readonly url: string) {}

  open(listener: TransportListener): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(this.url);
      this.socket = socket;
      this.rejectOpen = reject;
      const closed = (error: Error) => {
        if (this.socket !== socket) return;
        this.closeWith(error);
        listener.closed(error);
      };
      socket.onopen = () => {
        this.rejectOpen = null;
        resolve();
      };
      socket.onmessage = event => {
        if (this.socket !== socket) return;
        if (typeof event.data === 'string') listener.message(event.data);
        else closed(new Error('INVALID_WEBSOCKET_FRAME'));
      };
      socket.onerror = () => closed(new Error('WEBSOCKET_ERROR'));
      socket.onclose = () => closed(new Error('WEBSOCKET_CLOSED'));
    });
  }

  send(wire: string): void {
    if (this.socket?.readyState !== WebSocket.OPEN) throw new Error('TRANSPORT_CLOSED');
    this.socket.send(wire);
  }

  close(): void {
    this.closeWith(new Error('TRANSPORT_CLOSED'));
  }

  private closeWith(error: Error): void {
    const socket = this.socket;
    const reject = this.rejectOpen;
    this.socket = null;
    this.rejectOpen = null;
    reject?.(error);
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close();
  }
}
