# Gaze

Control a web page with your eyes, using only a laptop webcam. Gaze is a
Chrome extension (Manifest V3) prototype: look at things to target them, wink
to click, dwell at the screen edge to scroll, and type on a dwell-activated
on-screen keyboard.

![demo](docs/demo.gif)
*(GIF placeholder — recording coming once the feature set lands.)*

All video processing happens locally in the extension via
[MediaPipe Face Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker).
No video, images, or derived data ever leave your machine. See
[PRIVACY.md](PRIVACY.md).

## Status

One-day prototype, built in milestones:

- [x] 1. Extension scaffold, side panel, camera preview with live face mesh
- [x] 2. Raw (uncalibrated) gaze dot overlaid on the page
- [x] 3. 9-point calibration + smoothing
- [x] 4. Interactive-element highlighting + wink-to-click
- [ ] 5. Dwell scroll
- [ ] 6. Dwell-activated on-screen keyboard

## Install (load unpacked)

```sh
git clone https://github.com/noahstalbs/gaze.git
cd gaze
npm install
npm run build
```

Then:

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select the `dist/` directory.
4. Click the Gaze toolbar icon — the side panel opens and asks for camera
   access. If Chrome fails to show the permission prompt inside the side
   panel (a known Chrome quirk), the panel offers a button that opens a
   regular tab to grant it instead.

The MediaPipe model (`public/models/face_landmarker.task`) is committed to the
repo; `npm run fetch-model` re-downloads it if you ever need to. The MediaPipe
WASM runtime is copied out of `node_modules` into the bundle at build time.

## Permissions

`manifest.json` cannot contain comments, so the justification for each entry
lives here:

| Manifest entry | Why |
| --- | --- |
| `sidePanel` | The side panel owns the camera, so the permission is granted once to the extension rather than per-website. |
| `storage` | Persists calibration coefficients and tuning settings locally. |
| `content_scripts` on `http(s)://*/*` | Renders the gaze dot / element highlight and performs clicks and scrolling on the page you're looking at. |
| CSP `wasm-unsafe-eval` | Required to instantiate the bundled MediaPipe WASM runtime. No remote code — everything is packaged in the extension. |

## Known limitations

- **Cannot click browser UI** — extensions can only act inside web page
  content, not on tabs, the omnibox, menus, or dialogs.
- **Cannot act on `chrome://` pages, the Chrome Web Store, or other
  extensions' pages** — content scripts are not allowed there.
- **Cannot reach inside cross-origin iframes** — the overlay and clicks only
  work in the top frame.
- **Accuracy degrades when you move your head** — calibration maps eye
  features to screen coordinates for the head pose you calibrated with.
  Re-calibrate after repositioning. Expect 50–150 px of error even when
  freshly calibrated; the element-snapping design exists because of this.
- Webcam gaze tracking is sensitive to lighting, glasses glare, and camera
  placement.

## Development

- `npm run build` — full build into `dist/`
- `npm run typecheck` — TypeScript check (no emit)

Pinned dependencies: `@mediapipe/tasks-vision@1.2.2`, `vite@8.3.7`,
`typescript@7.0.2`, `@types/chrome@0.3.7`.
