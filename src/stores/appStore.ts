import { create } from 'zustand';
import type { InputSource } from '@/types/keyboard';
import { useSettings, type InputMode } from './settingsStore';

export type CameraLinkState =
  | 'idle'
  | 'waiting'
  | 'connecting'
  | 'permission-required'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'unavailable';

interface AppState {
  mode: InputMode;
  /** Last source that produced a key press (null until the first press). */
  lastSource: InputSource | null;
  lastSourceAt: number;
  /**
   * Real phone-camera link state. Stays 'idle' until the WebRTC pipeline
   * (Stage 3) drives it — nothing in the app sets it to 'connected' otherwise.
   */
  cameraLink: CameraLinkState;
  /** Whether a calibration profile exists (Stage 5). */
  calibrated: boolean;
  setMode: (mode: InputMode) => void;
  noteSource: (source: InputSource, at: number) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  mode: useSettings.getState().general.defaultMode,
  lastSource: null,
  lastSourceAt: 0,
  cameraLink: 'idle',
  calibrated: false,
  setMode: (mode) => set({ mode }),
  noteSource: (source, at) => {
    if (get().lastSource !== source) set({ lastSource: source, lastSourceAt: at });
    else set({ lastSourceAt: at });
  },
}));
