import { create } from 'zustand';
import type { PhoneStatus } from '@/communication/signaling/protocol';
import { EMPTY_STATS, type LinkStats } from '@/communication/webrtc/rtc';

export type CameraLinkState =
  | 'idle'
  | 'waiting'
  | 'connecting'
  | 'permission-required'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'unavailable';

/**
 * Real state of the phone-camera link on the Surface. Only the HostLink
 * controller writes here, from actual signaling/WebRTC events.
 */
interface LinkState {
  state: CameraLinkState;
  /** Pairing code while a room exists. */
  code: string | null;
  /** URLs the phone can use to reach this server. */
  urls: string[];
  /** Reachable from the phone? False when served from localhost-only / plain HTTP. */
  serverReachable: boolean;
  error: string | null;
  phone: PhoneStatus | null;
  stream: MediaStream | null;
  stats: LinkStats;
}

export const useLinkStore = create<LinkState>(() => ({
  state: 'idle',
  code: null,
  urls: [],
  serverReachable: false,
  error: null,
  phone: null,
  stream: null,
  stats: EMPTY_STATS,
}));
