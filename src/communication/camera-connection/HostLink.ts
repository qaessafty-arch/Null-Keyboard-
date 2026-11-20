import { SignalingClient } from '@/communication/signaling/SignalingClient';
import type { ServerMessage, SignalPayload } from '@/communication/signaling/protocol';
import { CandidateBuffer, EMPTY_STATS, RTC_CONFIG, StatsSampler, candidatePayload } from '@/communication/webrtc/rtc';
import { useLinkStore, type CameraLinkState } from '@/stores/linkStore';

const SESSION_KEY = 'neo-type:host-room';

/**
 * Surface side of the phone-camera link.
 *
 *  signaling: create (or resume) a room → show the code → wait for the phone
 *  WebRTC:    the phone offers a send-only video track; we answer recv-only
 *
 * Every state shown in the UI comes from a real event here. A new offer from
 * the phone (after a drop or camera switch) replaces the peer connection.
 */
export class HostLink {
  private signaling: SignalingClient | null = null;
  private pc: RTCPeerConnection | null = null;
  private candidates: CandidateBuffer | null = null;
  private sampler: StatsSampler | null = null;
  private statsTimer: ReturnType<typeof setInterval> | null = null;
  private disconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private phonePresent = false;

  get active(): boolean {
    return this.signaling !== null;
  }

  /** After a page reload, re-attach to the room we were hosting (if any). */
  resumeIfSaved(): void {
    try {
      if (sessionStorage.getItem(SESSION_KEY)) this.start();
    } catch {
      /* storage unavailable */
    }
  }

  start(): void {
    if (this.signaling) return;
    this.set({ state: 'waiting', error: null });
    this.signaling = new SignalingClient({
      onOpen: () => this.announce(),
      onMessage: (m) => void this.onMessage(m),
      onState: (s) => {
        if (s === 'connecting' && useLinkStore.getState().code && !this.pc) {
          this.set({ error: 'Signaling server unreachable — retrying…' });
        }
      },
    });
    this.signaling.start();
  }

