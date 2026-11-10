// Messages flowing side panel -> content script over a long-lived port.
// Coordinates are normalized to the viewport (0..1) so the content script
// owns the conversion to pixels.

export const GAZE_PORT = 'gaze';

export interface GazeFrameMsg {
  type: 'GAZE_FRAME';
  /** 0..1 across the viewport width. */
  x: number;
  /** 0..1 across the viewport height. */
  y: number;
  hasFace: boolean;
  /** performance.now() in the side panel when the frame was processed. */
  t: number;
  /** Raw feature vector; only attached while calibration is running. */
  feat?: number[];
  /** Snap radius in px; piggybacked so the content script needs no settings sync. */
  snap: number;
  /** True while the estimate is held still because an eye is closing. */
  frozen: boolean;
}

export interface WinkMsg {
  type: 'WINK';
  /** User's physical side; left = primary click, right = context menu. */
  side: 'left' | 'right';
}

export type ContentMsg = GazeFrameMsg | WinkMsg;

// Control messages sent panel -> content via chrome.tabs.sendMessage.
export interface CalStartMsg {
  type: 'CAL_START';
}

// Results sent content -> panel via chrome.runtime.sendMessage.
export interface CalSample {
  f: number[];
  /** Normalized viewport position of the calibration point. */
  x: number;
  y: number;
}

export interface CalResultMsg {
  type: 'CAL_RESULT';
  samples: CalSample[];
}

export interface CalCancelMsg {
  type: 'CAL_CANCEL';
}
