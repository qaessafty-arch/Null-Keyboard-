import type { Server as HttpServer, IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import { MAX_MESSAGE_BYTES, SIGNAL_PATH, type ServerMessage } from '../../src/communication/signaling/protocol.ts';
import { SignalingHub, type Peer } from './hub.ts';

export interface AttachOptions {
  getUrls: () => string[];
  log?: (msg: string) => void;
}

/**
 * Attach the signaling WebSocket endpoint (`/signal`) to an existing HTTP(S)
 * server. Other upgrade requests (e.g. Vite HMR) are left untouched.
 */
export function attachSignaling(server: HttpServer, { getUrls, log = () => {} }: AttachOptions) {
  const hub = new SignalingHub({ getUrls, log });
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
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  };
  server.on('upgrade', onUpgrade);

  wss.on('connection', (ws: WebSocket & { isAlive?: boolean }) => {
    ws.isAlive = true;
    const peer: Peer = {
      send: (msg: ServerMessage) => {
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
      },
      close: (code, reason) => ws.close(code, reason),
    };
    hub.connect(peer);
    ws.on('pong', () => (ws.isAlive = true));
    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        peer.send({ t: 'error', code: 'invalid', message: 'Binary messages are not accepted' });
        return;
      }
      hub.handle(peer, data.toString());
    });
    ws.on('close', () => hub.disconnect(peer));
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
