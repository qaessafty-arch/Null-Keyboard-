import type { KeyId, KeyboardLayout } from '@/types/keyboard';

/** A key's rectangle on the keyboard plane, normalized to [0,1]×[0,1]. */
export interface KeyRect {
  id: KeyId;
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
}

export class KeyGeometry {
  readonly rects: KeyRect[];
  private readonly rows: KeyRect[][];

  constructor(layout: KeyboardLayout) {
    const nRows = layout.rows.length;
    this.rows = layout.rows.map((row, r) => {
      let x = 0;
      return row.map((k) => {
        const rect: KeyRect = {
          id: k.id,
          x: x / layout.unitsWide,
          y: r / nRows,
          w: k.width / layout.unitsWide,
          h: 1 / nRows,
          cx: (x + k.width / 2) / layout.unitsWide,
          cy: (r + 0.5) / nRows,
        };
        x += k.width;
        return rect;
      });
    });
    this.rects = this.rows.flat();
  }

  /**
   * Key under a point on the keyboard plane. Points slightly outside the
   * keyboard (within `margin`, in normalized units) snap to the nearest edge
   * key; anything further out is "off keyboard".
   */
  hitTest(u: number, v: number, margin = 0.04): KeyRect | null {
    if (u < -margin || u > 1 + margin || v < -margin * 2 || v > 1 + margin * 2) return null;
    const uc = Math.min(0.99999, Math.max(0, u));
    const vc = Math.min(0.99999, Math.max(0, v));
    const row = this.rows[Math.floor(vc * this.rows.length)];
    if (!row) return null;
    for (const k of row) if (uc >= k.x && uc < k.x + k.w) return k;
    return row[row.length - 1] ?? null;
  }

  get(id: KeyId): KeyRect | undefined {
    return this.rects.find((r) => r.id === id);
  }
}
