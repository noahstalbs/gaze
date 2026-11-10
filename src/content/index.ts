// Gaze content script. Milestone 1: message-plumbing stub only.
// Later milestones add the gaze overlay, element highlighting, synthetic
// clicks, dwell scroll, and text insertion.

chrome.runtime.onMessage.addListener((msg: unknown, _sender, sendResponse) => {
  const m = msg as { type?: string };
  if (m?.type === 'GAZE_PING') {
    sendResponse({ ok: true });
  }
  return false;
});
