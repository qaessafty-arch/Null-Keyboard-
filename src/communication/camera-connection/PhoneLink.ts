import { SignalingClient } from '@/communication/signaling/SignalingClient';
import type { PhoneStatus, ServerMessage } from '@/communication/signaling/protocol';
import { CandidateBuffer, RTC_CONFIG, boostVideoBitrate, candidatePayload } from '@/communication/webrtc/rtc';

export type PhoneState =
  | 'idle'
  | 'connecting'
  | 'waiting-camera'
  | 'permission-required'
  | 'camera-unavailable'
  | 'streaming'
  | 'reconnecting'
  | 'host-gone'
  | 'error';

export interface PhoneSnapshot {
  state: PhoneState;
  message: string | null;
  stream: MediaStream | null;
  cameras: MediaDeviceInfo[];
  deviceId: string | null;
  settings: MediaTrackSettings | null;
}

export type Resolution = '480p' | '720p' | '1080p';
const HEIGHT: Record<Resolution, number> = { '480p': 480, '720p': 720, '1080p': 1080 };

/**
 * Phone side: joins the room, opens the rear camera, and sends one video
 * track to the Surface over WebRTC. Recovers from Wi-Fi drops (re-joins with
 * its token and re-offers) and from Android pausing the camera in background.
 */
export class PhoneLink {
  private signaling: SignalingClient | null = null;
  private pc: RTCPeerConnection | null = null;
  private candidates: CandidateBuffer | null = null;
  private token: string | null = null;
  private code: string | null = null;
  private hostPresent = false;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private wakeLock: { release: () => Promise<void> } | null = null;
  private snap: PhoneSnapshot = {
    state: 'idle',
    message: null,
    stream: null,
    cameras: [],
    deviceId: null,
    settings: null,
  };
  private listeners = new Set<(s: PhoneSnapshot) => void>();

  constructor(private resolution: Resolution = '720p') {}

  subscribe(l: (s: PhoneSnapshot) => void): () => void {
    this.listeners.add(l);
    l(this.snap);
    return () => this.listeners.delete(l);
  }

  get snapshot(): PhoneSnapshot {
    return this.snap;
  }

  /** Must be called from a user gesture (camera permission prompt). */
  async start(code: string): Promise<void> {
    // A fresh start (new code, or after the session ended) needs a fresh socket.
    if (this.signaling) {
      this.signaling.stop();
      this.signaling = null;
    }
    if (code !== this.code) this.token = null;
    this.closePeer();
    this.code = code;
    this.update({ state: 'connecting', message: null });
    // Ask for the camera first, inside the user gesture.
    const ok = await this.openCamera(this.snap.deviceId);
    if (!ok) {
      this.connectSignaling(); // still join, so the Surface can show why
      return;
    }
    this.connectSignaling();
    void this.requestWakeLock();
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  async switchCamera(deviceId: string): Promise<void> {
    const ok = await this.openCamera(deviceId);
    if (!ok) return;
    const track = this.snap.stream?.getVideoTracks()[0];
    const sender = this.pc?.getSenders().find((s) => s.track?.kind === 'video' || s.track === null);
    if (track && sender) await sender.replaceTrack(track);
    this.sendStatus();
  }

  async setResolution(res: Resolution): Promise<void> {
    this.resolution = res;
    const track = this.snap.stream?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints(this.videoConstraints(this.snap.deviceId));
      this.update({ settings: track.getSettings() });
      this.sendStatus();
    } catch {
      /* keep current */
    }
  }

  stop(): void {
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.sendStatus('stopped');
    this.signaling?.stop();
    this.signaling = null;
    this.closePeer();
    this.stopCamera();
    void this.wakeLock?.release().catch(() => {});
    this.wakeLock = null;
    this.token = null;
    this.update({ state: 'idle', message: null });
  }

  // ── camera ─────────────────────────────────────────────────────────────

  private videoConstraints(deviceId: string | null): MediaTrackConstraints {
    const h = HEIGHT[this.resolution];
    return {
      ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' } }),
      height: { ideal: h },
      width: { ideal: Math.round((h * 16) / 9) },
      frameRate: { ideal: 30, max: 30 },
    };
  }

