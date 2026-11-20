/**
 * Synthesized key-click (WebAudio). No audio assets, works offline.
 * The AudioContext is created lazily on the first user gesture to satisfy
 * autoplay policies.
 */

let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;

function context(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor({ latencyHint: 'interactive' });
  } catch {
    return null;
  }
  const len = Math.floor(ctx.sampleRate * 0.03);
  noise = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  return ctx;
}

export type ClickKind = 'key' | 'mod' | 'space' | 'enter';

const TONE: Record<ClickKind, number> = { key: 2600, mod: 1700, space: 1200, enter: 900 };

export function playClick(kind: ClickKind = 'key', volume = 0.18): void {
  const ac = context();
  if (!ac || !noise) return;
  if (ac.state === 'suspended') void ac.resume();
  const t = ac.currentTime;

  const src = ac.createBufferSource();
  src.buffer = noise;
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = TONE[kind];
  bp.Q.value = 2.5;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
  src.connect(bp).connect(gain).connect(ac.destination);
  src.start(t);
  src.stop(t + 0.05);
}
