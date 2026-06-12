// Content-side feeding: a heartbeat every 5 s while the tab is visible
// AND the user has produced INPUT within IDLE_AFTER_MS (scroll, pointer,
// key, mouse-move; navigation and tab-switch count as the first input).
// Two presence-gate lessons baked in (both user-reported):
// - focus is NOT presence: the extension popup steals focus while
//   wheel-scrolling continues — input had to count even when unfocused;
// - focus is not presence the other way either: a focused window with a
//   motionless user (AFK, autoplaying video) kept accruing forever. No
//   input for IDLE_AFTER_MS ⇒ idle, focused or not. Videos/DOM changes
//   never counted — only real input does.
// Background windows can't feed the hole: no input lands there.
// The heartbeat carries the scroll distance accumulated since the last
// beat. The worker does all accounting; deduping across multiple tabs
// happens there (elapsed-time credit), so this stays dumb.

import { diagDec, diagInc } from "./diag";
import { DEFAULT_SETTINGS, loadSettings } from "./settings";

const HEARTBEAT_MS = 5000;
// No input for this long ⇒ idle, full stop. Short on purpose: "doing
// nothing" must stop the clock fast (user-reported); active reading
// involves scrolling well inside this window.
const IDLE_AFTER_MS = 30_000;
// pointermove only counts after this much CUMULATIVE travel — a hand
// resting on the mouse/trackpad jitters out events without the user
// doing anything.
const MOVE_THRESHOLD_PX = 30;

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
  let lastActivity = Date.now(); // navigating here was itself an input
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
  diagInc("listener"); // pointermove (app-lifetime) — reading wiggles the mouse
  let moveAccum = 0;
  let lastMX = -1;
  let lastMY = -1;
  window.addEventListener(
    "pointermove",
    (e) => {
      if (lastMX >= 0) {
        moveAccum += Math.abs(e.clientX - lastMX) + Math.abs(e.clientY - lastMY);
      }
      lastMX = e.clientX;
      lastMY = e.clientY;
      if (moveAccum >= MOVE_THRESHOLD_PX) {
        moveAccum = 0;
        bump();
      }
    },
    { passive: true },
  );
  diagInc("listener"); // visibilitychange (app-lifetime) — tab switch is input
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") bump();
  });

  diagInc("interval");
  const interval = window.setInterval(() => {
    const present = Date.now() - lastActivity < IDLE_AFTER_MS;
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
