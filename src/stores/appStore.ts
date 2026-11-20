import { create } from 'zustand';
import type { InputSource } from '@/types/keyboard';
import { useSettings, type InputMode } from './settingsStore';

interface AppState {
  mode: InputMode;
  /** Last source that produced a key press (null until the first press). */
  lastSource: InputSource | null;
  lastSourceAt: number;
  setMode: (mode: InputMode) => void;
  noteSource: (source: InputSource, at: number) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  mode: useSettings.getState().general.defaultMode,
  lastSource: null,
  lastSourceAt: 0,
  setMode: (mode) => set({ mode }),
  noteSource: (source, at) => {
    if (get().lastSource !== source) set({ lastSource: source, lastSourceAt: at });
    else set({ lastSourceAt: at });
  },
}));
