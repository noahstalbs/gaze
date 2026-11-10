import { GAZE_PORT, type ContentMsg } from '../shared/messages';

// Maintains a long-lived port to the active tab's content script (or to the
// bundled demo page, which is an extension page in a tab — tab-targeted
// messaging reaches both). Reconnects lazily when the active tab changes,
// navigates, or has no listener (chrome:// pages, the Web Store, etc.).
export class TabLink {
  private port: chrome.runtime.Port | null = null;
  private tabId: number | null = null;
  private lastAttempt = 0;
  private connecting = false;

  constructor() {
    chrome.tabs.onActivated.addListener(() => this.invalidate());
    chrome.windows.onFocusChanged.addListener(() => this.invalidate());
    chrome.tabs.onUpdated.addListener((tabId, info) => {
      if (tabId === this.tabId && info.status === 'loading') this.invalidate();
    });
  }

  get connected(): boolean {
    return this.port !== null;
  }

  private invalidate(): void {
    this.port?.disconnect();
    this.port = null;
    this.tabId = null;
    this.lastAttempt = 0;
  }

  send(msg: ContentMsg): void {
    if (this.port) {
      try {
        this.port.postMessage(msg);
      } catch {
        this.port = null;
      }
      return;
    }
    void this.connect();
  }

  private async connect(): Promise<void> {
    const now = performance.now();
    if (this.connecting || now - this.lastAttempt < 1000) return;
    this.connecting = true;
    this.lastAttempt = now;
    try {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (!tab?.id) return;
      const port = chrome.tabs.connect(tab.id, { name: GAZE_PORT });
      port.onDisconnect.addListener(() => {
        // Also fires immediately (with runtime.lastError) when the tab has no
        // listener; reconnects stay throttled by lastAttempt.
        void chrome.runtime.lastError;
        if (this.port === port) this.port = null;
      });
      this.port = port;
      this.tabId = tab.id;
    } catch {
      // No connectable tab right now; retry on a later send.
    } finally {
      this.connecting = false;
    }
  }
}
