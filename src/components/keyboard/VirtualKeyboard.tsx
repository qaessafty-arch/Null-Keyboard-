import { lazy, Suspense, useRef, type CSSProperties } from 'react';
import { Key } from './Key';
import { AirFingertips } from './AirFingertips';

// Three.js is loaded on demand so the keyboard is interactive before WebGL arrives,
// and LOW quality never downloads it.
const LaserSurface = lazy(() => import('@/rendering/three/LaserSurface').then((m) => ({ default: m.LaserSurface })));
import { usePointerKeyboard } from '@/features/touch-mode/usePointerKeyboard';
import { keyboardEngine } from '@/engine/input/keyboard';
import { LAYOUTS, QWERTY_US } from '@/features/keyboard-engine/layouts/qwerty';
import { useSettings } from '@/stores/settingsStore';
import { QUALITY_PROFILES } from '@/engine/performance/quality';
import './keyboard.css';

interface Props {
  /** Accept pointer input (Touch Mode). Air Mode drives the same keys via the engine. */
  interactive?: boolean;
  /** Draw tracked fingertips over the keys (Air Mode). */
  showAirTips?: boolean;
}

export function VirtualKeyboard({ interactive = true, showAirTips = false }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const layoutId = useSettings((s) => s.general.layout);
  const touch = useSettings((s) => s.touch);
  const quality = useSettings((s) => s.performance.quality);
  const effects = useSettings((s) => s.performance.effects);
  const layout = LAYOUTS[layoutId] ?? QWERTY_US;

  usePointerKeyboard(ref, keyboardEngine, interactive);

  const style = {
    '--units': layout.unitsWide,
    '--key-scale': touch.keySize,
    '--key-gap': `${touch.keySpacing}px`,
    '--key-opacity': touch.keyOpacity,
    '--glow': (QUALITY_PROFILES[quality].glow * effects) / 100,
  } as CSSProperties;

  return (
    <div className="kb-wrap" data-orientation={touch.orientation}>
      <div
        ref={ref}
        className={`kb${touch.visualFeedback ? '' : ' kb--no-feedback'}${interactive ? '' : ' kb--passive'}`}
        style={style}
        role="group"
        aria-label={`Virtual keyboard, ${layout.name}`}
        data-testid="virtual-keyboard"
      >
        {QUALITY_PROFILES[quality].webgl ? (
          <Suspense fallback={<div className="laser-surface" data-gl="off" aria-hidden="true" />}>
            <LaserSurface />
          </Suspense>
        ) : (
          <div className="laser-surface" data-gl="off" aria-hidden="true" />
        )}
        <div className="kb__rows">
          {layout.rows.map((row, i) => (
            <div className="kb__row" key={i}>
              {row.map((def) => (
                <Key key={def.id} def={def} />
              ))}
            </div>
          ))}
          {showAirTips && <AirFingertips />}
        </div>
      </div>
    </div>
  );
}
