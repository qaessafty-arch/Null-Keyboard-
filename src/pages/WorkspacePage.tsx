import { useEffect } from 'react';
import { VirtualKeyboard } from '@/components/keyboard/VirtualKeyboard';
import { TextOutputPanel } from '@/components/dashboard/TextOutputPanel';
import { AirModePanel } from '@/components/dashboard/AirModePanel';
import { ModifierReadout } from '@/components/dashboard/ModifierReadout';
import { Segmented } from '@/components/common/Controls';
import { useAppStore } from '@/stores/appStore';
import { keyboardEngine } from '@/engine/input/keyboard';
import type { InputMode } from '@/stores/settingsStore';
import { navigate } from '@/app/Router';
import { useAirMode } from '@/hooks/useAirMode';

export function WorkspacePage({ forceMode }: { forceMode?: InputMode }) {
  const mode = useAppStore((s) => s.mode);
  const setMode = useAppStore((s) => s.setMode);
  useAirMode(mode === 'air');

  useEffect(() => {
    if (forceMode && forceMode !== useAppStore.getState().mode) setMode(forceMode);
  }, [forceMode, setMode]);

  const switchMode = (m: InputMode) => {
    // Never carry a held key across a mode switch. Text is untouched.
    keyboardEngine.releaseAll('reset');
    setMode(m);
    navigate(`/${m}`);
  };

  return (
    <div className={`workspace workspace--${mode}`}>
      <div className="workspace__head">
        <Segmented<InputMode>
          label="Input mode"
          size="l"
          value={mode}
          onChange={switchMode}
          options={[
            { value: 'touch', label: 'Touch Mode', icon: 'hand' },
            { value: 'air', label: 'Air Mode', icon: 'camera' },
          ]}
        />
        <ModifierReadout />
      </div>

      <div className="workspace__top">
        <TextOutputPanel />
        {mode === 'air' && <AirModePanel />}
      </div>

      <div className="workspace__keyboard">
        <VirtualKeyboard interactive showAirTips={mode === 'air'} />
      </div>
    </div>
  );
}
