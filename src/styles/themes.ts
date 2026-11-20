import type { ThemeId } from '@/stores/settingsStore';

/** Colors the WebGL layers need (CSS gets the same values from tokens.css). */
export interface ThemeGl {
  primary: [number, number, number];
  secondary: [number, number, number];
}

const hex = (h: string): [number, number, number] => {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

export const THEME_GL: Record<ThemeId, ThemeGl> = {
  laser: { primary: hex('#FF174F'), secondary: hex('#FF3D81') },
  holo: { primary: hex('#00E5FF'), secondary: hex('#FF174F') },
};

export const THEME_NAMES: Record<ThemeId, string> = {
  laser: 'Laser',
  holo: 'Holo',
};
