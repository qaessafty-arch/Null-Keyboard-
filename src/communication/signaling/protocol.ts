/**
 * Signaling protocol shared by the browser and the Node signaling server.
 * Dependency-free so the server can import it directly.
 *
 * The server only relays connection setup (SDP + ICE candidates) between one
 * host (the Surface) and one phone per room. Video never touches the server.
 */

export const SIGNAL_PATH = '/signal';
export const MAX_MESSAGE_BYTES = 16 * 1024;
export const MAX_SDP_CHARS = 12_000;
export const MAX_CANDIDATE_CHARS = 1_000;

/** Unambiguous alphabet (no 0/O, 1/I/L). 6 chars ≈ 30 bits. */
export const ROOM_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;
export const ROOM_CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;
export const TOKEN_RE = /^[0-9a-f]{32}$/;

export type SignalPayload =
  | { kind: 'offer'; sdp: string }
  | { kind: 'answer'; sdp: string }
  | { kind: 'candidate'; candidate: { candidate: string; sdpMid: string | null; sdpMLineIndex: number | null } }
  | { kind: 'end-of-candidates' };

export type ClientMessage =
  | { t: 'host'; code?: string; token?: string }
  | { t: 'join'; code: string; token?: string }
  | { t: 'signal'; payload: SignalPayload }
  | { t: 'status'; status: PhoneStatus }
  | { t: 'leave' }
  | { t: 'ping' };

/** Phone-side camera state, relayed to the host so it can show the truth. */
export interface PhoneStatus {
  camera: 'starting' | 'permission-required' | 'unavailable' | 'streaming' | 'stopped';
  detail?: string;
  label?: string;
  width?: number;
  height?: number;
  frameRate?: number;
}

const CAMERA_STATES = ['starting', 'permission-required', 'unavailable', 'streaming', 'stopped'] as const;

export function parsePhoneStatus(v: unknown): PhoneStatus | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (!CAMERA_STATES.includes(o.camera as PhoneStatus['camera'])) return null;
  const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 && x < 10_000 ? x : undefined);
  const str = (x: unknown) => (typeof x === 'string' ? x.slice(0, 120) : undefined);
  const out: PhoneStatus = { camera: o.camera as PhoneStatus['camera'] };
  const detail = str(o.detail);
  const label = str(o.label);
  const width = num(o.width);
  const height = num(o.height);
  const frameRate = num(o.frameRate);
  if (detail !== undefined) out.detail = detail;
  if (label !== undefined) out.label = label;
  if (width !== undefined) out.width = width;
  if (height !== undefined) out.height = height;
  if (frameRate !== undefined) out.frameRate = frameRate;
  return out;
}

export type ErrorCode = 'invalid' | 'bad-code' | 'room-full' | 'rate-limited' | 'not-in-room' | 'expired';

export type ServerMessage =
  | { t: 'room'; code: string; token: string; urls: string[]; expiresAt: number; resumed: boolean }
  | { t: 'joined'; code: string; token: string; resumed: boolean }
  | { t: 'peer-joined' }
  | { t: 'peer-left'; reason: 'left' | 'disconnected' }
  | { t: 'signal'; payload: SignalPayload }
  | { t: 'status'; status: PhoneStatus }
  | { t: 'error'; code: ErrorCode; message: string }
  | { t: 'pong' };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;

export function normalizeRoomCode(input: string): string {
  // Codes never contain 0/O/1/I/L, so stray separators and case are all we fix.
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, ROOM_CODE_LENGTH);
}

export function isRoomCode(code: unknown): code is string {
  return typeof code === 'string' && ROOM_CODE_RE.test(code);
}

