import { createMainThreadDetector, createWorkerDetector, type Detector } from './detectors';
import { HandSmoother } from './HandSmoother';
import type { RawResult, TrackingFrame } from './types';
import { RollingStat } from '@/engine/performance/RollingStat';
import { QUALITY_PROFILES } from '@/engine/performance/quality';
import { useLinkStore } from '@/stores/linkStore';
import { useSettings } from '@/stores/settingsStore';
import { useTrackingStore } from '@/stores/trackingStore';

type FrameListener = (frame: TrackingFrame) => void;

/**
 * Runs MediaPipe on the phone stream while at least one consumer has
 * acquired it (Air Mode workspace, calibration). Frames are pumped with
 * requestVideoFrameCallback (once per decoded camera frame), throttled to the
 * configured tracking rate, and dropped while the detector is busy, so the
 * pipeline never queues up latency.
 */
export class HandTracker {
  private users = 0;
  private running = false;
  private starting: Promise<void> | null = null;
  private detector: Detector | null = null;
  private video: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private busy = false;
  private frameCount = 0;
  private lastSubmit = 0;
  private vfcHandle = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<FrameListener>();
  private smoother = new HandSmoother();
  private resultTimes: number[] = [];
  private lastStoreUpdate = 0;
  private lastHandsAt = 0;
  readonly detectStat = new RollingStat(120);
  readonly pipelineStat = new RollingStat(120);
  private lastFrame: TrackingFrame | null = null;

  constructor() {
    useLinkStore.subscribe((s, prev) => {
      if (s.stream !== prev.stream) this.ensure();
    });
    useSettings.subscribe((s, prev) => {
      if (s.air.minConfidence !== prev.air.minConfidence) {
        this.detector?.setConfidence(s.air.minConfidence, s.air.minConfidence, 0.5);
      }
      if (s.performance.inference !== prev.performance.inference) {
        // Recreate the detector with the new delegate.
        const users = this.users;
        this.dispose();
        this.users = users;
        this.ensure();
      }
    });
  }

