// Copies the MediaPipe WASM runtime out of node_modules into public/ so it
// ships inside the extension directory. MV3 CSP blocks CDN loading, so these
// must be local files served from chrome-extension://.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wasmSrc = path.join(root, 'node_modules/@mediapipe/tasks-vision/wasm');
const wasmDest = path.join(root, 'public/wasm');

mkdirSync(wasmDest, { recursive: true });
cpSync(wasmSrc, wasmDest, { recursive: true });
console.log('Copied MediaPipe wasm -> public/wasm');

const model = path.join(root, 'public/models/face_landmarker.task');
if (!existsSync(model)) {
  console.error(`Missing ${model}\nRun: npm run fetch-model`);
  process.exit(1);
}