  private async openCamera(deviceId: string | null): Promise<boolean> {
    if (!navigator.mediaDevices?.getUserMedia) {
      this.update({
        state: 'camera-unavailable',
        message: window.isSecureContext
          ? 'This browser has no camera API.'
          : 'Camera blocked: this page is not on HTTPS. Open the https:// address shown on the Surface.',
      });
      this.sendStatus('unavailable', this.snap.message ?? undefined);
      return false;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: this.videoConstraints(deviceId), audio: false });
    } catch (err) {
      const name = (err as DOMException).name;
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        this.update({
          state: 'permission-required',
          message: 'Camera permission was denied. Allow camera access for this site in the browser settings, then tap Start again.',
        });
        this.sendStatus('permission-required');
      } else {
        this.update({ state: 'camera-unavailable', message: `Camera unavailable (${name}).` });
        this.sendStatus('unavailable', name);
      }
      return false;
    }
    this.stopCamera();
    const track = stream.getVideoTracks()[0]!;
    track.onended = () => {
      if (this.snap.state === 'streaming') void this.recoverCamera();
    };
    let cameras: MediaDeviceInfo[] = [];
    try {
      cameras = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
    } catch {
      cameras = [];
    }
    const settings = track.getSettings();
    this.update({ stream, cameras, deviceId: settings.deviceId ?? deviceId, settings });
    return true;
  }

  private stopCamera(): void {
    this.snap.stream?.getTracks().forEach((t) => t.stop());
    this.update({ stream: null });
  }

  private async recoverCamera(): Promise<void> {
    if (!(await this.openCamera(this.snap.deviceId))) return;
    const track = this.snap.stream?.getVideoTracks()[0];
    const sender = this.pc?.getSenders()[0];
    if (track && sender) await sender.replaceTrack(track);
    else this.scheduleOffer(0);
    this.sendStatus();
  }

  private onVisibility = () => {
    if (document.visibilityState !== 'visible') return;
    void this.requestWakeLock();
    const track = this.snap.stream?.getVideoTracks()[0];
    if (!track || track.readyState === 'ended') void this.recoverCamera();
  };

  private async requestWakeLock(): Promise<void> {
    const wl = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } })
      .wakeLock;
    if (!wl) return;
    try {
      this.wakeLock = await wl.request('screen');
    } catch {
      /* not allowed now */
    }
  }

  // ── signaling ──────────────────────────────────────────────────────────

  private connectSignaling(): void {
    if (this.signaling) return;
    this.signaling = new SignalingClient({
      onOpen: () => this.signaling?.send({ t: 'join', code: this.code!, ...(this.token ? { token: this.token } : {}) }),
      onMessage: (m) => void this.onMessage(m),
      onState: (s) => {
        if (s === 'connecting' && this.snap.state === 'streaming') this.update({ state: 'reconnecting' });
      },
    });
    this.signaling.start();
  }

  private async onMessage(msg: ServerMessage): Promise<void> {
    switch (msg.t) {
      case 'joined':
        this.token = msg.token;
        this.hostPresent = true;
        if (this.snap.stream) {
          this.sendStatus();
          this.scheduleOffer(0);
        } else if (this.snap.state === 'permission-required') {
          this.sendStatus('permission-required');
        } else if (this.snap.state === 'camera-unavailable') {
          this.sendStatus('unavailable', this.snap.message ?? undefined);
        }
        return;
      case 'peer-joined':
        // Host came back (reloaded / resumed) — renegotiate.
        this.hostPresent = true;
        if (this.snap.stream) {
          this.sendStatus();
          this.scheduleOffer(0);
        }
        return;
      case 'peer-left':
        this.hostPresent = false;
        this.closePeer();
        if (msg.reason === 'left') {
          // Session over: the camera must not keep running.
          this.signaling?.stop();
          this.signaling = null;
          this.stopCamera();
          void this.wakeLock?.release().catch(() => {});
          this.wakeLock = null;
          this.update({ state: 'host-gone', message: 'The Surface ended the session. The camera is off.' });
        } else {
          this.update({ state: 'reconnecting', message: 'Waiting for the Surface to come back…' });
        }
        return;
      case 'signal':
        if (!this.pc) return;
        if (msg.payload.kind === 'answer') {
          try {
            await this.pc.setRemoteDescription({ type: 'answer', sdp: boostVideoBitrate(msg.payload.sdp) });
            await this.candidates?.flush();
          } catch (err) {
            this.update({ state: 'error', message: `Negotiation failed: ${(err as Error).message}` });
          }
        } else if (msg.payload.kind === 'candidate') {
          await this.candidates?.add(msg.payload);
        }
        return;
      case 'error':
        if (msg.code === 'bad-code' || msg.code === 'room-full' || msg.code === 'rate-limited') {
          this.signaling?.stop();
          this.signaling = null;
          this.stopCamera();
          this.update({ state: 'error', message: msg.message });
        }
        return;
      default:
        return;
    }
  }

  private scheduleOffer(delayMs: number): void {
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      void this.offer();
    }, delayMs);
  }

  private async offer(): Promise<void> {
    const track = this.snap.stream?.getVideoTracks()[0];
    if (!track || !this.hostPresent || !this.signaling?.isOpen) return;
    this.closePeer();
    const pc = new RTCPeerConnection(RTC_CONFIG);
    this.pc = pc;
    this.candidates = new CandidateBuffer(pc);
    const tx = pc.addTransceiver(track, { direction: 'sendonly', streams: [this.snap.stream!] });
    pc.onicecandidate = (e) => {
      if (e.candidate) this.signaling?.send({ t: 'signal', payload: candidatePayload(e.candidate) });
    };
    pc.onconnectionstatechange = () => {
      if (pc !== this.pc) return;
      if (pc.connectionState === 'connected') {
        this.update({ state: 'streaming', message: null });
        void this.tuneSender(tx.sender);
      } else if (pc.connectionState === 'disconnected') {
        this.update({ state: 'reconnecting', message: 'Connection interrupted — recovering…' });
        this.scheduleOffer(4000);
      } else if (pc.connectionState === 'failed') {
        this.update({ state: 'reconnecting', message: 'Connection failed — retrying…' });
        this.scheduleOffer(1000);
      }
    };
    try {
      await pc.setLocalDescription(await pc.createOffer());
      this.signaling.send({ t: 'signal', payload: { kind: 'offer', sdp: pc.localDescription!.sdp } });
      if (this.snap.state !== 'streaming') this.update({ state: 'waiting-camera', message: 'Connecting to the Surface…' });
    } catch (err) {
      this.update({ state: 'error', message: `Could not start the stream: ${(err as Error).message}` });
    }
  }

  /**
   * Hand tracking needs both detail and frame rate. 'balanced' stops the
   * encoder from collapsing to 320×180 the way 'maintain-framerate' does on
   * a loaded phone; the LAN has plenty of bandwidth for 2.5 Mbit/s.
   */
  private async tuneSender(sender: RTCRtpSender): Promise<void> {
    try {
      const params = sender.getParameters();
      params.degradationPreference = 'balanced';
      if (!params.encodings?.length) params.encodings = [{}];
      params.encodings[0]!.maxBitrate = 2_500_000;
      params.encodings[0]!.maxFramerate = 30;
      await sender.setParameters(params);
    } catch {
      /* best effort */
    }
  }

  private closePeer(): void {
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = null;
    if (this.pc) {
      this.pc.onicecandidate = this.pc.onconnectionstatechange = null;
      this.pc.close();
    }
    this.pc = null;
    this.candidates = null;
  }

  private sendStatus(camera?: PhoneStatus['camera'], detail?: string): void {
    const s = this.snap.settings;
    const status: PhoneStatus = {
      camera: camera ?? (this.snap.stream ? 'streaming' : 'starting'),
      ...(detail ? { detail } : {}),
    };
    const track = this.snap.stream?.getVideoTracks()[0];
    if (track) status.label = track.label.slice(0, 120);
    if (s?.width) status.width = s.width;
    if (s?.height) status.height = s.height;
    if (s?.frameRate) status.frameRate = Math.round(s.frameRate);
    this.signaling?.send({ t: 'status', status });
  }

  private update(patch: Partial<PhoneSnapshot>): void {
    this.snap = { ...this.snap, ...patch };
    for (const l of this.listeners) l(this.snap);
  }
}
