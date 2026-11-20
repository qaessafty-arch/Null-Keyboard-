/**
 * NULL-TECH on Cloudflare Workers (free plan, no card needed).
 *
 *  • Static app: served by Workers Static Assets from dist/ (security headers
 *    come from public/_headers).
 *  • Pairing hub: `/signal` WebSockets are routed to one Durable Object, which
 *    runs the very same transport-agnostic SignalingHub as the Node server, so
 *    pairing, resume, expiry and every limit behave identically.
 *
 * Video never passes through Cloudflare: WebRTC has no STUN/TURN servers, so
 * the phone streams straight to the Surface on the local Wi-Fi.
 */
import { DurableObject } from 'cloudflare:workers';
import { SignalingHub, type Peer } from '../server/signaling/hub.ts';
import { MAX_MESSAGE_BYTES, SIGNAL_PATH, type ServerMessage } from '../src/communication/signaling/protocol.ts';

export interface Env {
  ASSETS: Fetcher;
  HUB: DurableObjectNamespace<SignalHub>;
}

const MAX_SOCKETS_PER_CLIENT = 12;
/** A phone can never reach a loopback address, so never put one in the QR code. */
const LOOPBACK = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|$)/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== SIGNAL_PATH) return env.ASSETS.fetch(request);

    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected a WebSocket upgrade', { status: 426 });
    }
    // Only pages served by this deployment may open the signaling socket.
    let sameOrigin = false;
    try {
      sameOrigin = new URL(request.headers.get('Origin') ?? '').host === url.host;
    } catch {
      sameOrigin = false;
    }
    if (!sameOrigin) return new Response('Forbidden', { status: 403 });

    // One hub for the whole deployment: rooms must be visible to both devices.
    const stub = env.HUB.get(env.HUB.idFromName('global'));
    return stub.fetch(request);
  },
} satisfies ExportedHandler<Env>;

/** Browsers and Workers only allow 1000 or 3000–4999 as a server close code. */
const closeCode = (code?: number) => (code === undefined ? 1000 : code === 1000 || (code >= 3000 && code <= 4999) ? code : 4000 + (code % 1000));

export class SignalHub extends DurableObject<Env> {
  private readonly hub: SignalingHub;
  private origin = '';
  private readonly sockets = new Map<string, number>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.hub = new SignalingHub({ getUrls: () => (this.origin && !LOOPBACK.test(this.origin) ? [this.origin] : []) });
    // Expire idle rooms while the hub is awake (it sleeps when nobody is connected).
    setInterval(() => this.hub.sweep(), 5_000);
  }

  override async fetch(request: Request): Promise<Response> {
    const client = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    const open = this.sockets.get(client) ?? 0;
    if (open >= MAX_SOCKETS_PER_CLIENT) return new Response('Too many connections', { status: 429 });
    this.origin = new URL(request.url).origin;

    const pair = new WebSocketPair();
    const [browserSide, ws] = [pair[0], pair[1]];
    ws.accept();
    this.sockets.set(client, open + 1);

    const peer: Peer = {
      send: (msg: ServerMessage) => {
        try {
          ws.send(JSON.stringify(msg));
        } catch {
          /* socket already closing */
        }
      },
      close: (code, reason) => {
        try {
          ws.close(closeCode(code), reason);
        } catch {
          /* already closed */
        }
      },
    };
    this.hub.connect(peer, client);

    ws.addEventListener('message', (ev) => {
      if (typeof ev.data !== 'string') {
        peer.send({ t: 'error', code: 'invalid', message: 'Binary messages are not accepted' });
        return;
      }
      if (ev.data.length > MAX_MESSAGE_BYTES) {
        peer.close(4009, 'message too large');
        return;
      }
      this.hub.handle(peer, ev.data);
    });

    let gone = false;
    const done = () => {
      if (gone) return;
      gone = true;
      this.hub.disconnect(peer);
      const n = (this.sockets.get(client) ?? 1) - 1;
      if (n <= 0) this.sockets.delete(client);
      else this.sockets.set(client, n);
    };
    ws.addEventListener('close', done);
    ws.addEventListener('error', done);

    return new Response(null, { status: 101, webSocket: browserSide });
  }
}
