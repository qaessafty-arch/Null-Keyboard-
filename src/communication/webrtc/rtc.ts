import type { SignalPayload } from '@/communication/signaling/protocol';

/**
 * LAN-only WebRTC: no STUN/TURN servers. Both devices are on the same
 * network, so host candidates suffice and nothing leaves the LAN.
 */
export const RTC_CONFIG: RTCConfiguration = {
  iceServers: [],
  bundlePolicy: 'max-bundle',
};

/** Applies remote ICE candidates, buffering any that arrive before the remote description. */
export class CandidateBuffer {
  private pending: RTCIceCandidateInit[] = [];
  constructor(private readonly pc: RTCPeerConnection) {}

  async add(payload: Extract<SignalPayload, { kind: 'candidate' }>): Promise<void> {
    const init: RTCIceCandidateInit = {
      candidate: payload.candidate.candidate,
      sdpMid: payload.candidate.sdpMid,
      sdpMLineIndex: payload.candidate.sdpMLineIndex,
    };
    if (!this.pc.remoteDescription) {
      this.pending.push(init);
      return;
    }
    await this.pc.addIceCandidate(init).catch(() => {});
  }

  async flush(): Promise<void> {
    const list = this.pending;
    this.pending = [];
    for (const c of list) await this.pc.addIceCandidate(c).catch(() => {});
  }
}

export function candidatePayload(c: RTCIceCandidate): SignalPayload {
  return { kind: 'candidate', candidate: { candidate: c.candidate, sdpMid: c.sdpMid, sdpMLineIndex: c.sdpMLineIndex } };
}

export interface LinkStats {
  /** Received video frames per second. */
  fps: number | null;
  width: number | null;
  height: number | null;
  /** Round-trip time in ms on the selected candidate pair. */
  rttMs: number | null;
  /** Packet loss percentage since the previous sample. */
  lossPct: number | null;
  jitterMs: number | null;
  /** Received video bitrate in kbit/s. */
  kbps: number | null;
  quality: 'good' | 'fair' | 'poor' | 'unknown';
}

export const EMPTY_STATS: LinkStats = {
  fps: null,
  width: null,
  height: null,
  rttMs: null,
  lossPct: null,
  jitterMs: null,
  kbps: null,
  quality: 'unknown',
};

interface Prev {
  at: number;
  bytes: number;
  lost: number;
  received: number;
}

/** Reads real receiver-side stats from an RTCPeerConnection. */
export class StatsSampler {
  private prev: Prev | null = null;
  constructor(private readonly pc: RTCPeerConnection) {}

  async sample(): Promise<LinkStats> {
    const report = await this.pc.getStats();
    let inbound: Record<string, unknown> | null = null;
    let pair: Record<string, unknown> | null = null;
    let selectedPairId: string | null = null;
    report.forEach((s: Record<string, unknown>) => {
      if (s.type === 'inbound-rtp' && s.kind === 'video') inbound = s;
      if (s.type === 'transport' && typeof s.selectedCandidatePairId === 'string') selectedPairId = s.selectedCandidatePairId;
    });
    report.forEach((s: Record<string, unknown>) => {
      if (s.type === 'candidate-pair' && (s.id === selectedPairId || (selectedPairId === null && s.nominated && s.state === 'succeeded'))) {
        pair = s;
      }
    });

    const out: LinkStats = { ...EMPTY_STATS };
    const inb = inbound as Record<string, number> | null;
    if (inb) {
      out.fps = typeof inb.framesPerSecond === 'number' ? inb.framesPerSecond : null;
      out.width = typeof inb.frameWidth === 'number' ? inb.frameWidth : null;
      out.height = typeof inb.frameHeight === 'number' ? inb.frameHeight : null;
      out.jitterMs = typeof inb.jitter === 'number' ? inb.jitter * 1000 : null;
      const now = typeof inb.timestamp === 'number' ? inb.timestamp : performance.now();
      const bytes = inb.bytesReceived ?? 0;
      const lost = Math.max(0, inb.packetsLost ?? 0);
      const received = inb.packetsReceived ?? 0;
      if (this.prev && now > this.prev.at) {
        out.kbps = ((bytes - this.prev.bytes) * 8) / (now - this.prev.at);
        const dl = lost - this.prev.lost;
        const dr = received - this.prev.received;
        out.lossPct = dl + dr > 0 ? (100 * dl) / (dl + dr) : 0;
      }
      this.prev = { at: now, bytes, lost, received };
    }
    const p = pair as Record<string, number> | null;
    if (p && typeof p.currentRoundTripTime === 'number') out.rttMs = p.currentRoundTripTime * 1000;
    out.quality = rateQuality(out);
    return out;
  }
}

export function rateQuality(s: LinkStats): LinkStats['quality'] {
  if (s.fps === null) return 'unknown';
  const loss = s.lossPct ?? 0;
  const rtt = s.rttMs ?? 0;
  if (s.fps >= 24 && loss < 2 && rtt < 80) return 'good';
  if (s.fps >= 15 && loss < 8 && rtt < 200) return 'fair';
  return 'poor';
}

/**
 * LAN bitrate hint: WebRTC's bandwidth estimator starts near 300 kbit/s and
 * only ramps up with busy video, which leaves hand images at 320×180 for a
 * long time. On a LAN we can safely start high. Adds Chrome's
 * x-google-start/min-bitrate to every video codec's fmtp line. Applied to the
 * remote answer on the phone (the sending side reads it from there).
 */
export function boostVideoBitrate(sdp: string, startKbps = 1800, minKbps = 900): string {
  const lines = sdp.split('\r\n');
  const out: string[] = [];
  let inVideo = false;
  const videoPts = new Set<string>();
  const fmtpSeen = new Set<string>();
  for (const line of lines) {
    if (line.startsWith('m=')) {
      inVideo = line.startsWith('m=video');
      if (inVideo) line.split(' ').slice(3).forEach((pt) => videoPts.add(pt));
    }
    if (inVideo && line.startsWith('a=fmtp:')) {
      const pt = line.slice(7).split(' ')[0]!;
      fmtpSeen.add(pt);
      if (!line.includes('x-google-start-bitrate') && !line.includes('apt=')) {
        out.push(`${line};x-google-start-bitrate=${startKbps};x-google-min-bitrate=${minKbps}`);
        continue;
      }
    }
    out.push(line);
  }
  // Codecs without an fmtp line (VP8) get one right after their rtpmap.
  const result: string[] = [];
  for (const line of out) {
    result.push(line);
    const m = /^a=rtpmap:(\d+) (VP8|VP9|AV1|H264)\//.exec(line);
    if (m && videoPts.has(m[1]!) && !fmtpSeen.has(m[1]!)) {
      result.push(`a=fmtp:${m[1]} x-google-start-bitrate=${startKbps};x-google-min-bitrate=${minKbps}`);
    }
  }
  return result.join('\r\n');
}
