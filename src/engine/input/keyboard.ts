import { KeyboardEngine } from '@/features/keyboard-engine/KeyboardEngine';
import { QWERTY_US } from '@/features/keyboard-engine/layouts/qwerty';
import { keyToIntent } from '@/features/text-output/keyToIntent';
import { useTextStore } from '@/features/text-output/textStore';
import { useAppStore } from '@/stores/appStore';
import { useKeyState } from '@/stores/keyStateStore';
import { useSettings, type Settings } from '@/stores/settingsStore';
import { playClick } from '@/utils/sound';
import type { InputSource, KeyboardInputEvent } from '@/types/keyboard';

/** The single keyboard engine shared by Touch Mode and Air Mode. */
export const keyboardEngine = new KeyboardEngine({ layout: QWERTY_US });

const POINTER_SOURCES: InputSource[] = ['TOUCH', 'PEN', 'MOUSE'];

function applySettings(s: Settings) {
  keyboardEngine.setRepeat({ sources: s.touch.longPressRepeat ? POINTER_SOURCES : [] });
}

function soundFor(event: KeyboardInputEvent): void {
  const s = useSettings.getState();
  if (!s.general.sound) return;
  if (event.source !== 'AIR' && !s.touch.soundFeedback) return;
  const def = keyboardEngine.getKey(event.key);
  if (!def) return;
  if (event.action === 'KEY_DOWN' && (def.kind === 'modifier' || def.kind === 'toggle')) {
    playClick('mod');
  } else if (event.action === 'KEY_PRESS') {
    const kind = event.key === 'Space' ? 'space' : event.key === 'Enter' ? 'enter' : 'key';
    playClick(kind, event.metadata.repeat ? 0.08 : 0.18);
  }
}

/**
 * Connect engine output to every consumer. Returns a cleanup function.
 * Consumers never know which input mode produced an event.
 */
export function connectKeyboardConsumers(): () => void {
  const cleanups: Array<() => void> = [];

  cleanups.push(
    keyboardEngine.subscribeState((state) => {
      useKeyState.setState({ pressed: state.pressed, modifiers: state.modifiers, latched: state.latched });
    }),
  );

  cleanups.push(
    keyboardEngine.subscribe((event) => {
      if (event.action === 'KEY_PRESS') {
        useTextStore.getState().apply(keyToIntent(event), event.timestamp);
        useAppStore.getState().noteSource(event.source, event.timestamp);
      }
      soundFor(event);
    }),
  );

  applySettings(useSettings.getState());
  cleanups.push(useSettings.subscribe(applySettings));

  // Stuck-key protection: anything held when the window loses focus is released.
  const releaseAll = () => keyboardEngine.releaseAll('blur');
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') releaseAll();
  };
  window.addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', onVisibility);
  cleanups.push(() => {
    window.removeEventListener('blur', releaseAll);
    document.removeEventListener('visibilitychange', onVisibility);
  });

  return () => {
    for (const c of cleanups.reverse()) c();
  };
}
