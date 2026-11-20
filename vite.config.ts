/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { readFileSync } from 'node:fs';
import { signalingPlugin } from './server/vitePlugin.ts';
import { loadOrCreateCert } from './server/certs.ts';
import { pwaPlugin } from './server/pwaPlugin.ts';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

// `vite --mode lan` serves HTTPS on the LAN so a phone can open the camera page.
export default defineConfig(async ({ mode, command }) => {
  const lan = mode === 'lan';
  const cert = lan && command === 'serve' ? await loadOrCreateCert() : null;
  const https = cert ? { key: cert.key, cert: cert.cert } : undefined;

  return {
    plugins: [react(), signalingPlugin(), ...(mode === 'test' ? [] : [pwaPlugin()])],
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 5173,
      strictPort: true,
      host: lan ? '0.0.0.0' : 'localhost',
      https,
    },
    preview: {
      port: 4173,
      strictPort: true,
      host: lan ? '0.0.0.0' : 'localhost',
      https,
    },
    // Hand tracking runs in a module worker (MediaPipe's module wasm build).
    worker: { format: 'es' as const },
    build: {
      target: 'es2022',
      sourcemap: true,
      chunkSizeWarningLimit: 900,
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./tests/setup.ts'],
      include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx', 'tests/integration/**/*.test.tsx'],
      css: false,
    },
  };
});
