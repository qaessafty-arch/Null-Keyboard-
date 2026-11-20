import { frameMeter } from './metrics';
import { useSettings, type QualityMode } from '@/stores/settingsStore';
import { notify } from '@/stores/noticeStore';

const NEXT: Record<QualityMode, QualityMode | null> = { high: 'balanced', balanced: 'low', low: null };
const LOW_FPS = 40;
const SUSTAIN_MS = 6000;

/**
 * Adaptive quality: if rendering stays below 40 FPS for 6 s while the tab is
 * visible, step quality down one level (High → Balanced → Low) and say so.
 * Never steps up on its own — the user stays in control of that.
 */
export function startAutoQuality(): () => void {
  let lowSince: number | null = null;
  let cooldownUntil = 0;
  return frameMeter.subscribe((s) => {
    const settings = useSettings.getState();
    if (!settings.performance.autoQuality || s.fps === null || document.visibilityState !== 'visible') {
      lowSince = null;
      return;
    }
    const now = performance.now();
    if (now < cooldownUntil) return;
    if (s.fps >= LOW_FPS) {
      lowSince = null;
      return;
    }
    lowSince ??= now;
    if (now - lowSince < SUSTAIN_MS) return;
    const next = NEXT[settings.performance.quality];
    lowSince = null;
    cooldownUntil = now + 10_000;
    if (!next) return;
    settings.update('performance', { quality: next });
    notify(`Rendering was below ${LOW_FPS} FPS — quality lowered to ${next}. Change it in Settings › Performance.`, 'warning', 5000);
  });
}
