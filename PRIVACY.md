# Gaze privacy

**All video is processed locally. Nothing is transmitted. Ever.**

- The webcam stream is consumed inside the extension's side panel by a
  bundled, on-device MediaPipe Face Landmarker model. Frames are analyzed in
  memory and discarded; no video or images are recorded or written to disk.
- The extension makes **no network requests at runtime**. The ML model and
  WASM runtime are packaged inside the extension — nothing is fetched from a
  CDN or any server.
- The only data persisted (via `chrome.storage.local`, on your machine) is:
  calibration coefficients (a handful of regression numbers) and your tuning
  settings (thresholds, speeds). No imagery, no landmarks, no gaze history.
- The in-memory diagnostics ring buffer (last ~10 seconds of gaze/wink
  events) exists only while the side panel is open and is only exported if
  you explicitly press "dump diagnostics" — it is copied to your clipboard,
  not sent anywhere.
- Websites you visit never get access to the camera; the permission belongs
  to the extension, not to any site. Pages only receive synthetic
  click/scroll/input events, indistinguishable from assistive tooling.