  /** End the session: tell the phone, close everything, forget the room. */
  stop(): void {
    this.signaling?.stop();
    this.signaling = null;
    this.closePeer();
    this.phonePresent = false;
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* storage unavailable */
    }
    useLinkStore.setState({
      state: 'idle',
      code: null,
      urls: [],
      error: null,
      phone: null,
      stream: null,
      stats: EMPTY_STATS,
    });
  }

  /** Throw the current code away and get a fresh one. */
  newCode(): void {
    this.closePeer();
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
    this.signaling?.send({ t: 'leave' });
    this.signaling?.send({ t: 'host' });
  }

  // ── signaling ──────────────────────────────────────────────────────────

  private announce(): void {
    let saved: { code: string; token: string } | null = null;
    try {
      saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null');
    } catch {
      saved = null;
    }
    if (saved?.code && saved.token) this.signaling?.send({ t: 'host', code: saved.code, token: saved.token });
    else this.signaling?.send({ t: 'host' });
  }

  private async onMessage(msg: ServerMessage): Promise<void> {
    switch (msg.t) {
      case 'room': {
        try {
          sessionStorage.setItem(SESSION_KEY, JSON.stringify({ code: msg.code, token: msg.token }));
        } catch {
          /* ignore */
        }
        const urls = [...msg.urls];
        // If the Surface itself opened a LAN URL, that one certainly works.
        const own = location.origin;
        if (!/\/\/(localhost|127\.0\.0\.1|\[::1\])(:|$)/.test(own) && !urls.includes(own)) urls.unshift(own);
        this.set({
          code: msg.code,
          urls,
          serverReachable: urls.length > 0,
          error: null,
          ...(msg.resumed ? {} : { state: 'waiting' as const }),
        });
        return;
      }
      case 'peer-joined':
        this.phonePresent = true;
        if (!this.pc || this.pc.connectionState !== 'connected') this.set({ state: 'connecting', error: null });
        return;
      case 'peer-left':
        this.phonePresent = false;
        if (msg.reason === 'disconnected') {
          this.set({ state: 'reconnecting' });
        } else {
          this.closePeer();
          this.set({ state: 'waiting', phone: null, stream: null, stats: EMPTY_STATS });
        }
        return;
      case 'status':
        this.onPhoneStatus(msg.status);
        return;
      case 'signal':
        await this.onSignal(msg.payload);
        return;
      case 'error':
        if (msg.code === 'expired') {
          try {
            sessionStorage.removeItem(SESSION_KEY);
          } catch {
            /* ignore */
          }
          this.closePeer();
          this.set({ code: null, state: 'waiting', error: null, phone: null, stream: null });
          this.signaling?.send({ t: 'host' });
        } else {
          this.set({ error: msg.message || msg.code });
        }
        return;
      default:
        return;
    }
  }

  private onPhoneStatus(status: NonNullable<ReturnType<typeof useLinkStore.getState>['phone']>): void {
    this.set({ phone: status });
    switch (status.camera) {
      case 'permission-required':
        this.set({ state: 'permission-required' });
        break;
      case 'unavailable':
        this.set({ state: 'unavailable', error: status.detail ?? 'Camera unavailable on the phone' });
        break;
      case 'stopped':
        this.closePeer();
        this.set({ state: this.phonePresent ? 'connecting' : 'waiting', stream: null, stats: EMPTY_STATS });
        break;
      default:
        if (useLinkStore.getState().state !== 'connected') this.set({ state: 'connecting' });
    }
  }

  // ── WebRTC ─────────────────────────────────────────────────────────────

  private async onSignal(payload: SignalPayload): Promise<void> {
    if (payload.kind === 'offer') {
      this.closePeer();
      const pc = new RTCPeerConnection(RTC_CONFIG);
      this.pc = pc;
      this.candidates = new CandidateBuffer(pc);
      this.sampler = new StatsSampler(pc);

      pc.onicecandidate = (e) => {
        if (e.candidate) this.signaling?.send({ t: 'signal', payload: candidatePayload(e.candidate) });
      };
      pc.ontrack = (e) => {
        const stream = e.streams[0] ?? new MediaStream([e.track]);
        // Hint the receiver to keep latency minimal (no jitter-buffer growth).
        const receiver = e.receiver as unknown as Record<string, unknown>;
        try {
          if ('jitterBufferTarget' in receiver) receiver.jitterBufferTarget = 0;
          else receiver.playoutDelayHint = 0;
        } catch {
          /* not supported */
        }
        this.set({ stream });
      };
      pc.onconnectionstatechange = () => this.onPcState(pc);

      try {
        await pc.setRemoteDescription({ type: 'offer', sdp: payload.sdp });
        await this.candidates.flush();
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.signaling?.send({ t: 'signal', payload: { kind: 'answer', sdp: pc.localDescription!.sdp } });
        this.set({ state: 'connecting' });
      } catch (err) {
        this.set({ error: `WebRTC negotiation failed: ${(err as Error).message}` });
      }
    } else if (payload.kind === 'candidate') {
      await this.candidates?.add(payload);
    }
  }

  private onPcState(pc: RTCPeerConnection): void {
    if (pc !== this.pc) return;
    if (this.disconnectTimer) {
      clearTimeout(this.disconnectTimer);
      this.disconnectTimer = null;
    }
    switch (pc.connectionState) {
      case 'connected':
        this.set({ state: 'connected', error: null });
        this.startStats();
        break;
      case 'disconnected':
        this.set({ state: 'reconnecting' });
        // The phone restarts the connection; if nothing recovers, say so.
        this.disconnectTimer = setTimeout(() => {
          if (this.pc === pc && pc.connectionState !== 'connected') this.set({ state: 'disconnected' });
        }, 15_000);
        break;
      case 'failed':
        this.set({ state: this.phonePresent ? 'reconnecting' : 'disconnected' });
        this.stopStats();
        break;
      default:
        break;
    }
  }

  private startStats(): void {
    this.stopStats();
    this.statsTimer = setInterval(async () => {
      if (!this.sampler) return;
      try {
        this.set({ stats: await this.sampler.sample() });
      } catch {
        /* pc closed */
      }
    }, 1000);
  }

  private stopStats(): void {
    if (this.statsTimer) clearInterval(this.statsTimer);
    this.statsTimer = null;
  }

  private closePeer(): void {
    this.stopStats();
    if (this.disconnectTimer) clearTimeout(this.disconnectTimer);
    this.disconnectTimer = null;
    if (this.pc) {
      this.pc.onicecandidate = this.pc.ontrack = this.pc.onconnectionstatechange = null;
      this.pc.close();
    }
    this.pc = null;
    this.candidates = null;
    this.sampler = null;
    const stream = useLinkStore.getState().stream;
    stream?.getTracks().forEach((t) => t.stop());
  }

  private set(patch: Partial<ReturnType<typeof useLinkStore.getState>> & { state?: CameraLinkState }): void {
    useLinkStore.setState(patch);
  }
}

/** The one host link for the app. */
export const hostLink = new HostLink();
