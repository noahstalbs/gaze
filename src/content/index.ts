// Gaze content script: renders the gaze overlay and (in later milestones)
// performs clicks, scrolling, and text insertion. Runs in the top frame of
// http(s) pages, and is also included directly by the bundled demo page.
import { GAZE_PORT, type ContentMsg } from '../shared/messages';

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

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== GAZE_PORT) return;
  port.onMessage.addListener((raw: ContentMsg) => {
    if (raw.type === 'GAZE_FRAME') onGazeFrame(raw);
  });
});

// Kept for simple liveness checks from the panel.
chrome.runtime.onMessage.addListener((msg: unknown, _sender, sendResponse) => {
  const m = msg as { type?: string };
  if (m?.type === 'GAZE_PING') {
    sendResponse({ ok: true });
  }
  return false;
});
