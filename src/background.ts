// Clicking the toolbar icon opens the side panel, which owns the camera.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err) => console.error('[gaze] setPanelBehavior failed', err));
