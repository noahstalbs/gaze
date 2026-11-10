// Tuning constants, persisted to chrome.storage.local and exposed as sliders
// in the side panel. More land here as features arrive (wink thresholds,
// snap radius, dwell, scroll speed).

export interface Settings {
  /** One-euro min cutoff (Hz). Lower = smoother, laggier. */
  smoothMinCutoff: number;
  /** One-euro speed coefficient. Higher = snappier on fast moves. */
  smoothBeta: number;
}

export const DEFAULT_SETTINGS: Settings = {
  smoothMinCutoff: 1.0,
  smoothBeta: 0.3,
};

export async function loadSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...(stored.settings as Partial<Settings> | undefined) };
}

export function saveSettings(s: Settings): void {
  void chrome.storage.local.set({ settings: s });
}

export interface SliderSpec {
  key: keyof Settings;
  label: string;
  min: number;
  max: number;
  step: number;
}

export const SLIDERS: SliderSpec[] = [
  { key: 'smoothMinCutoff', label: 'Smoothing min-cutoff (Hz)', min: 0.05, max: 3, step: 0.05 },
  { key: 'smoothBeta', label: 'Smoothing beta', min: 0, max: 1, step: 0.01 },
];
