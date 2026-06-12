# Session handoff

> Narrative log of past sessions: docs/SESSION-NOTES.md (dated entries —
> add one per session).

**Current phase:** 1.0.0 PRE-PUBLISH COMPLETE — graceMinutes feature (supersedes appearAfterMinutes; remap + validation clamp + lazy overlay + tests 16/16), security/privacy audit (docs/SECURITY-AUDIT.md; hardening shipped: sender.id check, message range validation, isTrusted spike gate, manifest-check wired into npm test), resource/leak verification (src/diag.ts counters + test/soak-sandbox.html — all PASS at dpr=2, flat heap), store package (README, LICENSE MIT, docs/STORE-LISTING.md, programmatic icons, zip verified identical to dist, tools/store-screenshot.sh). **Final deliverable: PUBLISH-CHECKLIST.md — its "Human must do" section is the user's queue (fresh-profile install from zip, multi-day Task-Manager soak, real-feed capture, $5 dev account, dashboard forms from STORE-LISTING.md, submit).**
**Repo:** pushed to https://github.com/ziangit/blackhole (origin/main).
**Next concrete step:** support the user through the "Human must do" checklist; on review feedback, fix and re-zip. Remaining known polish (optional, post-1.0): light/dim theme pass on overlay colors, degrade-rung reset on SPA nav.

## Done so far
- Milestone 0 ✅ signed off live (all three strategies PASS, 0 CSP hits). Default: lens-data.
- Milestone 1 ✅ (13/13 tests, `npm test`): pure mass model, multi-tab dedupe, worker-death decay, clock-skew dt-cap, badge, options page (details in ARCHITECTURE.md).
- Milestone 2 ✅: `HoleController` + `HoleMotion` + `HoleOverlay`; eased mass, drift, fade, rAF lifecycle, reduced-motion. Screenshot-verified.
- Milestone 3 ✅ BUILT: `RenderManager` (src/render-manager.ts) owns renderer lifecycle off the controller's rAF — see ARCHITECTURE.md "Render pipeline", "Degrade ladder", "Spaghetti is IO-driven", "Modal/composer suspension". Spike panel reworked into the pipeline's debug rig: strategies now PIN the RenderManager (`force()`, disables degrade) instead of owning renderers; new `live :` status line; mass-override slider unchanged.
- M3 headless verification (test/integration-sandbox.html + test/integration-entry.ts, real HoleController+RenderManager against a fake timeline): lens at mass 0.7 warps tweets with `url(#event-horizon-lens)` on the column only; spaghetti transforms exactly the 14 IO-visible articles, no filter; forced overlay-only touches nothing; modal at 500 ms → mass eases 0.21→0, filter torn down at the 0.01 threshold; `?slow=30` jank walks the full degrade ladder with one log per step and no oscillation. Screenshots: test/shot-m3-{lens,spaghetti,off,modal,degrade}.png.
- Headless rig gotcha (cost a debugging detour, recorded in ARCHITECTURE.md): `--virtual-time-budget` freezes rAF timestamps — eased-mass pipeline never moves and screenshots show stale composites. Use real time + `?stall=1` + `--timeout`.

## Open questions
- None blocking. M4 notes: restyle tuning values (SWIRL 0.8, MAX_SCALE 150, drift periods 9–30 s, hotspot 0.55 rad/s) chosen against headless screenshots — user feel-check pending; light-theme overlay colors unreviewed; consider whether the degrade rung should also reset on SPA navigation (currently sticky per page load — deliberate, revisit if it feels too sticky). Stronger warp = bigger raster cost; if real-feed frame times suffer, the degrade ladder will catch it — watch for unexpected degrades during the re-check.
