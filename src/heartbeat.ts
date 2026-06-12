// Content-side feeding: a heartbeat every 5 s while the tab is visible
// AND the user is present — focused, OR with recent input (scroll/
// pointer/key within ACTIVITY_GRACE_MS). The input clause matters: the
// extension popup steals focus while open, and wheel-scrolling under it
// never refocuses the page — pure focus-gating made real doomscrolling
// count as idle (user-reported). Input is direct evidence of presence;
// background windows still can't feed the hole (no input lands there).
// The heartbeat carries the scroll distance accumulated since the last
// beat. The worker does all accounting; deduping across multiple tabs
// happens there (elapsed-time credit), so this stays dumb.

import { diagDec, diagInc } from "./diag";
import { DEFAULT_SETTINGS, loadSettings } from "./settings";

const HEARTBEAT_MS = 5000;
const ACTIVITY_GRACE_MS = 7000;

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
  let lastActivity = 0;
  const bump = () => {
    lastActivity = Date.now();
  };
  diagInc("listener"); // scroll (app-lifetime)
  window.addEventListener(
    "scroll",
    () => {
      const y = window.scrollY;
      scrollAccum += Math.abs(y - lastY);
      lastY = y;
      bump();
    },
    { passive: true },
  );
  diagInc("listener"); // pointerdown (app-lifetime)
  window.addEventListener("pointerdown", bump, { passive: true });
  diagInc("listener"); // keydown (app-lifetime)
  window.addEventListener("keydown", bump, { passive: true });

  diagInc("interval");
  const interval = window.setInterval(() => {
    const present =
      document.hasFocus() || Date.now() - lastActivity < ACTIVITY_GRACE_MS;
    if (!enabled || document.visibilityState !== "visible" || !present) {
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
