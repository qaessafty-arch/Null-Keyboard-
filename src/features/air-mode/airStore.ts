import { create } from 'zustand';
import type { PressMethod } from '@/features/gesture-recognition/PressDetector';

/** Air Mode summary for the UI (updated on events, not per frame). */
interface AirState {
  active: boolean;
  method: PressMethod | null;
  /** Last recognized gesture, for the on-screen readout. */
  gesture: { text: string; at: number } | null;
  presses: number;
}

export const useAirStore = create<AirState>(() => ({ active: false, method: null, gesture: null, presses: 0 }));

export interface AirTip {
  id: string;
  label: 'Left' | 'Right';
  finger: string;
  /** Keyboard-plane coordinates (0..1). */
  u: number;
  v: number;
  pressing: boolean;
  /** Dwell progress 0..1 (dwell method). */
  dwell: number;
}

type TipListener = (tips: AirTip[]) => void;
const tipListeners = new Set<TipListener>();

/** Fingertip positions on the keyboard plane, per tracking frame (canvas overlays subscribe). */
export const airTips = {
  emit(tips: AirTip[]) {
    for (const l of tipListeners) l(tips);
  },
  subscribe(l: TipListener) {
    tipListeners.add(l);
    return () => tipListeners.delete(l);
  },
};
