import { useEffect } from 'react';
import { VirtualKeyboard } from '@/components/keyboard/VirtualKeyboard';
import { TextOutputPanel } from '@/components/dashboard/TextOutputPanel';
import { AirModePanel } from '@/components/dashboard/AirModePanel';
import { ModifierReadout } from '@/components/dashboard/ModifierReadout';
import { Segmented } from '@/components/common/Controls';
import { useAppStore } from '@/stores/appStore';
import type { InputMode } from '@/stores/settingsStore';
import { switchInputMode } from '@/app/actions';
import { useAirMode } from '@/hooks/useAirMode';
import { InteractionStatus } from '@/components/dashboard/InteractionStatus';

export function WorkspacePage({ forceMode }: { forceMode?: InputMode }) {
  const mode = useAppStore((s) => s.mode);
  const setMode = useAppStore((s) => s.setMode);
  useAirMode(mode === 'air');

  useEffect(() => {
    if (forceMode && forceMode !== useAppStore.getState().mode) setMode(forceMode);
  }, [forceMode, setMode]);

  const switchMode = (m: InputMode) => switchInputMode(m);

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
        <InteractionStatus />
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
