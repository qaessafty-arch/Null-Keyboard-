import { randomBytes, randomInt } from 'node:crypto';
import {
  ROOM_ALPHABET,
  ROOM_CODE_LENGTH,
  parseClientMessage,
  type ClientMessage,
  type ServerMessage,
} from '../../src/communication/signaling/protocol.ts';

/**
 * Transport-agnostic signaling hub: one host (Surface) + one phone per room.
 * Relays SDP/ICE only. Validates every message, rate-limits join attempts
 * (room codes are short), lets either side resume after a dropped socket, and
 * expires idle rooms.
 */

export interface Peer {
  send(msg: ServerMessage): void;
  close(code?: number, reason?: string): void;
}

interface Room {
  code: string;
  hostToken: string;
  phoneToken: string | null;
  host: Peer | null;
  phone: Peer | null;
  createdAt: number;
  lastActive: number;
  hostGoneAt: number | null;
}

interface PeerState {
  /** Who is behind the socket (client IP when known). Limits apply per client, not per socket. */
  client: string;
  role: 'host' | 'phone' | null;
  code: string | null;
  joinAttempts: number[];
  msgWindowStart: number;
  msgCount: number;
}

export interface HubOptions {
  now?: () => number;
  /** Rooms with no phone are dropped after this long. */
  roomTtlMs?: number;
  /** A host that disconnects can resume its room within this window. */
  hostGraceMs?: number;
  maxJoinAttemptsPerMinute?: number;
  /** Join attempts per client (all its sockets together) per minute. */
  maxJoinAttemptsPerClientPerMinute?: number;
  /** Rooms (pairing sessions) per client at once. */
  maxRoomsPerClient?: number;
  /** Rooms in total, to bound memory on a public server. */
  maxRooms?: number;
  maxMessagesPer10s?: number;
  /** LAN URLs the phone can use to reach this server (for the QR code). */
  getUrls?: () => string[];
  randomCode?: () => string;
  randomToken?: () => string;
  log?: (msg: string) => void;
}

const defaultCode = () => {
  let s = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) s += ROOM_ALPHABET[randomInt(ROOM_ALPHABET.length)];
  return s;
};
const defaultToken = () => randomBytes(16).toString('hex');

export class SignalingHub {
  private rooms = new Map<string, Room>();
  private peers = new Map<Peer, PeerState>();
  private clientJoins = new Map<string, number[]>();
  private readonly now: () => number;
  private readonly opts: Required<Omit<HubOptions, 'now'>>;

  constructor(options: HubOptions = {}) {
    this.now = options.now ?? Date.now;
    this.opts = {
      roomTtlMs: options.roomTtlMs ?? 15 * 60_000,
      hostGraceMs: options.hostGraceMs ?? 60_000,
      maxJoinAttemptsPerMinute: options.maxJoinAttemptsPerMinute ?? 8,
      maxJoinAttemptsPerClientPerMinute: options.maxJoinAttemptsPerClientPerMinute ?? 20,
      maxRoomsPerClient: options.maxRoomsPerClient ?? 4,
      maxRooms: options.maxRooms ?? 5000,
      maxMessagesPer10s: options.maxMessagesPer10s ?? 400,
      getUrls: options.getUrls ?? (() => []),
      randomCode: options.randomCode ?? defaultCode,
      randomToken: options.randomToken ?? defaultToken,
      log: options.log ?? (() => {}),
    };
  }

  get roomCount(): number {
    return this.rooms.size;
  }

  /** @param client identifies the remote client (IP); sockets without one share a per-socket key. */
  connect(peer: Peer, client?: string): void {
    this.peers.set(peer, {
      client: client ?? `socket:${this.peers.size}:${this.now()}:${Math.random()}`,
      role: null,
      code: null,
      joinAttempts: [],
      msgWindowStart: this.now(),
      msgCount: 0,
    });
  }

