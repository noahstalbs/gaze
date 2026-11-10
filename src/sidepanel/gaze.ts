import type { FaceLandmarkerResult } from '@mediapipe/tasks-vision';

// Mesh topology (fixed indices in the 478-point face mesh):
// "right"/"left" follow MediaPipe's naming (the face's anatomical sides).
// Which one is the user's mirrored left/right gets verified in the wink
// milestone — for gaze features we average both eyes, so it doesn't matter.
const RIGHT_EYE = { outer: 33, inner: 133, iris: 468 };
const LEFT_EYE = { inner: 362, outer: 263, iris: 473 };

export interface GazeFeatures {
  /** Mean iris offset from the eye-corner midpoint, in eye-width units. */
  eyeX: number;
  eyeY: number;
  /** Head rotation (radians) from the facial transformation matrix. */
  yaw: number;
  pitch: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function extractFeatures(result: FaceLandmarkerResult): GazeFeatures | null {
  const lm = result.faceLandmarks[0];
  if (!lm) return null;

  const eyeOffset = (outer: number, inner: number, iris: number) => {
    const o = lm[outer];
    const i = lm[inner];
    const c = lm[iris];
    const w = Math.hypot(i.x - o.x, i.y - o.y);
    if (w < 1e-6) return null;
    return {
      x: (c.x - (o.x + i.x) / 2) / w,
      y: (c.y - (o.y + i.y) / 2) / w,
    };
  };

  const r = eyeOffset(RIGHT_EYE.outer, RIGHT_EYE.inner, RIGHT_EYE.iris);
  const l = eyeOffset(LEFT_EYE.outer, LEFT_EYE.inner, LEFT_EYE.iris);
  if (!r || !l) return null;

  // 4x4 column-major transform; angle conventions don't matter much here —
  // calibration (milestone 3) learns the mapping, and the raw estimate only
  // needs rough proportionality.
  let yaw = 0;
  let pitch = 0;
  const m = result.facialTransformationMatrixes[0]?.data;
  if (m) {
    yaw = Math.atan2(m[8], m[10]);
    pitch = Math.asin(clamp(-m[9], -1, 1));
  }

  return { eyeX: (r.x + l.x) / 2, eyeY: (r.y + l.y) / 2, yaw, pitch };
}

// Uncalibrated screen mapping. The camera image is not mirrored, so when the
// user looks to their right the iris moves toward image-left (negative x) —
// hence the minus sign. Gains are eyeballed; calibration replaces all of this.
const GAIN_EYE_X = 4;
const GAIN_EYE_Y = 6;
const GAIN_HEAD_X = 0.6;
const GAIN_HEAD_Y = 0.6;

export function rawGazePoint(f: GazeFeatures): { x: number; y: number } {
  return {
    x: clamp(0.5 - (GAIN_EYE_X * f.eyeX + GAIN_HEAD_X * f.yaw), 0, 1),
    y: clamp(0.5 + (GAIN_EYE_Y * f.eyeY + GAIN_HEAD_Y * f.pitch), 0, 1),
  };
}
