import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { lanAddresses } from './lan.ts';

export interface CertPair {
  key: string;
  cert: string;
  kind: 'provided' | 'self-signed';
}

/**
 * HTTPS certificate for LAN use (phones only allow the camera on secure pages).
 *
 * 1. If `certs/cert.pem` + `certs/key.pem` exist (e.g. made with mkcert), use
 *    them: browsers trust them and the PWA service worker can register.
 * 2. Otherwise generate a self-signed certificate for localhost + this
 *    machine's LAN IPs (cached, regenerated when the IPs change). Browsers show
 *    a warning once; after "Proceed", camera access works.
 */
export async function loadOrCreateCert(dir = join(process.cwd(), 'certs')): Promise<CertPair> {
  const certPath = join(dir, 'cert.pem');
  const keyPath = join(dir, 'key.pem');
  if (existsSync(certPath) && existsSync(keyPath)) {
    return { key: readFileSync(keyPath, 'utf8'), cert: readFileSync(certPath, 'utf8'), kind: 'provided' };
  }

  const ips = lanAddresses();
  const metaPath = join(dir, 'self-signed.json');
  const sKey = join(dir, 'self-signed-key.pem');
  const sCert = join(dir, 'self-signed-cert.pem');
  if (existsSync(metaPath) && existsSync(sKey) && existsSync(sCert)) {
    try {
      const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as { ips: string[]; expires: number };
      if (meta.expires > Date.now() + 86_400_000 && ips.every((ip) => meta.ips.includes(ip))) {
        return { key: readFileSync(sKey, 'utf8'), cert: readFileSync(sCert, 'utf8'), kind: 'self-signed' };
      }
    } catch {
      /* regenerate */
    }
  }

  const { generate } = await import('selfsigned');
  const notAfter = new Date(Date.now() + 365 * 86_400_000);
  const pems = await generate([{ name: 'commonName', value: 'NULL-TECH local' }], {
    keySize: 2048,
    algorithm: 'sha256',
    notAfterDate: notAfter,
    extensions: [
      { name: 'basicConstraints', cA: false },
      { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
      { name: 'extKeyUsage', serverAuth: true },
      {
        name: 'subjectAltName',
        altNames: [
          { type: 2, value: 'localhost' },
          { type: 7, ip: '127.0.0.1' },
          ...ips.map((ip) => ({ type: 7 as const, ip })),
        ],
      },
    ],
  } as Parameters<typeof generate>[1]);
  mkdirSync(dir, { recursive: true });
  writeFileSync(sKey, pems.private);
  writeFileSync(sCert, pems.cert);
  writeFileSync(metaPath, JSON.stringify({ ips, expires: notAfter.getTime() }));
  return { key: pems.private, cert: pems.cert, kind: 'self-signed' };
}
