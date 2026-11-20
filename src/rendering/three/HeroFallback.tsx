import { QWERTY_US } from '@/features/keyboard-engine/layouts/qwerty';

/** Static SVG outline used in LOW quality or without WebGL. */
export function HeroFallback() {
  const layout = QWERTY_US;
  const u = 40;
  const g = 5;
  return (
    <svg className="hero-fallback" viewBox={`0 0 ${layout.unitsWide * u} ${layout.rows.length * u}`}>
      {layout.rows.flatMap((row, r) => {
        let x = 0;
        return row.map((key) => {
          const rect = (
            <rect
              key={key.id}
              x={x * u + g / 2}
              y={r * u + g / 2}
              width={key.width * u - g}
              height={u - g}
              rx={6}
            />
          );
          x += key.width;
          return rect;
        });
      })}
    </svg>
  );
}
