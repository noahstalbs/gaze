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

function onGazeFrame(msg: GazeFrameMsg): void {
  const d = ensureDot();
  const px = msg.x * window.innerWidth;
  const py = msg.y * window.innerHeight;
  d.style.transform = `translate3d(${(px - DOT_SIZE / 2).toFixed(1)}px, ${(py - DOT_SIZE / 2).toFixed(1)}px, 0)`;
  d.style.opacity = msg.hasFace ? '1' : '0';
  d.style.borderColor = msg.frozen ? 'rgba(255, 204, 0, 0.9)' : 'rgba(0, 229, 160, 0.9)';

  if (msg.hasFace) {
    updateTarget(px, py, msg.snap);
  } else {
    setTarget(null);
  }

  // Hide if frames stop arriving (panel closed, tab switched away).
  clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => {
    if (dot) dot.style.opacity = '0';
    setTarget(null);
  }, 400);
}

// ---------------------------------------------------------------------------
// Interactive-element targeting: keep a registry of clickable elements,
// highlight the one nearest the gaze point, click it on wink.

const TARGET_SELECTOR =
  'a[href], button, input, select, textarea, [role="button"], [onclick], [tabindex]';

let targetEls: HTMLElement[] = [];
let needsQuery = true;
let needsRects = true;
let lastQueryAt = 0;
let rects: DOMRect[] = [];

const observer = new MutationObserver(() => {
  needsQuery = true;
});
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('scroll', () => (needsRects = true), { capture: true, passive: true });
window.addEventListener('resize', () => (needsRects = true), { passive: true });

function refreshTargets(now: number): void {
  if (needsQuery && now - lastQueryAt > 300) {
    lastQueryAt = now;
    needsQuery = false;
    targetEls = (Array.from(document.querySelectorAll(TARGET_SELECTOR)) as HTMLElement[]).filter(
      (el) => !(el as HTMLButtonElement).disabled && (el.checkVisibility?.() ?? true),
    );
    needsRects = true;
  }
  if (needsRects) {
    needsRects = false;
    rects = targetEls.map((el) => el.getBoundingClientRect());
  }
}

/** Distance from a point to a rect's edge; 0 when the point is inside. */
function rectDistance(r: DOMRect, x: number, y: number): number {
  const dx = Math.max(r.left - x, 0, x - r.right);
  const dy = Math.max(r.top - y, 0, y - r.bottom);
  return Math.hypot(dx, dy);
}

let target: HTMLElement | null = null;
let savedOutline = '';
let savedOutlineOffset = '';

function setTarget(el: HTMLElement | null): void {
  if (el === target) return;
  if (target) {
    target.style.outline = savedOutline;
    target.style.outlineOffset = savedOutlineOffset;
  }
  target = el;
  if (target) {
    savedOutline = target.style.outline;
    savedOutlineOffset = target.style.outlineOffset;
    target.style.outline = '3px solid #00e5a0';
    target.style.outlineOffset = '2px';
  }
}

function updateTarget(px: number, py: number, snapRadius: number): void {
  refreshTargets(performance.now());
  let best: HTMLElement | null = null;
  let bestDist = snapRadius;
  for (let i = 0; i < targetEls.length; i++) {
    const r = rects[i];
    if (r.width < 4 || r.height < 4) continue;
    if (r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth) {
      continue;
    }
    const dist = rectDistance(r, px, py);
    if (dist < bestDist) {
      bestDist = dist;
      best = targetEls[i];
    }
  }
  setTarget(best);
}

function flashTarget(el: HTMLElement): void {
  el.style.outline = '3px solid #ffcc00';
  setTimeout(() => {
    if (el === target) el.style.outline = '3px solid #00e5a0';
  }, 200);
}

function dispatchClick(el: HTMLElement, side: 'left' | 'right'): void {
  const r = el.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const base = {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    clientX: cx,
    clientY: cy,
    button: side === 'left' ? 0 : 2,
    buttons: side === 'left' ? 1 : 2,
  };
  const pointer = { ...base, pointerId: 1, pointerType: 'mouse', isPrimary: true };

  flashTarget(el);
  if (side === 'left') {
    el.dispatchEvent(new PointerEvent('pointerdown', pointer));
    el.dispatchEvent(new MouseEvent('mousedown', base));
    el.dispatchEvent(new PointerEvent('pointerup', pointer));
    el.dispatchEvent(new MouseEvent('mouseup', base));
    el.dispatchEvent(new MouseEvent('click', base));
    if (el.matches('input, select, textarea, [contenteditable]')) {
      el.focus();
    }
  } else {
    el.dispatchEvent(new MouseEvent('contextmenu', base));
  }
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
        setTarget(null);
      } else {
        onGazeFrame(raw);
      }
    } else if (raw.type === 'WINK') {
      if (!calibration && target) dispatchClick(target, raw.side);
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
