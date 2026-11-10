// In-memory diagnostics ring buffer: every gaze frame plus wink/click events,
// kept for the last ~10 seconds. Dumped as JSON to the clipboard for tuning.

export interface DiagFrame {
  t: number;
  x: number | null;
  y: number | null;
  bl: number;
  br: number;
  face: boolean;
  frozen: boolean;
  /** Set on frames where something fired: 'wink:left', 'blink:right', … */
  ev?: string;
}

const WINDOW_MS = 10_000;

export class DiagBuffer {
  private frames: DiagFrame[] = [];

  push(frame: DiagFrame): void {
    this.frames.push(frame);
    const cutoff = frame.t - WINDOW_MS;
    while (this.frames.length && this.frames[0].t < cutoff) this.frames.shift();
  }

  markEvent(ev: string): void {
    const last = this.frames[this.frames.length - 1];
    if (last) last.ev = last.ev ? `${last.ev},${ev}` : ev;
  }

  dump(meta: Record<string, unknown>): string {
    return JSON.stringify({ meta, windowMs: WINDOW_MS, frames: this.frames });
  }
}
