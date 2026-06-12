# event-horizon

Chrome extension (MV3) that grows a gravitationally-lensing black hole inside the X/Twitter feed the longer you doomscroll; leaving the site starves it.

@docs/PRODUCT.md
@session-handoff.md

## Conventions
- Plain TypeScript bundled with esbuild — no framework. Typed throughout.
- Layout: `src/background.ts` (service worker), `src/content.ts` (+ helpers), `src/options.html/ts`, `manifest.json`, `assets/`.
- Work milestone by milestone (spec: event-horizon-chrome-prompt.md). After each milestone the extension must load cleanly via `chrome://extensions` → "Load unpacked" with zero console errors on x.com.

## Hard constraints (never violate)
- Permissions: `storage`, `alarms` only. No analytics, no network calls — all data stays local.
- Never intercept clicks, never modify/hide tweet text, never break scrolling.
- Apply SVG filters to the timeline column only — NOT `body` (breaks fixed-position elements and perf).
- Perf budget: < 4 ms scripting per frame; auto-degrade lens → spaghetti → overlay-only if rolling frame avg exceeds ~12 ms.
- Mass reset lives ONLY in the toolbar popup ("Reset the hole") — owner decision 2026-06-12, superseding the original "closing the tab is the only reset" rule. Never add reset affordances elsewhere (options page, content UI).
- Respect `prefers-reduced-motion`: static hole, no drift, no animation.
- X is a React SPA with virtualized scrolling: never assume the timeline container exists at injection time or survives navigation (MutationObserver + periodic re-acquire of `main[role="main"]`).

## Where to look
- Full spec & milestones: event-horizon-chrome-prompt.md
- Technical reference & gotchas: docs/ARCHITECTURE.md (read on demand)
