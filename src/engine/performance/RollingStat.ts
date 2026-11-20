/** Fixed-size ring buffer of samples with cheap summary stats. */
export class RollingStat {
  private buf: Float64Array;
  private i = 0;
  private n = 0;
  private total = 0;

  constructor(readonly capacity = 120) {
    this.buf = new Float64Array(capacity);
  }

  record(value: number): void {
    if (!Number.isFinite(value) || value < 0) return;
    this.buf[this.i] = value;
    this.i = (this.i + 1) % this.capacity;
    this.n = Math.min(this.n + 1, this.capacity);
    this.total++;
  }

  get count(): number {
    return this.n;
  }

  /** Total samples ever recorded. */
  get recorded(): number {
    return this.total;
  }

  get last(): number | null {
    if (this.n === 0) return null;
    return this.buf[(this.i - 1 + this.capacity) % this.capacity] ?? null;
  }

  mean(): number | null {
    if (this.n === 0) return null;
    let s = 0;
    for (let k = 0; k < this.n; k++) s += this.buf[k] ?? 0;
    return s / this.n;
  }

  percentile(p: number): number | null {
    if (this.n === 0) return null;
    const sorted = Array.from(this.buf.subarray(0, this.n)).sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
    return sorted[idx] ?? null;
  }

  /** Samples in chronological order (oldest first). */
  values(): number[] {
    const out: number[] = new Array(this.n);
    for (let k = 0; k < this.n; k++) {
      out[k] = this.buf[(this.i - this.n + k + this.capacity) % this.capacity] ?? 0;
    }
    return out;
  }

  reset(): void {
    this.i = this.n = 0;
  }
}
