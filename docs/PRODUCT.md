# event-horizon — product

## What it is
An anti-doomscrolling Chrome extension (Manifest V3) for X/Twitter. The longer you scroll X, the bigger a black hole grows inside the feed, gravitationally lensing the actual page content — real tweets visibly bend into the hole. Leave the site and it slowly starves and shrinks. The inverse of the viral Ghostty terminal shader (which grew while you worked): this hole feeds on procrastination.

Key framing: the effect must warp the REAL page — actual tweets displaced by the lens — not just a black circle drawn on top. The black disc/photon ring is an overlay, but the lensing displaces real rendered content.

## Features
- **Lensing renderer** — SVG `feDisplacementMap` driven by an offscreen-canvas displacement map; `LensRenderer` interface with `renderMode: "lens" | "spaghetti" | "auto"` (spaghettification = CSS transforms sucking whole tweets toward the hole, the CSP-proof fallback).
- **Mass tracking** (background worker) — `mass` (0..1) in `chrome.storage.local`; fed by 5 s activity heartbeats while tab visible+focused (scrolling accrues 1.5×); `mass = clamp(effectiveSeconds / (limitMinutes*60), 0, 1)` with smoothstep near 1.0; starves via `chrome.alarms` decay (half-life `decayHalfLifeMinutes`, default 10) when no X tab is active; persists across restarts.
- **Badge** — minutes on X today (resets local midnight); background shifts red as mass grows.
- **Hole overlay** — fixed full-viewport canvas: black event-horizon disc, photon ring, warm accretion glow, drawn chromatic fringe; drifts via time-based sines; eased mass changes; fades in below mass 0.05; zero work while tab hidden.
- **Options page** — `limitMinutes` (default 20), `decayHalfLifeMinutes`, `renderMode`, `maxCoverage` (default 35% of viewport at mass 1.0), `enabled`; live-apply via `storage.onChanged`.
- **Polish** — SPA navigation handling, theme variants, suspend filter while a modal/composer is open, README with privacy statement, programmatic icons, `npm run build` → `dist/`, `npm run zip` → store zip.

## Non-goals (explicitly out of scope for now)
- No analytics, telemetry, or network calls of any kind — all data stays local.
- No one-click reset button — closing the tab is the reset mechanism.
- No framework (React/etc.) — plain TypeScript + esbuild.
- No support for sites other than x.com / twitter.com.
- No blocking/hiding of content — the hole annoys; it must not malfunction or censor.
