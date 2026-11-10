import './style.css';
import {
  DrawingUtils,
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult,
} from '@mediapipe/tasks-vision';
import { extractFeatures, rawGazePoint } from './gaze';
import {
  applyCalibration,
  featureVector,
  fitCalibration,
  isUsableCalibration,
  type Calibration,
} from './calibration';
import { OneEuroFilter } from './oneeuro';
import { loadSettings, saveSettings, SLIDERS, type Settings } from './settings';
import { TabLink } from './tablink';
import type { CalCancelMsg, CalResultMsg } from '../shared/messages';

const video = document.getElementById('video') as HTMLVideoElement;
const overlay = document.getElementById('overlay') as HTMLCanvasElement;
const cameraMsg = document.getElementById('camera-msg') as HTMLDivElement;
const statusPill = document.getElementById('status-pill') as HTMLSpanElement;
const btnGrant = document.getElementById('btn-grant') as HTMLButtonElement;

const btnCalibrate = document.getElementById('btn-calibrate') as HTMLButtonElement;
const btnToggleGaze = document.getElementById('btn-toggle-gaze') as HTMLButtonElement;
const btnDemo = document.getElementById('btn-demo') as HTMLButtonElement;
const btnResetCal = document.getElementById('btn-reset-cal') as HTMLButtonElement;
const slidersBox = document.getElementById('sliders') as HTMLDivElement;

const stat = {
  face: document.getElementById('stat-face') as HTMLElement,
  fps: document.getElementById('stat-fps') as HTMLElement,
  blinkL: document.getElementById('stat-blink-l') as HTMLElement,
  blinkR: document.getElementById('stat-blink-r') as HTMLElement,
  gaze: document.getElementById('stat-gaze') as HTMLElement,
  cal: document.getElementById('stat-cal') as HTMLElement,
};

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function buildSliders(settings: Settings, onChange: () => void): void {
  for (const spec of SLIDERS) {
    const label = document.createElement('label');
    const val = document.createElement('span');
    val.className = 'val';
    val.textContent = String(settings[spec.key]);
    label.append(spec.label, val);
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(spec.min);
    input.max = String(spec.max);
    input.step = String(spec.step);
    input.value = String(settings[spec.key]);
    input.addEventListener('input', () => {
      settings[spec.key] = Number(input.value);
      val.textContent = input.value;
      saveSettings(settings);
      onChange();
    });
    slidersBox.append(label, input);
  }
}

function setStatus(text: string, kind: 'ok' | 'err' | 'off') {
  statusPill.textContent = text;
  statusPill.className = `pill pill-${kind}`;
}

function showCameraMessage(text: string | null) {
  if (text === null) {
    cameraMsg.classList.add('hidden');
  } else {
    cameraMsg.classList.remove('hidden');
    cameraMsg.textContent = text;
  }
}

async function initCamera(): Promise<void> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
    audio: false,
  });
  video.srcObject = stream;
  await new Promise<void>((resolve) => {
    video.onloadeddata = () => resolve();
  });
  overlay.width = video.videoWidth;
  overlay.height = video.videoHeight;
}

async function initLandmarker(): Promise<FaceLandmarker> {
  const fileset = await FilesetResolver.forVisionTasks(chrome.runtime.getURL('wasm'));
  const options = {
    baseOptions: {
      modelAssetPath: chrome.runtime.getURL('models/face_landmarker.task'),
      delegate: 'GPU' as const,
    },
    runningMode: 'VIDEO' as const,
    numFaces: 1,
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: true,
  };
  try {
    return await FaceLandmarker.createFromOptions(fileset, options);
  } catch (err) {
    console.warn('[gaze] GPU delegate failed, falling back to CPU', err);
    return await FaceLandmarker.createFromOptions(fileset, {
      ...options,
      baseOptions: { ...options.baseOptions, delegate: 'CPU' },
    });
  }
}