  disconnect(peer: Peer): void {
    const st = this.peers.get(peer);
    this.peers.delete(peer);
    if (!st?.code) return;
    const room = this.rooms.get(st.code);
    if (!room) return;
    if (st.role === 'host' && room.host === peer) {
      room.host = null;
      room.hostGoneAt = this.now();
      room.phone?.send({ t: 'peer-left', reason: 'disconnected' });
    } else if (st.role === 'phone' && room.phone === peer) {
      room.phone = null;
      room.host?.send({ t: 'peer-left', reason: 'disconnected' });
    }
  }

  /** Handle one raw text message from a peer. */
  handle(peer: Peer, raw: string): void {
    const st = this.peers.get(peer);
    if (!st) return;

    const now = this.now();
    if (now - st.msgWindowStart > 10_000) {
      st.msgWindowStart = now;
      st.msgCount = 0;
    }
    if (++st.msgCount > this.opts.maxMessagesPer10s) {
      peer.send({ t: 'error', code: 'rate-limited', message: 'Too many messages' });
      peer.close(1008, 'rate limited');
      return;
    }

    const msg = parseClientMessage(raw);
    if (!msg) {
      peer.send({ t: 'error', code: 'invalid', message: 'Invalid message' });
      return;
    }
    this.dispatch(peer, st, msg);
  }

  /** Drop expired rooms. Call periodically. */
  sweep(): void {
    const now = this.now();
    for (const [client, times] of this.clientJoins) {
      if (times.every((t) => now - t >= 60_000)) this.clientJoins.delete(client);
    }
    for (const room of [...this.rooms.values()]) {
      const hostGone = room.host === null && room.hostGoneAt !== null && now - room.hostGoneAt > this.opts.hostGraceMs;
      const idle = room.phone === null && now - room.lastActive > this.opts.roomTtlMs;
      if (hostGone || idle) {
        room.host?.send({ t: 'error', code: 'expired', message: 'Pairing code expired' });
        room.phone?.send({ t: 'peer-left', reason: 'left' });
        this.deleteRoom(room);
      }
    }
  }

  // ── internals ──────────────────────────────────────────────────────────

  private dispatch(peer: Peer, st: PeerState, msg: ClientMessage): void {
    switch (msg.t) {
      case 'ping':
        peer.send({ t: 'pong' });
        return;
      case 'host':
        if (msg.code && msg.token) this.resumeHost(peer, st, msg.code, msg.token);
        else this.createRoom(peer, st);
        return;
      case 'join':
        this.join(peer, st, msg.code, msg.token);
        return;
      case 'signal': {
        const room = st.code ? this.rooms.get(st.code) : undefined;
        if (!room || !st.role) {
          peer.send({ t: 'error', code: 'not-in-room', message: 'Not paired' });
          return;
        }
        room.lastActive = this.now();
        const other = st.role === 'host' ? room.phone : room.host;
        other?.send({ t: 'signal', payload: msg.payload });
        return;
      }
      case 'status': {
        // Only the phone reports camera status, and only to its host.
        const room = st.code ? this.rooms.get(st.code) : undefined;
        if (room && st.role === 'phone') room.host?.send({ t: 'status', status: msg.status });
        return;
      }
      case 'leave':
        this.leave(peer, st);
        return;
    }
  }

  private createRoom(peer: Peer, st: PeerState): void {
    this.leave(peer, st);
    let owned = 0;
    for (const r of this.rooms.values()) if (r.host && this.peers.get(r.host)?.client === st.client) owned++;
    if (owned >= this.opts.maxRoomsPerClient || this.rooms.size >= this.opts.maxRooms) {
      peer.send({ t: 'error', code: 'rate-limited', message: 'Too many pairing sessions — try again in a few minutes' });
      return;
    }
    let code = this.opts.randomCode();
    for (let i = 0; this.rooms.has(code) && i < 20; i++) code = this.opts.randomCode();
    if (this.rooms.has(code)) {
      peer.send({ t: 'error', code: 'rate-limited', message: 'Server busy — try again' });
      return;
    }
    const now = this.now();
    const room: Room = {
      code,
      hostToken: this.opts.randomToken(),
      phoneToken: null,
      host: peer,
      phone: null,
      createdAt: now,
      lastActive: now,
      hostGoneAt: null,
    };
    this.rooms.set(code, room);
    st.role = 'host';
    st.code = code;
    peer.send({
      t: 'room',
      code,
      token: room.hostToken,
      urls: this.opts.getUrls(),
      expiresAt: now + this.opts.roomTtlMs,
      resumed: false,
    });
    this.opts.log(`room ${code} created`);
  }

