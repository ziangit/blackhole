# Prompt for Claude Code

Build a Chrome extension (Manifest V3) called **`event-horizon`** — an anti-doomscrolling black hole for X/Twitter. The longer I scroll X, the bigger a black hole grows inside the feed, gravitationally lensing the actual page content until it's devouring my timeline. Leave the site and it slowly starves and shrinks. This is the inverse of the viral Ghostty terminal shader (which grew while you *worked*); here the hole feeds on procrastination.

Important framing: the effect must warp the REAL page — actual tweets bending into the hole — not just draw a black circle on top. The black disc/photon ring is an overlay, but the lensing must displace real rendered content.

Work milestone by milestone. After each milestone the extension must load cleanly via `chrome://extensions` → "Load unpacked" with zero console errors on x.com.

## Tech & constraints

- Manifest V3. Plain TypeScript bundled with esbuild (no framework). Layout: `src/background.ts` (service worker), `src/content.ts` (+ helpers), `src/options.html/ts`, `manifest.json`, `assets/`.
- `content_scripts` matching `https://x.com/*` and `https://twitter.com/*`, `run_at: document_idle`. Permissions: `storage`, `alarms` only. No analytics, no network calls — all data stays local (state this in the README; it matters for store review).
- X is a React SPA with virtualized scrolling and client-side navigation: never assume the timeline container exists at injection time or survives navigation. Use a `MutationObserver` + periodic re-acquire of `main[role="main"]` (and the primary column within it).

## Milestone 0 — Rendering spike (de-risk this FIRST)

The core visual is an SVG `feDisplacementMap` filter applied to the timeline container, with the displacement map generated on an offscreen canvas (radial deflection vectors encoded in the R/G channels around the 128 neutral point, magnitude falling off with distance — approximate lens: deflection ∝ mass / max(r, eventRadius)²).

The risk: `feImage` needs an image source for the map, and x.com's CSP may block some source types. Build a tiny standalone spike inside the content script (behind a `?bhspike` flag or a temporary keyboard shortcut) that tries, in order:
1. `feImage` with a `data:` URL regenerated from the canvas.
2. `feImage` with a packaged PNG via `chrome.runtime.getURL` (declare it in `web_accessible_resources`), scaled/positioned by updating `feImage` x/y/width/height attributes.
3. Fallback "spaghettification" mode with no SVG filter at all: select the visible `article` elements (tweets), and per frame apply CSS `transform` (translate toward the hole + rotate tangentially + scale down) and `filter: blur()` proportional to proximity. Chunkier than true lensing but CSP-proof and arguably funnier — whole tweets visibly sucked in.

Verify each on the real x.com feed, record what works in `ARCHITECTURE.md`, and make the renderer an interface (`LensRenderer`) with the winning strategy as default and spaghettification always available as a setting (`renderMode: "lens" | "spaghetti" | "auto"`).

## Milestone 1 — Mass tracking (background service worker)

The hole's `mass` (0..1) lives in `chrome.storage.local` and is the single source of truth.

- **Feeding**: the content script reports activity heartbeats (every 5 s while the tab is visible AND window focused: `document.visibilityState` + focus events) including scroll delta since last heartbeat. The worker accumulates `activeSeconds`; scrolling counts extra (heartbeats with meaningful scroll delta accrue at 1.5×) — idle-but-open feeds the hole slowly, doomscrolling feeds it fast.
- **Growth**: `mass = clamp(effectiveSeconds / (limitMinutes * 60), 0, 1)`, `limitMinutes` default 20. Apply smoothstep near 1.0 for an accelerating endgame.
- **Starving**: a `chrome.alarms` tick every minute decays `effectiveSeconds` with a half-life of `decayHalfLifeMinutes` (default 10) whenever no X tab has sent a heartbeat in the last minute. Off X for ~30 min → hole essentially gone. Persists across browser restarts.
- **Badge**: extension icon badge shows minutes on X today (separate daily counter, resets at local midnight); badge background shifts toward red as mass grows.
- **Options page**: `limitMinutes`, `decayHalfLifeMinutes`, `renderMode`, `maxCoverage` (how much of the viewport the hole may eat at mass 1.0, default 35%), `enabled` toggle. Live-apply via `storage.onChanged`.
- Deliberately NO one-click reset button — closing the tab IS the reset mechanism.

## Milestone 2 — The hole overlay (content script)

A `position: fixed`, `pointer-events: none`, high-z-index `<canvas>` covering the viewport, drawing at `requestAnimationFrame`:
- Pure black event horizon disc, radius driven by mass (cap at `maxCoverage` of viewport area).
- Bright thin photon ring just outside it, subtle warm accretion glow, faint chromatic fringe (draw it — offset orange/blue arcs — no sampling needed).
- The hole **drifts** within the feed column: smooth time-based sines (different frequencies for x/y), eased mass changes (spring or lerp — never pops).
- Fade in from nothing below mass 0.05; everything pauses (rAF stops, zero work) when the tab is hidden.
- Respect `prefers-reduced-motion`: static hole, no drift, no animation.

## Milestone 3 — Lensing integration

Wire the Milestone 0 winner to the live mass:
- Filter applied to the timeline column only (NOT `body` — fixed-position elements and perf both break). Displacement scale and map radius track mass; hole center shared with the overlay canvas so disc and distortion agree.
- Map regeneration ≤ 10 Hz and only on size-tier changes; per-frame motion via cheap attribute updates (feImage x/y or CSS variables), not canvas regeneration.
- Spaghettification mode: only touch `article` elements intersecting an expanded viewport rect (IntersectionObserver), restore styles when they leave the radius or on disable, never fight X's own virtualization (set transforms on a wrapper you control if X re-renders styles away).
- **Performance budget**: < 4 ms scripting per frame on a 2020 laptop. If a rolling frame-time average exceeds ~12 ms, auto-degrade: lens → spaghetti → overlay-only. Log the degradation once to console.
- Never intercept clicks, never modify/hide tweet text, never break scrolling. The hole annoys; it must not malfunction.

## Milestone 4 — Polish & shippability

- Handle SPA navigation (timeline re-acquire), theme variants (dark/dim/light), and the composer/modal overlays (suspend the filter while a modal is open — lensing a half-typed reply is hostile).
- README: how it works, privacy statement (no data leaves the machine), settings table, honest perf notes.
- Icons (16/48/128) — a simple black disc with photon ring is fine, generate programmatically.
- `npm run build` produces a loadable `dist/`; `npm run zip` produces a store-uploadable zip.

Start with Milestone 0 — do not build anything else until the rendering question is answered on the real site — then report which strategy won before continuing.
