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

export function fitCalibration(samples: CalSample[]): Calibration | null {
  if (samples.length < MIN_SAMPLES) return null;
  const n = samples.length;
  const d = samples[0].f.length;

  const mean = new Array<number>(d).fill(0);
  const std = new Array<number>(d).fill(0);
  for (const s of samples) for (let j = 0; j < d; j++) mean[j] += s.f[j] / n;
  for (const s of samples) for (let j = 0; j < d; j++) std[j] += (s.f[j] - mean[j]) ** 2 / n;
  for (let j = 0; j < d; j++) std[j] = Math.max(Math.sqrt(std[j]), 1e-6);

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
