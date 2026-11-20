import { SIGNAL_PATH, parseServerMessage, type ClientMessage, type ServerMessage } from './protocol';

export type SocketState = 'connecting' | 'open' | 'closed';

export interface SignalingClientOptions {
  /** Defaults to the page's own origin. */
  url?: string;
  onMessage: (msg: ServerMessage) => void;
  /** Called on every (re)open — re-send host/join here. */
  onOpen: () => void;
  onState?: (state: SocketState) => void;
}

/**
 * WebSocket to the local signaling server with automatic reconnection
 * (exponential backoff, max 8 s) and a keepalive ping.
 */
export class SignalingClient {
  private ws: WebSocket | null = null;
  private retry = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;
  private readonly url: string;

  constructor(private readonly opts: SignalingClientOptions) {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.url = opts.url ?? `${proto}//${location.host}${SIGNAL_PATH}`;
  }

  start(): void {
    this.stopped = false;
    this.open();
  }

  send(msg: ClientMessage): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(msg));
    return true;
  }

  get isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  stop(): void {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.retryTimer = this.pingTimer = null;
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onclose = ws.onerror = ws.onmessage = ws.onopen = null;
      try {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'leave' }));
        ws.close(1000, 'stop');
      } catch {
        /* already closed */
      }
    }
    this.opts.onState?.('closed');
  }

  private open(): void {
    this.opts.onState?.('connecting');
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch {
      this.scheduleRetry();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.opts.onState?.('open');
      this.pingTimer = setInterval(() => this.send({ t: 'ping' }), 20_000);
      this.opts.onOpen();
    };
    ws.onmessage = (e) => {
      if (typeof e.data !== 'string') return;
      const msg = parseServerMessage(e.data);
      if (msg) this.opts.onMessage(msg);
    };
    ws.onclose = () => {
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = null;
      this.ws = null;
      if (!this.stopped) {
        this.opts.onState?.('connecting');
        this.scheduleRetry();
      }
    };
    ws.onerror = () => {
      /* onclose follows */
    };
  }

  private scheduleRetry(): void {
    if (this.stopped || this.retryTimer) return;
    const delay = Math.min(8000, 400 * 2 ** this.retry++);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (!this.stopped) this.open();
    }, delay);
  }
}
