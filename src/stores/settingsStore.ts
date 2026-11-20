import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type ThemeId = 'laser' | 'holo';
export type InputMode = 'touch' | 'air';
export type QualityMode = 'high' | 'balanced' | 'low';
export type CameraResolution = '480p' | '720p' | '1080p';
export type Orientation = 'auto' | 'landscape' | 'portrait';

export interface Settings {
  general: {
    defaultMode: InputMode;
    theme: ThemeId;
    layout: string;
    language: 'en';
    sound: boolean;
  };
  air: {
    cameraFacing: 'environment' | 'user';
    /** 0–100: how small a movement counts. Used by the press detector (Stage 5). */
    sensitivity: number;
    /** 0.1–1.0: normalized downward travel needed to register a press. */
    activationThreshold: number;
    debounceMs: number;
    /** 0–1: minimum hand-detection confidence. */
    minConfidence: number;
    mirrored: boolean;
  };
  touch: {
    /** Multiplier on the responsive key size. */
    keySize: number;
    /** Gap between keys in px. */
    keySpacing: number;
    /** 0.3–1 opacity of key surfaces. */
    keyOpacity: number;
    visualFeedback: boolean;
    soundFeedback: boolean;
    longPressRepeat: boolean;
    orientation: Orientation;
  };
  performance: {
    quality: QualityMode;
    /** 0–100 scales glow and WebGL effect intensity. */
    effects: number;
    /** Hand detection frequency target in Hz (Stage 4). */
    trackingHz: 15 | 24 | 30;
    cameraResolution: CameraResolution;
  };
}

export const DEFAULT_SETTINGS: Settings = {
  general: { defaultMode: 'touch', theme: 'laser', layout: 'qwerty-us', language: 'en', sound: true },
  air: {
    cameraFacing: 'environment',
    sensitivity: 50,
    activationThreshold: 0.35,
    debounceMs: 120,
    minConfidence: 0.6,
    mirrored: false,
  },
  touch: {
    keySize: 1,
    keySpacing: 6,
    keyOpacity: 0.85,
    visualFeedback: true,
    soundFeedback: true,
    longPressRepeat: true,
    orientation: 'auto',
  },
  performance: { quality: 'balanced', effects: 70, trackingHz: 30, cameraResolution: '720p' },
};

type Section = keyof Settings;

interface SettingsStore extends Settings {
  update: <S extends Section>(section: S, patch: Partial<Settings[S]>) => void;
  reset: () => void;
}

const SETTINGS_KEY = 'neo-type:settings';
const SETTINGS_VERSION = 1;

/** Deep-merge persisted data over defaults so new fields get default values. */
function mergeSettings(persisted: unknown): Settings {
  const p = (persisted && typeof persisted === 'object' ? persisted : {}) as Partial<Record<Section, object>>;
  return {
    general: { ...DEFAULT_SETTINGS.general, ...(p.general ?? {}) },
    air: { ...DEFAULT_SETTINGS.air, ...(p.air ?? {}) },
    touch: { ...DEFAULT_SETTINGS.touch, ...(p.touch ?? {}) },
    performance: { ...DEFAULT_SETTINGS.performance, ...(p.performance ?? {}) },
  };
}

export const useSettings = create<SettingsStore>()(
  persist(
    (set, get) => ({
      ...DEFAULT_SETTINGS,
      update: (section, patch) => set({ [section]: { ...get()[section], ...patch } } as Partial<SettingsStore>),
      reset: () => set({ ...DEFAULT_SETTINGS }),
    }),
    {
      name: SETTINGS_KEY,
      version: SETTINGS_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ general, air, touch, performance }) => ({ general, air, touch, performance }),
      merge: (persisted, current) => ({ ...current, ...mergeSettings(persisted) }),
    },
  ),
);