  /** Request tracking. Returns a release function. */
  acquire(): () => void {
    this.users++;
    this.ensure();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.users--;
      this.ensure();
    };
  }

  subscribe(listener: FrameListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get latest(): TrackingFrame | null {
    return this.lastFrame;
  }

  /** Close the detector and free GPU/wasm memory. */
  dispose(): void {
    this.stop();
    this.detector?.close();
    this.detector = null;
  }

  // ── lifecycle ──────────────────────────────────────────────────────────

  private ensure(): void {
    const stream = useLinkStore.getState().stream;
    const want = this.users > 0 && stream !== null;
    if (want && (!this.running || stream !== this.stream)) {
      void this.start(stream!);
    } else if (!want && this.running) {
      this.stop();
    }
  }

  private async start(stream: MediaStream): Promise<void> {
    if (this.starting) {
      await this.starting;
      if (this.stream === stream && this.running) return;
    }
    this.starting = this.doStart(stream).finally(() => {
      this.starting = null;
    });
    await this.starting;
  }

  private async doStart(stream: MediaStream): Promise<void> {
    this.stopPump();
    this.stream = stream;
    this.attachVideo(stream);

    if (!this.detector) {
      useTrackingStore.setState({ status: 'loading', error: null });
      const conf = useSettings.getState().air.minConfidence;
      const gpu = useSettings.getState().performance.inference === 'gpu';
      try {
        this.detector = await createWorkerDetector(conf, gpu);
      } catch (workerErr) {
        console.warn('[hand-tracker] worker unavailable, using main thread:', (workerErr as Error).message);
        try {
          this.detector = await createMainThreadDetector(conf, gpu);
        } catch (err) {
          useTrackingStore.setState({ status: 'error', error: `Hand tracking failed to load: ${(err as Error).message}` });
          return;
        }
      }
      useTrackingStore.setState({
        backend: this.detector.kind,
        delegate: this.detector.delegate,
        modelSource: this.detector.modelSource,
      });
    }
    // Conditions may have changed while loading.
    if (this.users === 0 || useLinkStore.getState().stream !== stream) {
      if (this.users === 0) this.stop();
      return;
    }
    this.running = true;
    useTrackingStore.setState({ status: 'running', error: null });
    this.schedule();
  }

  private stop(): void {
    this.running = false;
    this.stopPump();
    this.video?.remove();
    if (this.video) this.video.srcObject = null;
    this.video = null;
    this.stream = null;
    const lost = this.smoother.reset();
    if (lost.length) this.emit({ timestamp: performance.now(), hands: [], lost, videoWidth: 0, videoHeight: 0 });
    this.resultTimes = [];
    useTrackingStore.setState({ status: 'off', hands: [], detectFps: null, lost: false });
  }

  /**
   * A tiny, nearly invisible <video> in the DOM: requestVideoFrameCallback
   * only fires for videos that are composited, and the visible preview may be
   * hidden or unmounted.
   */
  private attachVideo(stream: MediaStream): void {
    if (!this.video) {
      const v = document.createElement('video');
      v.muted = true;
      v.playsInline = true;
      v.autoplay = true;
      v.setAttribute('aria-hidden', 'true');
      v.dataset.role = 'tracker-source';
      Object.assign(v.style, {
        position: 'fixed',
        left: '0',
        bottom: '0',
        width: '2px',
        height: '2px',
        opacity: '0.01',
        pointerEvents: 'none',
        zIndex: '-1',
      });
      document.body.appendChild(v);
      this.video = v;
    }
    if (this.video.srcObject !== stream) this.video.srcObject = stream;
    void this.video.play().catch(() => {});
  }

  // ── frame pump ─────────────────────────────────────────────────────────

  private schedule(): void {
    const v = this.video;
    if (!this.running || !v) return;
    if ('requestVideoFrameCallback' in v) {
      this.vfcHandle = v.requestVideoFrameCallback(() => this.onVideoFrame());
    } else {
      const hz = useSettings.getState().performance.trackingHz;
      this.timer = setTimeout(() => this.onVideoFrame(), 1000 / hz);
    }
  }

  private stopPump(): void {
    if (this.video && this.vfcHandle && 'cancelVideoFrameCallback' in this.video) {
      this.video.cancelVideoFrameCallback(this.vfcHandle);
    }
    this.vfcHandle = 0;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private onVideoFrame(): void {
    if (!this.running) return;
    this.schedule();
    const v = this.video;
    const detector = this.detector;
    if (!v || !detector || this.busy || v.readyState < 2 || v.videoWidth === 0) return;

    const s = useSettings.getState();
    const now = performance.now();
    const minInterval = 1000 / s.performance.trackingHz - 4; // small slack for frame jitter
    if (now - this.lastSubmit < minInterval) return;
    const stride = QUALITY_PROFILES[s.performance.quality].frameStride;
    if (++this.frameCount % stride !== 0) return;

    this.lastSubmit = now;
    this.busy = true;
    const width = v.videoWidth;
    const height = v.videoHeight;
    createImageBitmap(v)
      .then((bitmap) => detector.detect(bitmap, now))
      .then((res) => this.onResult(res, now, width, height))
      .catch(() => {
        /* frame dropped (stream switching) */
      })
      .finally(() => {
        this.busy = false;
      });
  }

  private onResult(res: RawResult, submittedAt: number, videoWidth: number, videoHeight: number): void {
    if (!this.running) return;
    const now = performance.now();
    this.detectStat.record(res.detectMs);
    this.pipelineStat.record(now - submittedAt);
    this.resultTimes.push(now);
    while (this.resultTimes.length && now - this.resultTimes[0]! > 1000) this.resultTimes.shift();

    const { hands, lost } = this.smoother.update(res.hands, submittedAt);
    if (hands.length) this.lastHandsAt = now;
    const frame: TrackingFrame = { timestamp: submittedAt, hands, lost, videoWidth, videoHeight };
    this.lastFrame = frame;
    this.emit(frame);

    if (now - this.lastStoreUpdate > 200) {
      this.lastStoreUpdate = now;
      useTrackingStore.setState({
        hands: hands.map((h) => ({ id: h.id, label: h.label, score: h.score })),
        detectFps: this.resultTimes.length,
        detectMs: this.detectStat.mean(),
        pipelineMs: this.pipelineStat.mean(),
        videoWidth,
        videoHeight,
        lost: hands.length === 0 && this.lastHandsAt > 0 && now - this.lastHandsAt < 5000,
      });
    }
  }

  private emit(frame: TrackingFrame): void {
    for (const l of this.listeners) l(frame);
  }
}

export const handTracker = new HandTracker();