function blendshape(result: FaceLandmarkerResult, name: string): number {
  const categories = result.faceBlendshapes[0]?.categories ?? [];
  return categories.find((c) => c.categoryName === name)?.score ?? 0;
}

function drawMesh(utils: DrawingUtils, ctx: CanvasRenderingContext2D, result: FaceLandmarkerResult) {
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  const landmarks = result.faceLandmarks[0];
  if (!landmarks) return;
  utils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_TESSELATION, {
    color: 'rgba(0, 229, 160, 0.18)',
    lineWidth: 0.5,
  });
  for (const conn of [
    FaceLandmarker.FACE_LANDMARKS_LEFT_EYE,
    FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE,
    FaceLandmarker.FACE_LANDMARKS_FACE_OVAL,
  ]) {
    utils.drawConnectors(landmarks, conn, { color: 'rgba(0, 229, 160, 0.7)', lineWidth: 1 });
  }
  for (const conn of [FaceLandmarker.FACE_LANDMARKS_LEFT_IRIS, FaceLandmarker.FACE_LANDMARKS_RIGHT_IRIS]) {
    utils.drawConnectors(landmarks, conn, { color: '#ffcc00', lineWidth: 1.5 });
  }
}

// Chrome sometimes cannot show the permission prompt inside a side panel, so
// on failure we point at grant.html and poll until the permission lands —
// the user should never have to close and reopen the panel.
async function acquireCamera(): Promise<void> {
  try {
    await initCamera();
    return;
  } catch (err) {
    console.warn('[gaze] camera blocked, polling for permission', err);
  }

  setStatus('camera blocked', 'err');
  showCameraMessage(
    'Camera access was blocked. Chrome sometimes cannot show the permission ' +
      'prompt inside a side panel — use the button below to grant it from a ' +
      'regular tab. This panel picks it up automatically.',
  );
  btnGrant.classList.remove('hidden');
  const openGrant = () => chrome.tabs.create({ url: chrome.runtime.getURL('grant.html') });
  btnGrant.addEventListener('click', openGrant);

  await new Promise<void>((resolve) => {
    let busy = false;
    const timer = setInterval(async () => {
      if (busy) return;
      busy = true;
      try {
        await initCamera();
        clearInterval(timer);
        resolve();
      } catch {
        // still blocked (or camera briefly held by the grant tab) — keep polling
      } finally {
        busy = false;
      }
    }, 1500);
  });

  btnGrant.classList.add('hidden');
  btnGrant.removeEventListener('click', openGrant);
}

