import type { Server as HttpServer, IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import { MAX_MESSAGE_BYTES, SIGNAL_PATH, type ServerMessage } from '../../src/communication/signaling/protocol.ts';
import { SignalingHub, type Peer } from './hub.ts';

export interface AttachOptions {
  getUrls: () => string[];
  log?: (msg: string) => void;
  /**
   * Behind a reverse proxy (Render, Fly, nginx) the socket address is the
   * proxy's; trust the first X-Forwarded-For entry instead. Only enable when
   * a proxy you control always sets that header.
   */
  trustProxy?: boolean;
  /** Concurrent signaling sockets per client. */
  maxSocketsPerClient?: number;
}

function clientOf(req: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const fwd = req.headers['x-forwarded-for'];
    const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.socket.remoteAddress ?? 'unknown';
}

/**
 * Attach the signaling WebSocket endpoint (`/signal`) to an existing HTTP(S)
 * server. Other upgrade requests (e.g. Vite HMR) are left untouched.
 */
export function attachSignaling(
  server: HttpServer,
  { getUrls, log = () => {}, trustProxy = false, maxSocketsPerClient = 12 }: AttachOptions,
) {
  const hub = new SignalingHub({ getUrls, log });
  const socketsPerClient = new Map<string, number>();
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });

  const onUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    let pathname = '/';
    try {
      pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
    } catch {
      /* malformed URL */
    }
    if (pathname !== SIGNAL_PATH) return;

    // Only pages served by this server may open the signaling socket.
    const origin = req.headers.origin;
    const host = req.headers.host;
    let sameOrigin = false;
    try {
      sameOrigin = !!origin && !!host && new URL(origin).host === host;
    } catch {
      sameOrigin = false;
    }
    if (!sameOrigin) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    if ((socketsPerClient.get(clientOf(req, trustProxy)) ?? 0) >= maxSocketsPerClient) {
      socket.write('HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  };
  server.on('upgrade', onUpgrade);

  wss.on('connection', (ws: WebSocket & { isAlive?: boolean }, req: IncomingMessage) => {
    ws.isAlive = true;
    const client = clientOf(req, trustProxy);
    socketsPerClient.set(client, (socketsPerClient.get(client) ?? 0) + 1);
    const peer: Peer = {
      send: (msg: ServerMessage) => {
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
      },
      close: (code, reason) => ws.close(code, reason),
    };
    hub.connect(peer, client);
    ws.on('pong', () => (ws.isAlive = true));
    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        peer.send({ t: 'error', code: 'invalid', message: 'Binary messages are not accepted' });
        return;
      }
      hub.handle(peer, data.toString());
    });
    ws.on('close', () => {
      hub.disconnect(peer);
      const n = (socketsPerClient.get(client) ?? 1) - 1;
      if (n <= 0) socketsPerClient.delete(client);
      else socketsPerClient.set(client, n);
    });
    ws.on('error', () => ws.terminate());
  });

  // Heartbeat: drop sockets that stop answering (phone locked, Wi-Fi lost).
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients as Set<WebSocket & { isAlive?: boolean }>) {
      if (ws.isAlive === false) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, 15_000);
  const sweep = setInterval(() => hub.sweep(), 5_000);
  heartbeat.unref();
  sweep.unref();

  return {
    hub,
    close() {
      clearInterval(heartbeat);
      clearInterval(sweep);
      server.off('upgrade', onUpgrade);
      for (const ws of wss.clients) ws.terminate();
      wss.close();
    },
  };
}
