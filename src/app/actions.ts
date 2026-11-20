import { navigate } from './Router';
import { keyboardEngine } from '@/engine/input/keyboard';
import { useAppStore } from '@/stores/appStore';
import type { InputMode } from '@/stores/settingsStore';

/** Switch Touch ⇄ Air from anywhere. Releases held keys; text is untouched. */
export function switchInputMode(mode: InputMode, go = true): void {
  keyboardEngine.releaseAll('reset');
  useAppStore.getState().setMode(mode);
  if (go) navigate(`/${mode}`);
}
