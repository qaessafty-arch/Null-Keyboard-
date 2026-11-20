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
  laser: { primary: hex('#FF365D'), secondary: hex('#FF7A93') },
  holo: { primary: hex('#32E6A0'), secondary: hex('#8AF5CB') },
};

export const THEME_NAMES: Record<ThemeId, string> = {
  laser: 'Laser',
  holo: 'Signal',
};
