# Publish checklist — event-horizon 1.0.0

> **OBSOLETE (2026-06-12, owner decision): no store submission planned —
> open-source, load-unpacked distribution only.** The "Verified
> automatically" table remains useful as the project's quality gate;
> the "Human must do" store steps no longer apply.

> **2026-06-12: scope changed to ALL http/https sites + WebGL overlay
> landed.** Rows touching scope (manifest-check, audit §2/§3) reflect the
> new policy; STORE-LISTING.md copy is stale and must be rewritten before
> submission (broad-host review track). A new soak run gates the change.

## Verified automatically (re-run before upload)

| Check | Evidence / command | Status (2026-06-12) |
|---|---|---|
| Mass model + graceMinutes remap, boundaries, validation clamp | `npm test` → 16/16 (test/mass.test.mjs) | ✅ |
| Manifest scope: storage+alarms only, two X origins only, scoped WAR, no `<all_urls>`/tabs/host_permissions | `npm test` → test/manifest-check.mjs (checks manifest.json AND dist/manifest.json) | ✅ |
| TypeScript clean | `npm run typecheck` | ✅ |
| Zero network / dynamic code / innerHTML in src and dist | greps in docs/SECURITY-AUDIT.md §1, §5 | ✅ |
| Message hardening (sender.id, shape+range validation, bounded influence) | docs/SECURITY-AUDIT.md §4; src/background.ts, src/messages.ts | ✅ |
| Spike harness gated + isTrusted, visual-only | docs/SECURITY-AUDIT.md §6 | ✅ |
| Zero runtime deps; `npm audit` 0 vulnerabilities; lockfile committed | docs/SECURITY-AUDIT.md §7 | ✅ |
| Below grace boundary: zero page presence (no canvas/filter/observers/rAF) | soak `SOAK:PASS below-grace baseline` | ✅ |
| Resource counts return to baseline across ×1000 renderer churns + ×12 full eased lifecycles (modal, enable/disable, SPA nav, starvation) at dpr=2 | test/soak-sandbox.html (run command in its header) → `SOAK:DONE PASS` | ✅ |
| Heap trend flat | soak: 9.5 MB → 9.5 MB over 33 samples (Δ0.0 MB) | ✅ |
| Version 1.0.0 in manifest + package.json | manifest.json, package.json | ✅ |
| `npm run zip` artifact extracts **identical** to dist/ (diff -r clean), manifest parses, icons present | this session: `unzip → diff -r dist` = identical | ✅ |
| Icons 16/48/128 generated and referenced (manifest `icons` + `action.default_icon`) | build.mjs → dist/assets/icon*.png | ✅ |
| Fallback store screenshot 1280×800 | `./tools/store-screenshot.sh` → store-screenshot.png | ✅ |
| README: install, settings table, privacy statement, perf notes, attribution + MIT | README.md, LICENSE | ✅ |
| Store copy ready to paste (title, descriptions, single-purpose, permission justifications, data-use) | docs/STORE-LISTING.md | ✅ |

## Human must do (in order)

1. **Fresh-profile install from the zip itself**: new Chrome profile →
   extract `event-horizon-1.0.0.zip` → Load unpacked from the *extracted*
   folder → scroll x.com past the grace period; hole appears, grows,
   warps; console free of `[event-horizon]` errors.
2. **Scope spot-check**: in that profile, visit two non-X sites — no
   `[event-horizon]` console lines, no overlay element (SECURITY-AUDIT §3).
3. **Multi-day memory soak at real settings**: leave an X tab open across
   normal use for 2–3 days; check Chrome Task Manager (⋮ → More tools)
   periodically — the x.com tab's memory should stay in its normal band,
   not climb monotonically. Include one **overnight hidden tab**: CPU 0,
   memory flat by morning.
4. **Post-soak error review**: `chrome://extensions` → event-horizon →
   "Errors" panel must be empty after the soak days.
5. **Real-feed capture**: screenshot (1280×800) and ideally a short
   recording of the hole devouring your actual feed — preferred over
   `store-screenshot.png` for the listing. Crop out personal info.
6. **Developer account**: pay the one-time $5 registration at
   https://chrome.google.com/webstore/devconsole.
7. **Dashboard forms**: create the item, upload `event-horizon-1.0.0.zip`,
   paste title/descriptions/single-purpose/permission justifications and
   the data-use declaration from docs/STORE-LISTING.md (privacy tab:
   "does not collect user data" — all answers are in that file).
8. **Submit for review.** Expected friction: none — minimal permissions,
   no host permissions, no remote code. If the reviewer asks why a PNG is
   web-accessible: it's the displacement-map fallback, scoped to the two
   X origins (SECURITY-AUDIT §2).