async function main() {
  await acquireCamera();

  setStatus('loading model…', 'off');
  showCameraMessage(null);
  const landmarker = await initLandmarker();
  setStatus('tracking', 'ok');

  const ctx = overlay.getContext('2d')!;
  const utils = new DrawingUtils(ctx);

  const tabLink = new TabLink();
  let gazeEnabled = true;
  let calibrating = false;
  let calibrationData: Calibration | null = null;

  const settings = await loadSettings();
  const filterX = new OneEuroFilter(settings.smoothMinCutoff, settings.smoothBeta);
  const filterY = new OneEuroFilter(settings.smoothMinCutoff, settings.smoothBeta);
  const applySmoothing = () => {
    filterX.minCutoff = filterY.minCutoff = settings.smoothMinCutoff;
    filterX.beta = filterY.beta = settings.smoothBeta;
  };
  buildSliders(settings, applySmoothing);

  const setCalibrated = (cal: Calibration | null) => {
    calibrationData = cal;
    stat.cal.textContent = cal ? 'yes' : 'no';
    void chrome.storage.local.set({ calibration: cal });
  };

  // Restore a persisted calibration if its feature layout still matches.
  const stored = await chrome.storage.local.get('calibration');
  const featLen = featureVector({ eyeX: 0, eyeY: 0, yaw: 0, pitch: 0 }).length;
  if (isUsableCalibration(stored.calibration, featLen)) {
    calibrationData = stored.calibration;
    stat.cal.textContent = 'yes';
  }

  btnToggleGaze.disabled = false;
  btnToggleGaze.classList.add('active');
  btnToggleGaze.addEventListener('click', () => {
    gazeEnabled = !gazeEnabled;
    btnToggleGaze.classList.toggle('active', gazeEnabled);
  });

  btnDemo.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('demo.html') });
  });

  btnCalibrate.disabled = false;
  btnCalibrate.addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (!tab?.id) throw new Error('no active tab');
      await chrome.tabs.sendMessage(tab.id, { type: 'CAL_START' });
      calibrating = true;
      btnCalibrate.classList.add('active');
    } catch {
      setStatus('open a web page (or the demo page) first', 'err');
      setTimeout(() => setStatus('tracking', 'ok'), 2500);
    }
  });

  btnResetCal.addEventListener('click', () => setCalibrated(null));

  chrome.runtime.onMessage.addListener((msg: CalResultMsg | CalCancelMsg) => {
    if (msg.type === 'CAL_RESULT') {
      calibrating = false;
      btnCalibrate.classList.remove('active');
      const cal = fitCalibration(msg.samples);
      if (cal) {
        setCalibrated(cal);
        setStatus('calibrated', 'ok');
        setTimeout(() => setStatus('tracking', 'ok'), 2000);
      } else {
        setStatus('calibration failed — try again', 'err');
        setTimeout(() => setStatus('tracking', 'ok'), 2500);
      }
    } else if (msg.type === 'CAL_CANCEL') {
      calibrating = false;
      btnCalibrate.classList.remove('active');
    }
  });

  let fps = 0;
  let lastFrameAt = performance.now();

  const processFrame = () => {
    const now = performance.now();
    const result = landmarker.detectForVideo(video, now);

    fps = fps * 0.9 + (1000 / Math.max(1, now - lastFrameAt)) * 0.1;
    lastFrameAt = now;

    drawMesh(utils, ctx, result);

    const hasFace = result.faceLandmarks.length > 0;
    const features = hasFace ? extractFeatures(result) : null;
    let gaze: { x: number; y: number } | null = null;
    let feat: number[] | undefined;
    if (features) {
      feat = featureVector(features);
      const mapped = calibrationData
        ? applyCalibration(calibrationData, feat)
        : rawGazePoint(features);
      gaze = {
        x: clamp01(filterX.filter(mapped.x, now / 1000)),
        y: clamp01(filterY.filter(mapped.y, now / 1000)),
      };
    } else {
      filterX.reset();
      filterY.reset();
    }

    if (gazeEnabled) {
      tabLink.send({
        type: 'GAZE_FRAME',
        x: gaze?.x ?? 0.5,
        y: gaze?.y ?? 0.5,
        hasFace: gaze !== null,
        t: now,
        feat: calibrating ? feat : undefined,
      });
    }

    stat.face.textContent = hasFace ? 'yes' : 'no';
    stat.fps.textContent = fps.toFixed(0);
    // Raw model blendshape names; which one maps to the user's physical left
    // eye (the image is mirrored) gets verified in the wink-detection milestone.
    stat.blinkL.textContent = hasFace ? blendshape(result, 'eyeBlinkLeft').toFixed(2) : '–';
    stat.blinkR.textContent = hasFace ? blendshape(result, 'eyeBlinkRight').toFixed(2) : '–';
    stat.gaze.textContent = gaze ? `${(gaze.x * 100).toFixed(0)}, ${(gaze.y * 100).toFixed(0)} %` : '–';
  };

  // requestVideoFrameCallback fires once per camera frame (~30 Hz) instead of
  // per display refresh, so detection runs at the true camera rate.
  const onFrame = () => {
    processFrame();
    video.requestVideoFrameCallback(onFrame);
  };
  video.requestVideoFrameCallback(onFrame);
}

main().catch((err) => {
  console.error('[gaze] init failed', err);
  setStatus('init failed', 'err');
  showCameraMessage(`Initialization failed: ${err}`);
});
