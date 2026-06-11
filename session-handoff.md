# Session handoff

**Current phase:** Milestones 1 & 2 — BUILT (13/13 unit tests green; awaiting the user's manual pass, script in docs/MANUAL-TESTS.md). Next: Milestone 3 — lensing integration.
**Repo:** pushed to https://github.com/ziangit/blackhole (origin/main).
**Next concrete step:** After the user's manual sign-off, wire `renderMode` settings to renderers driven by live mass (controller already exposes `currentHole()`): apply filter to timeline column only, displacement scale/map radius track mass, spaghetti via IntersectionObserver, perf budget (<4 ms/frame scripting; rolling avg >12 ms → degrade lens → spaghetti → overlay-only, log once), suspend filter while modal/composer open (that's M4 but cheap to do early).

## Done so far
- Milestone 0 ✅ signed off live (all three strategies PASS, 0 CSP hits; flick-scroll pixel-locked). Default: lens-data; spaghetti selectable.
- Milestone 1 ✅ (13/13 tests, `npm test`):
  - Pure mass model `src/mass.ts`; worker rehydrates everything from storage per event.
  - Multi-tab dedupe: wall-clock-window accrual (2 tabs ≈ 1 tab, tested) + promise-queue serialization.
  - Worker-death decay: persistent 1-min alarm + elapsed-timestamp decay; tested with a fresh JSON-round-tripped "worker" per tick.
  - Clock-skew dt-cap: decay ≤ 15 min/step (sleep survives, tested), accrual ≤ 1 heartbeat interval, backwards jumps no-op (tested).
  - Badge (minutes today, slate→red), options page with live `hole mass N%` status.
- Milestone 2 ✅: `HoleController` + `HoleMotion` + `HoleOverlay` (see ARCHITECTURE.md "Hole pipeline"). Disc/ring/glow/fringe verified by screenshot at mass 0.15/0.5/1.0. Eased mass, sine drift in column, fade <0.05, rAF stops when hidden/starved, reduced-motion static.
- Debug mass-override slider in the spike panel (`?bhspike`), bypasses tracker via `setMassOverride()`. Ships inert. No reset button anywhere — closing the tab is the reset.

## Open questions
- None blocking. M3 notes: map regen ≤10 Hz already in FilterLensRenderer; influence radius factor 2.2×disc may need tuning against feel; spike harness becomes the renderMode="auto" degrade path's test rig.
