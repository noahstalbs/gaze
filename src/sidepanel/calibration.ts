import type { CalSample } from '../shared/messages';
import type { GazeFeatures } from './gaze';

// Ridge regression from gaze features to normalized screen coordinates.
// Features are standardized before fitting (eye offsets are ~±0.1 while head
// angles are ~±0.5 rad; ridge would otherwise penalize them unevenly).

export function featureVector(f: GazeFeatures): number[] {
  const { eyeX, eyeY, yaw, pitch } = f;
  // Quadratic and interaction terms let the fit bend near screen edges.
  return [eyeX, eyeY, yaw, pitch, eyeX * eyeX, eyeY * eyeY, eyeX * yaw, eyeY * pitch];
}

export interface Calibration {
  mean: number[];
  std: number[];
  /** Weights for screen x/y; index 0 is the bias term. */
  wx: number[];
  wy: number[];
  createdAt: number;
}

const RIDGE_LAMBDA = 1e-3;
const MIN_SAMPLES = 60;

/** Solve A w = b for symmetric positive-definite A via Gaussian elimination. */
function solve(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    if (Math.abs(M[pivot][col]) < 1e-12) return null;
    [M[col], M[pivot]] = [M[pivot], M[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const k = M[r][col] / M[col][col];
      for (let c = col; c <= n; c++) M[r][c] -= k * M[col][c];
    }
  }
  return M.map((row, i) => row[n] / M[i][i]);
}

/**
 * Per-point outlier rejection: drop the TRIM_FRACTION of samples furthest
 * from their calibration point's centroid in standardized feature space.
 * Catches frames where the eye was still mid-saccade or mid-blink.
 */
const TRIM_FRACTION = 0.2;

function trimOutliers(samples: CalSample[], mean: number[], std: number[]): CalSample[] {
  const d = mean.length;
  const groups = new Map<string, CalSample[]>();
  for (const s of samples) {
    const key = `${s.x},${s.y}`;
    groups.get(key)?.push(s) ?? groups.set(key, [s]);
  }
  const kept: CalSample[] = [];
  for (const group of groups.values()) {
    const centroid = new Array<number>(d).fill(0);
    for (const s of group) {
      for (let j = 0; j < d; j++) centroid[j] += (s.f[j] - mean[j]) / std[j] / group.length;
    }
    const scored = group.map((s) => {
      let dist = 0;
      for (let j = 0; j < d; j++) dist += ((s.f[j] - mean[j]) / std[j] - centroid[j]) ** 2;
      return { s, dist };
    });
    scored.sort((a, b) => a.dist - b.dist);
    kept.push(...scored.slice(0, Math.max(1, Math.ceil(group.length * (1 - TRIM_FRACTION)))).map((e) => e.s));
  }
  return kept;
}

export function fitCalibration(allSamples: CalSample[]): Calibration | null {
  if (allSamples.length < MIN_SAMPLES) return null;
  const d = allSamples[0].f.length;

  const mean = new Array<number>(d).fill(0);
  const std = new Array<number>(d).fill(0);
  for (const s of allSamples) for (let j = 0; j < d; j++) mean[j] += s.f[j] / allSamples.length;
  for (const s of allSamples)
    for (let j = 0; j < d; j++) std[j] += (s.f[j] - mean[j]) ** 2 / allSamples.length;
  for (let j = 0; j < d; j++) std[j] = Math.max(Math.sqrt(std[j]), 1e-6);

  const samples = trimOutliers(allSamples, mean, std);
  const n = samples.length;

  // Design matrix rows: [1, z1..zd] with standardized features.
  const dim = d + 1;
  const XtX = Array.from({ length: dim }, () => new Array<number>(dim).fill(0));
  const Xtx = new Array<number>(dim).fill(0);
  const Xty = new Array<number>(dim).fill(0);
  const row = new Array<number>(dim);
  for (const s of samples) {
    row[0] = 1;
    for (let j = 0; j < d; j++) row[j + 1] = (s.f[j] - mean[j]) / std[j];
    for (let a = 0; a < dim; a++) {
      for (let b = 0; b < dim; b++) XtX[a][b] += row[a] * row[b];
      Xtx[a] += row[a] * s.x;
      Xty[a] += row[a] * s.y;
    }
  }
  // Regularize everything except the bias.
  const lambda = RIDGE_LAMBDA * n;
  for (let j = 1; j < dim; j++) XtX[j][j] += lambda;

  const wx = solve(
    XtX.map((r) => [...r]),
    Xtx,
  );
  const wy = solve(XtX, Xty);
  if (!wx || !wy) return null;
  return { mean, std, wx, wy, createdAt: Date.now() };
}

export function applyCalibration(cal: Calibration, feat: number[]): { x: number; y: number } {
  let x = cal.wx[0];
  let y = cal.wy[0];
  for (let j = 0; j < feat.length; j++) {
    const z = (feat[j] - cal.mean[j]) / cal.std[j];
    x += cal.wx[j + 1] * z;
    y += cal.wy[j + 1] * z;
  }
  return { x, y };
}

/** Guards against stored calibrations from older feature-vector layouts. */
export function isUsableCalibration(cal: unknown, featLen: number): cal is Calibration {
  const c = cal as Calibration | null;
  return (
    !!c &&
    Array.isArray(c.mean) &&
    c.mean.length === featLen &&
    Array.isArray(c.wx) &&
    c.wx.length === featLen + 1 &&
    Array.isArray(c.wy) &&
    c.wy.length === featLen + 1
  );
}
