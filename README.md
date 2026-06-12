# event-horizon

An anti-doomscrolling black hole for the web (Chrome extension, Manifest
V3 — born on X/Twitter, now runs on every site). The longer you browse,
the bigger a black hole grows inside the page — gravitationally lensing
the actual content, with real page elements bending and swirling into it,
ringed by a GLSL-rendered accretion disc and lensed starfield. Step away
and it slowly starves and shrinks. Closing the tab is the reset; there is
deliberately no reset button.

Inspired by [s13k's ghostty-blackhole](https://github.com/s0xDk/ghostty-blackhole) —
a Ghostty shader where a black hole grows the longer you *work*. This
extension inverts the idea: the hole feeds on doomscrolling instead.

## Install

From the Chrome Web Store: search "event-horizon" (pending review), or
load it yourself:

1. `npm install && npm run build`
2. Open `chrome://extensions`, enable **Developer mode**
3. **Load unpacked** → select the `dist/` folder
4. Visit x.com and start scrolling. The toolbar badge counts your minutes
   on X today.

## How it works

A background service worker tracks *effective time* on X — 5-second
heartbeats while a tab is visible and focused, with active scrolling
counting 1.5×. That time drives a mass value (0→1). After a grace period
the hole appears in your feed, drifts around it, and grows; the page is
warped by an SVG displacement filter (real content, really bent — with
chromatic aberration), plus a drawn event-horizon disc, photon ring,
tilted accretion orbit, and an orbiting hotspot. When no X tab is active,
mass decays exponentially; fall back below the grace boundary and the hole
vanishes entirely.

## Settings

Right-click the toolbar icon → Options. Changes apply live.

| Setting | Default | Meaning |
|---|---|---|
| Enabled | on | Master switch. Off = no tracking, no hole. |
| Minutes of scrolling before the hole appears | 5 | Grace period. The hole is completely absent (zero page changes) until this much effective time. Must be below the full-size limit; the UI clamps it. |
| Minutes until the hole reaches full size | 20 | Total effective time (including the grace period) at which the hole hits maximum size. |
| Starvation half-life (minutes) | 10 | Off X, the hole's accumulated time halves this often. ~30 min away ≈ gone. |
| Render mode | auto | `auto`/`lens`: SVG displacement warp (with auto-degrade under load). `spaghetti`: whole tweets get pulled and stretched instead (cheaper). |
| Max coverage | 35% | How much of the viewport the hole's influence may eat at full mass. |

## Privacy

- Runs on http/https pages (match patterns checked by an automated test);
  below your grace threshold it leaves every page **completely
  untouched** — no DOM, no filters, no animation (asserted by an
  automated soak).
- **Reads no page content.** The renderers touch geometry only: element
  rectangles, CSS transforms, and an SVG filter. Nothing reads any text
  from any page.
- **No data leaves your machine.** There is no network code at all — no
  fetch, no XHR, no analytics, no telemetry. The only stored data is your
  settings and the hole's mass, in `chrome.storage.local`.
- Permissions: `storage` (settings + mass, local) and `alarms` (the
  1-minute decay tick). Nothing else.

See `docs/SECURITY-AUDIT.md` for the full audit with reproduction
commands.

## Performance, honestly

- **At rest** (hole below the grace boundary, or tab hidden): nothing — no
  canvas, no filter, no animation loop. A 5-second heartbeat timer is the
  only activity in a visible tab; a hidden tab does no per-frame work.
  Roughly ~10 MB of JS heap.
- **While the hole is visible**: a full-viewport canvas plus an SVG
  displacement filter over the feed column. Ambient motion is capped at
  ~30 fps to keep GPU raster load (and laptop heat) down; scrolling
  renders at full rate so the warp stays locked to the page.
- The lens (especially its chromatic aberration) is GPU-raster heavy. If
  the average frame cost exceeds budget, the extension **degrades itself**:
  lens → spaghetti → overlay-only, logged once in the console.
- Long-session safety is enforced by an automated soak (resource counts
  return to baseline across 1000+ lifecycle churns; flat heap trend) —
  see `test/soak-sandbox.html`.

## Development

```
npm install
npm run build      # → dist/ (Load unpacked)
npm run watch      # rebuild on change
npm test           # mass-model unit tests + manifest scope check
npm run typecheck
npm run zip        # → event-horizon-<version>.zip (store upload)
```

Architecture notes and the accumulated gotchas live in
`docs/ARCHITECTURE.md`; manual test script in `docs/MANUAL-TESTS.md`.

## License

[MIT](LICENSE).
