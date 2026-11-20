import { networkInterfaces } from 'node:os';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

const isPrivate = (ip: string) =>
  /^10\./.test(ip) || /^192\.168\./.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip);

/** Non-internal IPv4 addresses, private LAN ranges first. */
export function lanAddresses(): string[] {
  const out: string[] = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family === 'IPv4' && !a.internal) out.push(a.address);
    }
  }
  return out.sort((a, b) => Number(isPrivate(b)) - Number(isPrivate(a)));
}

/** URLs a phone on the same network can open to reach `server`. */
export function lanUrls(server: Server | null | undefined, https: boolean): string[] {
  const addr = server?.address() as AddressInfo | string | null | undefined;
  if (!addr || typeof addr === 'string') return [];
  // Bound to localhost only: not reachable from the phone.
  if (addr.address === '127.0.0.1' || addr.address === '::1') return [];
  const proto = https ? 'https' : 'http';
  return lanAddresses().map((ip) => `${proto}://${ip}:${addr.port}`);
}
