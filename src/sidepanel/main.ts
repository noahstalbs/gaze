import './style.css';
import {
  DrawingUtils,
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult,
} from '@mediapipe/tasks-vision';

const video = document.getElementById('video') as HTMLVideoElement;
const overlay = document.getElementById('overlay') as HTMLCanvasElement;
const cameraMsg = document.getElementById('camera-msg') as HTMLDivElement;
const statusPill = document.getElementById('status-pill') as HTMLSpanElement;
const btnGrant = document.getElementById('btn-grant') as HTMLButtonElement;

const stat = {
  face: document.getElementById('stat-face') as HTMLElement,
  fps: document.getElementById('stat-fps') as HTMLElement,
  blinkL: document.getElementById('stat-blink-l') as HTMLElement,
  blinkR: document.getElementById('stat-blink-r') as HTMLElement,
  gaze: document.getElementById('stat-gaze') as HTMLElement,
};

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

  let lastVideoTime = -1;
  let fps = 0;
  let lastFrameAt = performance.now();

  const loop = () => {
    requestAnimationFrame(loop);
    if (video.readyState < 2 || video.currentTime === lastVideoTime) return;
    lastVideoTime = video.currentTime;

    const now = performance.now();
    const result = landmarker.detectForVideo(video, now);

    fps = fps * 0.9 + (1000 / Math.max(1, now - lastFrameAt)) * 0.1;
    lastFrameAt = now;

    drawMesh(utils, ctx, result);

    const hasFace = result.faceLandmarks.length > 0;
    stat.face.textContent = hasFace ? 'yes' : 'no';
    stat.fps.textContent = fps.toFixed(0);
    // Raw model blendshape names; which one maps to the user's physical left
    // eye (the image is mirrored) gets verified in the wink-detection milestone.
    stat.blinkL.textContent = hasFace ? blendshape(result, 'eyeBlinkLeft').toFixed(2) : '–';
    stat.blinkR.textContent = hasFace ? blendshape(result, 'eyeBlinkRight').toFixed(2) : '–';
    stat.gaze.textContent = '–';
  };
  requestAnimationFrame(loop);
}

main().catch((err) => {
  console.error('[gaze] init failed', err);
  setStatus('init failed', 'err');
  showCameraMessage(`Initialization failed: ${err}`);
});
