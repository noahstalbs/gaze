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
}

export type ContentMsg = GazeFrameMsg;
