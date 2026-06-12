# Session notes

Reverse-chronological log of working sessions: what happened, what was
decided, and where the evidence lives. The forward-looking state lives in
`session-handoff.md`; durable technical lessons live in
`docs/ARCHITECTURE.md` — this file is the narrative record.

## 2026-06-12 (later) — GLSL strategy, lens-equation physics, WebGL overlay, all-web scope

Discussion first: can we use Bruneton's black-hole shader / the
ghostty-blackhole GLSL? Research conclusion (recorded in ARCHITECTURE):
**GLSL over page content is deliberately impossible** — CSS Custom Filters
was removed for pixel-stealing timing attacks; every capture API carries a
user-visible indicator. But Bruneton's design is precompute-deflection-
into-tables + per-pixel lookup, which is architecturally what
feDisplacementMap already is. So:

- Displacement map now encodes the **real point-mass lens equation**
  (β = θ − θE²/θ): outward apparent push, tangential stretch, and the
  sign flip inside the Einstein radius gives an inverted secondary image
  for free. Small artistic swirl retained (0.35).
- **WebGL overlay** (`src/overlay-gl.ts`): true GLSL for everything we
  own — lensed procedural starfield (same lens equation as the map),
  Keplerian disc with Doppler beaming, near-side band in front of the
  horizon / far side arcing over it, photon ring + bloom, dark veil.
  Canvas-2D overlay kept as the no-WebGL fallback behind a shared
  `OverlayLike` contract. Verified dpr=1 and dpr=2.
- **All-web scope (owner decision, supersedes the X-only 1.0.0 framing):**
  matches `http://*/*` + `https://*/*`; `acquireColumn` generalized
  (testid → article/paragraph climb → main → null = overlay-only; never
  a page-wide filter target); spaghetti falls back to the column's block
  children; copy → "minutes browsing today". manifest-check enforces the
  new policy; SECURITY-AUDIT scope sections updated; STORE-LISTING marked
  stale pending a rewrite for the broad-host review track.

User checked the GLSL look on real x.com: **"Looks great!"** (their
screenshot shows the lensed-starfield swirl at mass 0.36 — the reference
aesthetic achieved). The "no hole visible" confusion before that was the
graceMinutes default (5) doing its job — panel showed m0.00 with zero
resources, i.e. the below-grace contract holding in production.

Follow-up request: a real-extension UX like their macOS menu-bar app
reference → **toolbar popup** (action.default_popup): "Show Black Hole
Now" = `forceShow` (forced presence, not a reset), break-in presets =
graceMinutes writers (keeping a ≥15 min growth window), Enabled toggle,
Custom…→options. Options save now preserves popup-owned fields.

Awaiting the user's manual check of the popup.

## 2026-06-11/12 — M3 → live-feedback rounds → 1.0.0 pre-publish

One long session from "wire the lens to live mass" to a store-ready
1.0.0. Commits `8273c77 … 24f7040`.

### Milestone 3 built and verified (`8273c77`)
`RenderManager` (renderMode → renderer lifecycle off the controller's
rAF), perf degrade ladder (lens → spaghetti → overlay-only),
IntersectionObserver-based spaghetti, modal/composer suspension (pulled
forward from M4), spike panel reworked into the pipeline's debug rig.
Built the headless verification rig (`test/integration-sandbox.html`) and
discovered `--virtual-time-budget` freezes rAF — the working rig is real
time + stalled load + `--timeout`.

### User feedback rounds on the real feed (`0ca685d` … `da860b3`)
The user tested live and drove seven rounds:

1. **Look like the reference (Ghostty shader)** → tangential swirl in the
   displacement map, stronger warp, tight glow, chroma ring echoes,
   orbiting hotspot; faster viewport-wide drift (`0ca685d`).
2. **"It goes off-screen / effect disappears"** → drift re-anchored to
   the feed column, fully-on-screen clamp (`0615ef8`).
3. **Still wrong → the ORPHAN discovery**: reloading the extension leaves
   the old content script alive in open tabs, drawing a ghost hole with
   old code. Startup eviction + orphan self-destruct + `__EH_BUILD__`
   build tag in the panel (`5abf44c`).
4. **"1.0→0.5 looks different than 0.5" + "obvious only when large"** →
   real bug: tier-based map regeneration from instantaneous mass made the
   warp history-dependent, and intensity was effectively mass². Fixed
   with a static reference-mass map + `scale ∝ mass^0.4` (`0cf6baf`).
5. **"More like a real black hole"** → RGB-split chromatic lensing (3
   displacement passes), wider/stronger warp, elliptical wander bound
   (`c77148f`); then Grok-style tilted orbit ring with occlusion +
   `appearAfterMinutes` first cut (`5a263e8`); then small-core/big-
   influence proportions + bigger brighter orbit (`593b0a6`).
6. **"My Mac is hot"** → diagnosed: per-frame feImage updates force full
   GPU re-raster of the 3-pass filter at 60–120 fps; not a leak. Ambient
   30 fps cap, scroll/mass bypass (`593b0a6`).
7. **"Always in the bottom-right corner"** — three real causes peeled in
   order: deterministic sine phases replayed the same right-leaning
   opening every load (`06b03bb`, verified by 2000-session simulation);
   bare-`main` anchor fallback is right-biased → robust column
   acquisition + plausibility guard + panel diagnostics (`ebe4f84`);
   and finally **the actual root cause of the whole saga**: the overlay
   canvas is a replaced element, so `inset:0` + intrinsic size made it
   2× the viewport on Retina — every disc drew at 2× position/size while
   the SVG warp stayed correct. Invisible in all headless checks (dpr
   defaults to 1). Fixed + `--force-device-scale-factor=2` made a
   mandatory check (`da860b3`).

### 1.0.0 pre-publish package (`24f7040`)
- **graceMinutes** (supersedes appearAfterMinutes): absent until grace,
  full size at limit total; `sanitizeSettings` clamp surfaced in options;
  lazy overlay mount ⇒ zero page presence below the boundary. 16/16 tests.
- **Security audit** → `docs/SECURITY-AUDIT.md`: zero-network grep
  evidence (src + dist), manifest minimization enforced by
  `test/manifest-check.mjs` in `npm test`, onMessage sender + range
  validation, isTrusted spike gate, zero runtime deps.
- **Leak verification** → `src/diag.ts` counters + `test/soak-sandbox.html`
  (dpr=2): 1000 renderer churns + 12 eased lifecycles, counts return to
  baseline, heap flat 9.5 MB.
- **Store package**: README, MIT LICENSE, `docs/STORE-LISTING.md`,
  programmatic icons, v1.0.0, `npm run zip` verified diff-identical to
  dist/, `tools/store-screenshot.sh`, and `PUBLISH-CHECKLIST.md`
  (automated evidence table + the human queue).

**Open:** the user works through PUBLISH-CHECKLIST.md "Human must do"
(fresh-profile zip install, multi-day soak, real-feed capture, $5
account, dashboard, submit). Post-1.0 polish candidates: light/dim theme
pass, degrade-rung reset on SPA nav.
