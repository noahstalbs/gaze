// Tuning constants, persisted to chrome.storage.local and exposed as sliders
// in the side panel. More land here as features arrive (wink thresholds,
// snap radius, dwell, scroll speed).

export interface Settings {
  /** One-euro min cutoff (Hz). Lower = smoother, laggier. */
  smoothMinCutoff: number;
  /** One-euro speed coefficient. Higher = snappier on fast moves. */
  smoothBeta: number;
  /** Blendshape score the winking eye must exceed. */
  winkThreshold: number;
  /** How long a wink must be sustained before it fires (ms). */
  winkHoldMs: number;
  /** Dead time after a click fires (ms). */
  refractoryMs: number;
  /** Max distance from gaze point to an element to target it (px). */
  snapRadius: number;
  /** 'wink' = wink to click; 'blink' = long/double blink fallback. */
  clickMode: 'wink' | 'blink';
}

export const DEFAULT_SETTINGS: Settings = {
  smoothMinCutoff: 1.0,
  smoothBeta: 0.3,
  winkThreshold: 0.5,
  winkHoldMs: 150,
  refractoryMs: 600,
  snapRadius: 200,
  clickMode: 'wink',
};

export async function loadSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...(stored.settings as Partial<Settings> | undefined) };
}

export function saveSettings(s: Settings): void {
  void chrome.storage.local.set({ settings: s });
}

export type NumericSettingKey = {
  [K in keyof Settings]: Settings[K] extends number ? K : never;
}[keyof Settings];

export interface SliderSpec {
  key: NumericSettingKey;
  label: string;
  min: number;
  max: number;
  step: number;
}

export const SLIDERS: SliderSpec[] = [
  { key: 'smoothMinCutoff', label: 'Smoothing min-cutoff (Hz)', min: 0.05, max: 3, step: 0.05 },
  { key: 'smoothBeta', label: 'Smoothing beta', min: 0, max: 1, step: 0.01 },
  { key: 'winkThreshold', label: 'Wink threshold', min: 0.2, max: 0.9, step: 0.05 },
  { key: 'winkHoldMs', label: 'Wink hold (ms)', min: 50, max: 400, step: 10 },
  { key: 'refractoryMs', label: 'Refractory (ms)', min: 200, max: 1500, step: 50 },
  { key: 'snapRadius', label: 'Snap radius (px)', min: 50, max: 400, step: 10 },
];
