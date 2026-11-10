// Gaze content script: renders the gaze overlay, runs the calibration
// overlay, and (in later milestones) performs clicks, scrolling, and text
// insertion. Runs in the top frame of http(s) pages, and is also included
// directly by the bundled demo page.
import {
  GAZE_PORT,
  type CalSample,
  type ContentMsg,
  type GazeFrameMsg,
} from '../shared/messages';

const DOT_SIZE = 20;

let dot: HTMLDivElement | null = null;
let hideTimer: number | undefined;

function ensureDot(): HTMLDivElement {
  if (dot && dot.isConnected) return dot;
  dot = document.createElement('div');
  dot.id = 'gaze-dot';
  Object.assign(dot.style, {
    position: 'fixed',
    left: '0',
    top: '0',
    width: `${DOT_SIZE}px`,
    height: `${DOT_SIZE}px`,
    borderRadius: '50%',
    background: 'rgba(0, 229, 160, 0.35)',
    border: '2px solid rgba(0, 229, 160, 0.9)',
    boxShadow: '0 0 8px rgba(0, 229, 160, 0.6)',
    pointerEvents: 'none',
    zIndex: '2147483647',
    opacity: '0',
    transition: 'opacity 0.15s',
    willChange: 'transform',
  } satisfies Partial<CSSStyleDeclaration>);
  document.documentElement.appendChild(dot);
  return dot;
}

function onGazeFrame(msg: { x: number; y: number; hasFace: boolean }): void {
  const d = ensureDot();
  const px = msg.x * window.innerWidth - DOT_SIZE / 2;
  const py = msg.y * window.innerHeight - DOT_SIZE / 2;
  d.style.transform = `translate3d(${px.toFixed(1)}px, ${py.toFixed(1)}px, 0)`;
  d.style.opacity = msg.hasFace ? '1' : '0';

  // Hide if frames stop arriving (panel closed, tab switched away).
  clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => {
    if (dot) dot.style.opacity = '0';
  }, 400);
}

// ---------------------------------------------------------------------------
// Calibration overlay: 9 points in sequence; at each point, after a settle
// delay, collect the feature vectors streaming in from the side panel and
// pair them with the point's screen position.

const CAL_POINTS: Array<[number, number]> = [
  [0.08, 0.08], [0.5, 0.08], [0.92, 0.08],
  [0.08, 0.5],  [0.5, 0.5],  [0.92, 0.5],
  [0.08, 0.92], [0.5, 0.92], [0.92, 0.92],
];
const CAL_SETTLE_MS = 700;
const CAL_SAMPLES_PER_POINT = 30;

let calibration: { onFrame: (msg: GazeFrameMsg) => void; cancel: () => void } | null = null;

function runCalibration(): void {
  calibration?.cancel();

  const backdrop = document.createElement('div');
  Object.assign(backdrop.style, {
    position: 'fixed',
    inset: '0',
    background: 'rgba(10, 12, 15, 0.92)',
    zIndex: '2147483647',
    cursor: 'none',
  } satisfies Partial<CSSStyleDeclaration>);

  const label = document.createElement('div');
  Object.assign(label.style, {
    position: 'absolute',
    top: '40%',
    width: '100%',
    textAlign: 'center',
    color: '#9aa0a6',
    font: '16px system-ui, sans-serif',
  } satisfies Partial<CSSStyleDeclaration>);
  label.textContent = 'Follow the dot with your eyes. Esc cancels.';

  const point = document.createElement('div');
  const SIZE = 30;
  Object.assign(point.style, {
    position: 'absolute',
    width: `${SIZE}px`,
    height: `${SIZE}px`,
    borderRadius: '50%',
    border: '3px solid #00e5a0',
    boxSizing: 'border-box',
    transition: 'left 0.3s, top 0.3s',
  } satisfies Partial<CSSStyleDeclaration>);
  const fill = document.createElement('div');
  Object.assign(fill.style, {
    position: 'absolute',
    inset: '3px',
    borderRadius: '50%',
    background: '#00e5a0',
    transform: 'scale(0)',
    transition: 'transform 0.1s',
  } satisfies Partial<CSSStyleDeclaration>);
  point.appendChild(fill);
  backdrop.appendChild(label);
  backdrop.appendChild(point);
  document.documentElement.appendChild(backdrop);

  const samples: CalSample[] = [];
  let idx = -1;
  let shownAt = 0;
  let collected = 0;

  const showPoint = (i: number) => {
    idx = i;
    collected = 0;
    shownAt = performance.now();
    const [nx, ny] = CAL_POINTS[i];
    point.style.left = `${nx * window.innerWidth - SIZE / 2}px`;
    point.style.top = `${ny * window.innerHeight - SIZE / 2}px`;
    fill.style.transform = 'scale(0)';
    label.textContent = `Follow the dot with your eyes (${i + 1}/${CAL_POINTS.length}). Esc cancels.`;
  };

  const cleanup = () => {
    backdrop.remove();
    document.removeEventListener('keydown', onKey, true);
    calibration = null;
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    cleanup();
    void chrome.runtime.sendMessage({ type: 'CAL_CANCEL' });
  };
  document.addEventListener('keydown', onKey, true);

  calibration = {
    onFrame: (msg) => {
      if (idx < 0 || !msg.hasFace || !msg.feat) return;
      if (performance.now() - shownAt < CAL_SETTLE_MS) return;
      const [nx, ny] = CAL_POINTS[idx];
      samples.push({ f: msg.feat, x: nx, y: ny });
      collected += 1;
      fill.style.transform = `scale(${(collected / CAL_SAMPLES_PER_POINT).toFixed(2)})`;
      if (collected >= CAL_SAMPLES_PER_POINT) {
        if (idx + 1 < CAL_POINTS.length) {
          showPoint(idx + 1);
        } else {
          cleanup();
          void chrome.runtime.sendMessage({ type: 'CAL_RESULT', samples });
        }
      }
    },
    cancel: cleanup,
  };
  showPoint(0);
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== GAZE_PORT) return;
  port.onMessage.addListener((raw: ContentMsg) => {
    if (raw.type === 'GAZE_FRAME') {
      if (calibration) {
        calibration.onFrame(raw);
        if (dot) dot.style.opacity = '0';
      } else {
        onGazeFrame(raw);
      }
    }
  });
});

chrome.runtime.onMessage.addListener((msg: unknown, _sender, sendResponse) => {
  const m = msg as { type?: string };
  if (m?.type === 'GAZE_PING') {
    sendResponse({ ok: true });
  } else if (m?.type === 'CAL_START') {
    runCalibration();
    sendResponse({ ok: true });
  }
  return false;
});
