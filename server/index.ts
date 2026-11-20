/**
 * NULL-TECH production server: serves the built app (dist/) and the signaling
 * endpoint over HTTPS on your LAN so a phone can open the camera page.
 *
 *   npm start                 build + serve on https://<this-pc>:8443
 *   PORT=9000 npm run serve   serve an existing build on another port
 *   NEO_HTTP=1 npm run serve  plain HTTP (localhost use only; phones will block the camera)
 */
import { createServer as createHttps } from 'node:https';
import { createServer as createHttp, type IncomingMessage, type ServerResponse } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { attachSignaling } from './signaling/attach.ts';
import { loadOrCreateCert } from './certs.ts';
import { lanUrls } from './lan.ts';

const ROOT = resolve(process.cwd(), 'dist');
const PORT = Number(process.env.PORT ?? 8443);
const HOST = process.env.HOST ?? '0.0.0.0';
const USE_HTTP = process.env.NEO_HTTP === '1';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.task': 'application/octet-stream',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()',
  'Content-Security-Policy': [
    "default-src 'self'",
    // inline: pre-paint theme script; wasm-unsafe-eval: MediaPipe
    "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    // the model falls back to Google's public model bucket if it isn't bundled
    "connect-src 'self' wss: ws: https://storage.googleapis.com",
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
  ].join('; '),
};

function send(res: ServerResponse, status: number, body: string) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', ...SECURITY_HEADERS });
  res.end(body);
}

function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
  } catch {
    return send(res, 400, 'Bad request');
  }
  if (pathname.endsWith('/')) pathname += 'index.html';
  const file = normalize(join(ROOT, pathname));
  if (file !== ROOT && !file.startsWith(ROOT + sep)) return send(res, 403, 'Forbidden');
  if (!existsSync(file) || !statSync(file).isFile()) return send(res, 404, 'Not found');

  const ext = extname(file);
  const immutable = pathname.startsWith('/assets/');
  const noCache = ext === '.html' || pathname === '/sw.js' || pathname.endsWith('.webmanifest');
  res.writeHead(200, {
    'Content-Type': MIME[ext] ?? 'application/octet-stream',
    'Content-Length': statSync(file).size,
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : noCache ? 'no-cache' : 'public, max-age=3600',
    ...SECURITY_HEADERS,
  });
  if (req.method === 'HEAD') return res.end();
  createReadStream(file).pipe(res);
}

async function main() {
  if (!existsSync(join(ROOT, 'index.html'))) {
    console.error('dist/ not found — run `npm run build` first (or use `npm start`).');
    process.exit(1);
  }
  let server;
  let certKind = 'none';
  if (USE_HTTP) {
    server = createHttp(handler);
  } else {
    const cert = await loadOrCreateCert();
    certKind = cert.kind;
    server = createHttps({ key: cert.key, cert: cert.cert }, handler);
  }
  attachSignaling(server, {
    getUrls: () => lanUrls(server, !USE_HTTP),
    log: (m) => console.log(`[signal] ${m}`),
  });
  server.listen(PORT, HOST, () => {
    const proto = USE_HTTP ? 'http' : 'https';
    console.log(`\n  NULL-TECH is running\n`);
    console.log(`  On this PC:   ${proto}://localhost:${PORT}`);
    for (const url of lanUrls(server, !USE_HTTP)) console.log(`  On the phone: ${url}`);
    if (certKind === 'self-signed') {
      console.log('\n  Using a self-signed certificate. Browsers will warn once:');
      console.log('  choose "Advanced" → "Proceed". For a trusted cert see README → HTTPS with mkcert.');
    }
    console.log('\n  Press Ctrl+C to stop.\n');
  });
}

void main();
