# Session handoff

**Current phase:** Milestone 3 — BUILT and headlessly verified (13/13 unit tests still green; M3 manual script appended to docs/MANUAL-TESTS.md §7, awaiting the user's pass on real x.com). Next: Milestone 4 — polish & shippability.
**Repo:** pushed to https://github.com/ziangit/blackhole (origin/main).
**Next concrete step:** After manual sign-off, M4: README (privacy statement, settings table, perf notes), programmatic icons 16/48/128, `npm run zip` store target, theme variants (dark/dim/light — check the photon ring/glow against light mode), and a final SPA-nav hardening pass. Modal/composer suspension is ALREADY DONE (pulled into M3).

## Done so far
- Milestone 0 ✅ signed off live (all three strategies PASS, 0 CSP hits). Default: lens-data.
- Milestone 1 ✅ (13/13 tests, `npm test`): pure mass model, multi-tab dedupe, worker-death decay, clock-skew dt-cap, badge, options page (details in ARCHITECTURE.md).
- Milestone 2 ✅: `HoleController` + `HoleMotion` + `HoleOverlay`; eased mass, drift, fade, rAF lifecycle, reduced-motion. Screenshot-verified.
- Milestone 3 ✅ BUILT: `RenderManager` (src/render-manager.ts) owns renderer lifecycle off the controller's rAF — see ARCHITECTURE.md "Render pipeline", "Degrade ladder", "Spaghetti is IO-driven", "Modal/composer suspension". Spike panel reworked into the pipeline's debug rig: strategies now PIN the RenderManager (`force()`, disables degrade) instead of owning renderers; new `live :` status line; mass-override slider unchanged.
- M3 headless verification (test/integration-sandbox.html + test/integration-entry.ts, real HoleController+RenderManager against a fake timeline): lens at mass 0.7 warps tweets with `url(#event-horizon-lens)` on the column only; spaghetti transforms exactly the 14 IO-visible articles, no filter; forced overlay-only touches nothing; modal at 500 ms → mass eases 0.21→0, filter torn down at the 0.01 threshold; `?slow=30` jank walks the full degrade ladder with one log per step and no oscillation. Screenshots: test/shot-m3-{lens,spaghetti,off,modal,degrade}.png.
- Headless rig gotcha (cost a debugging detour, recorded in ARCHITECTURE.md): `--virtual-time-budget` freezes rAF timestamps — eased-mass pipeline never moves and screenshots show stale composites. Use real time + `?stall=1` + `--timeout`.

## Open questions
- None blocking. M4 notes: influence radius factor 2.2×disc still untuned against real-feed feel (judge during the manual pass); light-theme overlay colors unreviewed; consider whether the degrade rung should also reset on SPA navigation (currently sticky per page load — deliberate, revisit if it feels too sticky).
