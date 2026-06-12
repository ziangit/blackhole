import { initHeartbeat } from "./heartbeat";
import { HoleController } from "./hole-controller";
import { RenderManager } from "./render-manager";
import { initSpike } from "./spike";

// Reloading the extension ORPHANS the previous content script in already-
// open tabs: its rAF loop keeps drawing a hole with old code while Chrome
// injects this script alongside it — two holes, two filters with the same
// id, "the effect is broken". Defense in both directions: new scripts evict
// any remnants at startup (below), and live scripts self-destruct when they
// notice they're orphaned (HoleController orphan check).
function evictOrphanRemnants(): void {
  for (const id of ["event-horizon-overlay", "bh-spike-panel"]) {
    document.getElementById(id)?.remove();
  }
  for (const id of ["event-horizon-lens", "bh-spike-probe"]) {
    document.getElementById(id)?.closest("svg")?.remove();
  }
  const col = document.querySelector<HTMLElement>(
    '[data-testid="primaryColumn"], main[role="main"]',
  );
  if (col?.style.filter.includes("event-horizon-lens")) col.style.filter = "";
}

// Double-injection guard: onInstalled re-injects into open tabs (so an
// extension reload doesn't leave dead tabs), and a tab that ALREADY runs
// this exact build must not start a second pipeline. An orphaned older
// build leaves a different tag and is evicted normally.
const LOADED_FLAG = "__EH_LOADED__";
const w = window as unknown as Record<string, unknown>;
if (w[LOADED_FLAG] === __EH_BUILD__) {
  console.info(`[event-horizon] build ${__EH_BUILD__} already active — skipping`);
} else {
  w[LOADED_FLAG] = __EH_BUILD__;
  main();
}

function main(): void {
// Whatever happens, never break the page.
try {
  initHeartbeat();
} catch (e) {
  console.warn("[event-horizon] heartbeat init failed", e);
}

try {
  console.info(`[event-horizon] build ${__EH_BUILD__}`);
  evictOrphanRemnants();
  const manager = new RenderManager();
  const controller = new HoleController(manager);
  void controller.start().then(() => {
    try {
      initSpike(controller, manager);
    } catch (e) {
      console.warn("[event-horizon] spike init failed", e);
    }
  });
} catch (e) {
  console.warn("[event-horizon] hole init failed", e);
}
}