function parsePayload(p: unknown): SignalPayload | null {
  if (!isObj(p)) return null;
  switch (p.kind) {
    case 'offer':
    case 'answer':
      return isStr(p.sdp, MAX_SDP_CHARS) && p.sdp.startsWith('v=0') ? { kind: p.kind, sdp: p.sdp } : null;
    case 'candidate': {
      const c = p.candidate;
      if (!isObj(c) || !isStr(c.candidate, MAX_CANDIDATE_CHARS)) return null;
      const sdpMid = c.sdpMid === null || c.sdpMid === undefined ? null : isStr(c.sdpMid, 64) ? c.sdpMid : undefined;
      const idx = c.sdpMLineIndex;
      const sdpMLineIndex =
        idx === null || idx === undefined ? null : Number.isInteger(idx) && (idx as number) >= 0 && (idx as number) < 16 ? (idx as number) : undefined;
      if (sdpMid === undefined || sdpMLineIndex === undefined) return null;
      return { kind: 'candidate', candidate: { candidate: c.candidate, sdpMid, sdpMLineIndex } };
    }
    case 'end-of-candidates':
      return { kind: 'end-of-candidates' };
    default:
      return null;
  }
}

/** Strict parser for messages arriving at the server. Returns null for anything invalid. */
export function parseClientMessage(raw: string): ClientMessage | null {
  if (raw.length > MAX_MESSAGE_BYTES) return null;
  let msg: unknown;
  try {
    msg = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObj(msg)) return null;
  switch (msg.t) {
    case 'host': {
      if (msg.code === undefined && msg.token === undefined) return { t: 'host' };
      if (isRoomCode(msg.code) && typeof msg.token === 'string' && TOKEN_RE.test(msg.token)) {
        return { t: 'host', code: msg.code, token: msg.token };
      }
      return null;
    }
    case 'join': {
      if (!isRoomCode(msg.code)) return null;
      if (msg.token !== undefined && !(typeof msg.token === 'string' && TOKEN_RE.test(msg.token))) return null;
      return msg.token ? { t: 'join', code: msg.code, token: msg.token } : { t: 'join', code: msg.code };
    }
    case 'signal': {
      const payload = parsePayload(msg.payload);
      return payload ? { t: 'signal', payload } : null;
    }
    case 'status': {
      const status = parsePhoneStatus(msg.status);
      return status ? { t: 'status', status } : null;
    }
    case 'leave':
      return { t: 'leave' };
    case 'ping':
      return { t: 'ping' };
    default:
      return null;
  }
}

/** Lenient-but-safe parser for messages arriving at the browser. */
export function parseServerMessage(raw: string): ServerMessage | null {
  if (raw.length > MAX_MESSAGE_BYTES * 2) return null;
  let msg: unknown;
  try {
    msg = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObj(msg) || typeof msg.t !== 'string') return null;
  switch (msg.t) {
    case 'room':
      return isRoomCode(msg.code) && typeof msg.token === 'string' && Array.isArray(msg.urls)
        ? {
            t: 'room',
            code: msg.code,
            token: msg.token,
            urls: msg.urls.filter((u): u is string => typeof u === 'string').slice(0, 8),
            expiresAt: Number(msg.expiresAt) || 0,
            resumed: msg.resumed === true,
          }
        : null;
    case 'joined':
      return isRoomCode(msg.code) && typeof msg.token === 'string'
        ? { t: 'joined', code: msg.code, token: msg.token, resumed: msg.resumed === true }
        : null;
    case 'peer-joined':
      return { t: 'peer-joined' };
    case 'peer-left':
      return { t: 'peer-left', reason: msg.reason === 'left' ? 'left' : 'disconnected' };
    case 'signal': {
      const payload = parsePayload(msg.payload);
      return payload ? { t: 'signal', payload } : null;
    }
    case 'status': {
      const status = parsePhoneStatus(msg.status);
      return status ? { t: 'status', status } : null;
    }
    case 'error':
      return {
        t: 'error',
        code: (['invalid', 'bad-code', 'room-full', 'rate-limited', 'not-in-room', 'expired'] as const).includes(
          msg.code as ErrorCode,
        )
          ? (msg.code as ErrorCode)
          : 'invalid',
        message: typeof msg.message === 'string' ? msg.message.slice(0, 200) : '',
      };
    case 'pong':
      return { t: 'pong' };
    default:
      return null;
  }
}
