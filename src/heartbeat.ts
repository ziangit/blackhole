// Content-side feeding: a heartbeat every 5 s while the tab is BOTH
// visible and focused, carrying the scroll distance accumulated since the
// last beat. The worker does all accounting; deduping across multiple X
// tabs happens there (elapsed-time credit), so this stays dumb.

import { diagDec, diagInc } from "./diag";
import { DEFAULT_SETTINGS, loadSettings } from "./settings";

const HEARTBEAT_MS = 5000;

export function initHeartbeat(): void {
  let enabled = DEFAULT_SETTINGS.enabled;
  void loadSettings().then((s) => {
    enabled = s.enabled;
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes["settings"]?.newValue) {
      enabled = {
        ...DEFAULT_SETTINGS,
        ...changes["settings"].newValue,
      }.enabled;
    }
  });

  let lastY = window.scrollY;
  let scrollAccum = 0;
  diagInc("listener"); // scroll (app-lifetime)
  window.addEventListener(
    "scroll",
    () => {
      const y = window.scrollY;
      scrollAccum += Math.abs(y - lastY);
      lastY = y;
    },
    { passive: true },
  );

  diagInc("interval");
  const interval = window.setInterval(() => {
    if (
      !enabled ||
      document.visibilityState !== "visible" ||
      !document.hasFocus()
    ) {
      scrollAccum = 0;
      return;
    }
    const scrollDelta = scrollAccum;
    scrollAccum = 0;
    try {
      void chrome.runtime
        .sendMessage({ type: "eh-heartbeat", scrollDelta })
        .catch(() => {});
    } catch {
      // extension was reloaded; this content script is orphaned — stop.
      window.clearInterval(interval);
      diagDec("interval");
    }
  }, HEARTBEAT_MS);
}
