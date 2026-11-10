// One-euro filter (Casiez et al. 2012): low-pass with a cutoff that rises
// with speed — stable when the gaze dwells, responsive when it jumps.

class LowPassFilter {
  private y: number | null = null;

  get last(): number | null {
    return this.y;
  }

  filter(x: number, alpha: number): number {
    this.y = this.y === null ? x : this.y + alpha * (x - this.y);
    return this.y;
  }

  reset(): void {
    this.y = null;
  }
}

export class OneEuroFilter {
  private xf = new LowPassFilter();
  private dxf = new LowPassFilter();
  private lastT: number | null = null;

  constructor(
    public minCutoff = 1.0,
    public beta = 0.3,
    public dCutoff = 1.0,
  ) {}

  private alpha(cutoff: number, dt: number): number {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  filter(x: number, tSec: number): number {
    if (this.lastT === null || tSec <= this.lastT) {
      this.lastT = tSec;
      this.dxf.reset();
      return this.xf.filter(x, 1);
    }
    const dt = tSec - this.lastT;
    this.lastT = tSec;

    const prev = this.xf.last;
    const dx = prev === null ? 0 : (x - prev) / dt;
    const edx = this.dxf.filter(dx, this.alpha(this.dCutoff, dt));
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    return this.xf.filter(x, this.alpha(cutoff, dt));
  }

  reset(): void {
    this.xf.reset();
    this.dxf.reset();
    this.lastT = null;
  }
}
