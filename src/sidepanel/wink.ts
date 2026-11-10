// Click-trigger detection from eyeBlinkLeft/Right blendshapes.
//
// Wink mode: one eye above the threshold while the other stays low,
// sustained for winkHoldMs. Both eyes crossing together is a normal blink
// and is suppressed.
//
// Blink fallback mode (for people who can't wink independently):
// long blink (>500ms, both eyes) fires 'left' on release; two short blinks
// in quick succession fire 'right'.
//
// Both modes share a refractory period after firing.

export interface WinkParams {
  threshold: number;
  holdMs: number;
  refractoryMs: number;
}

const OTHER_EYE_MAX = 0.2;
const LONG_BLINK_MS = 500;
const DOUBLE_BLINK_MAX_MS = 400;
const DOUBLE_BLINK_GAP_MS = 600;

export type WinkEvent = 'left' | 'right' | null;

export class WinkDetector {
  private candidate: { side: 'left' | 'right'; since: number } | null = null;
  private refractoryUntil = 0;

  update(blinkL: number, blinkR: number, now: number, p: WinkParams): WinkEvent {
    if (now < this.refractoryUntil) {
      this.candidate = null;
      return null;
    }
    const leftWinking = blinkL >= p.threshold && blinkR <= OTHER_EYE_MAX;
    const rightWinking = blinkR >= p.threshold && blinkL <= OTHER_EYE_MAX;
    const bothClosed = blinkL >= p.threshold && blinkR >= p.threshold;

    if (bothClosed || (!leftWinking && !rightWinking)) {
      this.candidate = null;
      return null;
    }
    const side = leftWinking ? 'left' : 'right';
    if (this.candidate?.side !== side) {
      this.candidate = { side, since: now };
      return null;
    }
    if (now - this.candidate.since >= p.holdMs) {
      this.candidate = null;
      this.refractoryUntil = now + p.refractoryMs;
      return side;
    }
    return null;
  }

  reset(): void {
    this.candidate = null;
  }
}

export class BlinkFallbackDetector {
  private closedSince: number | null = null;
  private lastShortBlinkEnd = -Infinity;
  private refractoryUntil = 0;

  update(blinkL: number, blinkR: number, now: number, p: WinkParams): WinkEvent {
    if (now < this.refractoryUntil) {
      this.closedSince = null;
      return null;
    }
    const closed = blinkL >= p.threshold && blinkR >= p.threshold;
    if (closed) {
      this.closedSince ??= now;
      return null;
    }
    if (this.closedSince === null) return null;

    const duration = now - this.closedSince;
    this.closedSince = null;
    if (duration >= LONG_BLINK_MS) {
      this.refractoryUntil = now + p.refractoryMs;
      return 'left';
    }
    if (duration <= DOUBLE_BLINK_MAX_MS) {
      if (now - this.lastShortBlinkEnd <= DOUBLE_BLINK_GAP_MS) {
        this.lastShortBlinkEnd = -Infinity;
        this.refractoryUntil = now + p.refractoryMs;
        return 'right';
      }
      this.lastShortBlinkEnd = now;
    }
    return null;
  }

  reset(): void {
    this.closedSince = null;
  }
}
