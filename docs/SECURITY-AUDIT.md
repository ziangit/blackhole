# Security & privacy audit — event-horizon 1.0.0

Audited 2026-06-12 ahead of Chrome Web Store submission. Every claim below
has a reproduction command; re-run them after any change that touches the
listed files. The automated subset runs in `npm test`
(test/manifest-check.mjs) and the soak harness (test/soak-sandbox.html).

## 1. Zero network

**Claim: no code path can send or receive data over the network.**

```
grep -rnE "fetch\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource" src/   → no matches
grep -rnE "\beval\(|new Function|importScripts|import\(" src/              → no matches
grep -rnE "https?://" src/ | grep -v "x.com|twitter.com|w3.org"            → no matches
grep -cE "fetch\(|XMLHttpRequest|WebSocket|sendBeacon|new Function|\beval\(" dist/*.js → 0 0 0
```

- No remote scripts; all JS is bundled at build time by esbuild.
- The only non-code resource is `assets/displacement.png`, generated at
  build time by `tools/gen-displacement.mjs` (pure math, no inputs).
- The lens map is a `data:` URL produced from an offscreen canvas of
  locally computed pixels — no external image sources.

## 2. Permission minimization

Manifest requests exactly `storage` + `alarms`. No `host_permissions`, no
`optional_permissions`, no `tabs`, no `<all_urls>`, no
`externally_connectable`. `web_accessible_resources` exposes one PNG,
scoped with `matches` to the two X origins only.

**Enforced automatically**: `test/manifest-check.mjs` (part of `npm test`)
asserts all of the above against both `manifest.json` and
`dist/manifest.json` and fails the build otherwise.

- `storage` — settings + the hole's mass state, all local.
- `alarms` — the 1-minute decay tick (must survive MV3 worker death).

## 3. Injection scope

Content script matches are exactly `https://x.com/*` and
`https://twitter.com/*` (asserted by manifest-check). **Human verification
for the reviewer**: install, visit any non-X site, open DevTools — no
`[event-horizon]` console lines, `document.getElementById("event-horizon-overlay")`
is null, no extension entries under Sources → Content scripts.

## 4. Message passing

One message type crosses the content→worker boundary: the heartbeat.

- The worker's `onMessage` handler rejects senders where
  `sender.id !== chrome.runtime.id` (src/background.ts). With no
  `externally_connectable` key, other extensions/pages can't reach it
  anyway — this is defense in depth.
- Shape + range validation in `isHeartbeat` (src/messages.ts): `type`
  must match, `scrollDelta` must be a finite number in [0, 1e7).
- **Bounded influence of hostile values**: `scrollDelta` only feeds a
  boolean (`≥ 150 px` ⇒ 1.5× accrual rate) — magnitude beyond the
  threshold is irrelevant. Time credit is computed worker-side from
  wall-clock elapsed, capped at one heartbeat interval (5 s) per accrual
  (`accrueHeartbeat`), and decay steps are capped at 15 minutes
  (`MAX_DECAY_STEP_MINUTES`). A malicious page script could at most make
  its own tab count as "scrolling" — it cannot inflate time, move the
  clock, or escape the [0,1] mass clamp.
- No other handlers exist; the options page and content script communicate
  through `chrome.storage.onChanged` (data, not code).

## 5. DOM safety & content privacy

```
grep -rn "innerHTML|insertAdjacentHTML|outerHTML" src/ → no matches
```

All UI (options page, spike panel) is built with
`createElement`/`textContent`; the only `textContent` writes are our own
labels. **The extension never reads tweet text**: the renderers touch
geometry only — `getBoundingClientRect()`, `style.transform/filter` on
`<article>` elements (SpaghettiRenderer), and an SVG filter applied to the
column element (FilterLensRenderer). Nothing reads `textContent`,
`innerText`, attributes, or input values from page content; nothing is
stored beyond `{settings, state}` in `chrome.storage.local`. This claim
backs the privacy statement in README/STORE-LISTING.

## 6. Debug (spike) harness

- Activation requires `?bhspike` in the URL or a **trusted** Ctrl+Shift+B
  keydown — synthetic `KeyboardEvent`s from page scripts are rejected via
  `isTrusted` (src/spike.ts).
- Without activation the spike contributes two passive listeners and no
  logging, no DOM, no timers.
- Worst case if a page activates it anyway (it controls its own URL, so
  `?bhspike` is page-controlled): the panel and mass-override slider are
  **visual-only and local** — the override lives in a content-script
  variable, is never persisted, never leaves the tab, and bypasses
  nothing but the visual mass. The page could equally just draw its own
  black circle; no privileged capability is exposed. Accepted.

## 7. Supply chain

- Runtime dependencies: **none** (`"dependencies"` absent from
  package.json; dist/*.js contain only our bundled code).
- devDependencies: esbuild, typescript, @types/chrome — `npm audit`:
  **0 vulnerabilities** (2026-06-12).
- `package-lock.json` committed.

## Memory / resource verification (companion)

See `test/soak-sandbox.html` (run command in its header, dpr=2): live
resource accounting (src/diag.ts) across canvas / SVG filter / observers /
intervals / rAF loops, churned ×1000 (renderer lifecycle, SPA nav) and ×12
(full eased lifecycle incl. modal + enable/disable). Result 2026-06-12:
all counts return to baseline after every cycle; heap median flat
(9.5 MB → 9.5 MB over 33 samples). Below the grace boundary the page is
completely untouched (zero canvases/filters/observers, no rAF).

Idle behavior: with no X tab open, the only scheduled work is the
1-minute `chrome.alarms` decay tick; the MV3 worker is otherwise inactive
(verify at chrome://serviceworker-internals — "stopped" between ticks).
With an X tab hidden, the controller cancels its rAF loop
(`visibilitychange` → stop(); `rafLoop` diag count drops to 0) and the
heartbeat interval sends nothing.