  private resumeHost(peer: Peer, st: PeerState, code: string, token: string): void {
    const room = this.rooms.get(code);
    if (!room || room.hostToken !== token) {
      peer.send({ t: 'error', code: 'expired', message: 'Room no longer exists' });
      return;
    }
    if (room.host && room.host !== peer) room.host.close(4000, 'replaced');
    room.host = peer;
    room.hostGoneAt = null;
    room.lastActive = this.now();
    st.role = 'host';
    st.code = code;
    peer.send({
      t: 'room',
      code,
      token,
      urls: this.opts.getUrls(),
      expiresAt: this.now() + this.opts.roomTtlMs,
      resumed: true,
    });
    if (room.phone) {
      // Both sides learn the other is present; the phone then re-offers.
      peer.send({ t: 'peer-joined' });
      room.phone.send({ t: 'peer-joined' });
    }
  }

  private join(peer: Peer, st: PeerState, code: string, token?: string): void {
    const now = this.now();
    st.joinAttempts = st.joinAttempts.filter((t) => now - t < 60_000);
    const clientJoins = (this.clientJoins.get(st.client) ?? []).filter((t) => now - t < 60_000);
    if (
      st.joinAttempts.length >= this.opts.maxJoinAttemptsPerMinute ||
      clientJoins.length >= this.opts.maxJoinAttemptsPerClientPerMinute
    ) {
      peer.send({ t: 'error', code: 'rate-limited', message: 'Too many attempts — wait a minute' });
      return;
    }
    st.joinAttempts.push(now);
    clientJoins.push(now);
    this.clientJoins.set(st.client, clientJoins);

    const room = this.rooms.get(code);
    if (!room) {
      peer.send({ t: 'error', code: 'bad-code', message: 'No Surface is waiting with that code' });
      return;
    }
    const resuming = token !== undefined && room.phoneToken === token;
    if (room.phone && room.phone !== peer && !resuming) {
      peer.send({ t: 'error', code: 'room-full', message: 'Another phone is already connected' });
      return;
    }
    if (room.phone && room.phone !== peer && resuming) room.phone.close(4000, 'replaced');

    if (st.code && st.code !== code) this.leave(peer, st);
    room.phone = peer;
    if (!resuming) room.phoneToken = this.opts.randomToken();
    room.lastActive = now;
    st.role = 'phone';
    st.code = code;
    peer.send({ t: 'joined', code, token: room.phoneToken!, resumed: resuming });
    room.host?.send({ t: 'peer-joined' });
    this.opts.log(`room ${code}: phone ${resuming ? 'resumed' : 'joined'}`);
  }

  private leave(peer: Peer, st: PeerState): void {
    if (!st.code) return;
    const room = this.rooms.get(st.code);
    const role = st.role;
    st.code = null;
    st.role = null;
    if (!room) return;
    if (role === 'host' && room.host === peer) {
      room.phone?.send({ t: 'peer-left', reason: 'left' });
      this.deleteRoom(room);
    } else if (role === 'phone' && room.phone === peer) {
      room.phone = null;
      room.phoneToken = null;
      room.host?.send({ t: 'peer-left', reason: 'left' });
    }
  }

  private deleteRoom(room: Room): void {
    this.rooms.delete(room.code);
    for (const s of this.peers.values()) {
      if (s.code === room.code) {
        s.code = null;
        s.role = null;
      }
    }
    this.opts.log(`room ${room.code} closed`);
  }
}
