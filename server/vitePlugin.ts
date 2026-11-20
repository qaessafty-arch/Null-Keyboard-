import type { Plugin } from 'vite';
import { attachSignaling } from './signaling/attach.ts';
import { lanUrls } from './lan.ts';

/** Adds the `/signal` WebSocket endpoint to the Vite dev and preview servers. */
export function signalingPlugin(): Plugin {
  return {
    name: 'neo-type-signaling',
    configureServer(server) {
      const http = server.httpServer;
      if (!http) return;
      const https = !!server.config.server.https;
      const s = attachSignaling(http as never, {
        getUrls: () => lanUrls(http as never, https),
        log: (m) => server.config.logger.info(`[signal] ${m}`, { timestamp: true }),
      });
      http.on('close', () => s.close());
    },
    configurePreviewServer(server) {
      const http = server.httpServer;
      const https = !!server.config.preview.https;
      const s = attachSignaling(http as never, {
        getUrls: () => lanUrls(http as never, https),
        log: (m) => server.config.logger.info(`[signal] ${m}`, { timestamp: true }),
      });
      http.on('close', () => s.close());
    },
  };
}
