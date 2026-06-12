# Manual test script — Milestones 1, 2 & 3

Setup: `chrome://extensions` → reload **event-horizon** (or Load unpacked → `dist/`).
Open the extension options page (Details → Extension options) in one window — its
`hole mass N% · M min on X today` status line updates live and is the instrument
for everything below.

> **1.0.0 note:** the default `graceMinutes` is 5 — the hole (and mass %) stays
> at zero for the first ~5 effective minutes. For the timing tests below either
> set "Minutes before the hole appears" to 0 in options, or read "mass climbs"
> as "minutes today climbs" until past the grace boundary.

## 1. Feeding & badge (M1)
1. Open x.com and scroll actively for ~2 minutes.
2. Expect: options status climbs (scrolling ≈ 1.5× the idle rate); badge shows
   minutes today after the first full minute, background drifting slate→red.
3. Stop scrolling but keep the tab focused ~1 min: mass still climbs, slower.

## 2. Visibility gating (M1)
4. Switch to a different tab for 2 min → mass must NOT climb (after 1 min it
   starts decaying). Same for an unfocused window.

## 3. Multi-tab dedupe (M1)
5. Two x.com tabs side-by-side in separate windows, both visible — note mass,
   wait 2 min, verify the gain matches step 1's single-tab rate, not double.

## 4. Decay survives worker death (M1)
6. Feed the hole to ~50%, note mass and time. Close all X tabs.
7. `chrome://serviceworker-internals` → event-horizon → **Stop** (or wait ~30 s
   for "service worker (inactive)" on chrome://extensions).
8. Wait 10 min. Expect: status has halved (~25%) — the alarm woke dead workers
   and decayed on schedule. Variant: quit Chrome for 10 min; on relaunch the
   startup catch-up applies immediately.
9. Sleep-cap spot check (optional): feed the hole, sleep the laptop 1+ hour,
   wake — mass should be reduced but alive (one 15-min-capped step, then normal
   decay), not instantly zero.

## 5. Overlay visuals & motion (M2)
10. Open `https://x.com/home?bhspike`, tick the checkbox in the bottom-right
    panel, drag the mass slider: disc + ring + glow + fringe scale smoothly
    0→1; at 1.0 the disc covers ~35% of the viewport.
11. Watch ~30 s at mass 0.5: the hole drifts slowly within the feed column,
    never popping. Flick-scroll: disc stays viewport-fixed.
12. Uncheck the override; the hole eases back to tracked mass (no pop). With
    real mass near zero, verify nothing is visible until ~0.05 (fade-in).
13. Hide the tab: tab CPU idles at 0 in Chrome's Task Manager (rAF stopped).
14. Reduced motion: macOS Accessibility → Display → Reduce motion ON, reload
    x.com — hole renders static, updates only as mass changes.

## 6. Options live-apply (M1)
15. With the hole visible, change Max coverage 35→15% — disc shrinks within a
    second, no reload. Toggle Enabled off — hole eases out, heartbeats stop;
    back on — resumes.
16. (Updated 2026-06-12) The ONLY reset affordance is "Reset the hole" in the
    toolbar popup: it zeroes banked time (hole starves instantly) but keeps
    today's badge minutes. Confirm no reset exists anywhere else.

## 7. Lensing integration (M3)
17. Open `https://x.com/home?bhspike`, tick the override, set mass ~0.5. With
    render mode `auto`/`lens` (the default): tweets visibly BEND around the
    photon ring — real content displaced, not just a disc on top. Scroll: the
    warp stays pixel-locked to the disc (no lag/swim during fast flicks).
18. Spike panel `live :` line should read `lens [auto]`. Ctrl+Shift+B to
    `spaghetti`: whole tweets get sucked toward the hole (translate + rotate +
    shrink + blur), no SVG filter. Cycle to `overlay-only`: feed back to
    normal, disc remains. Cycle to `off`: releases back to the options
    setting.
19. Options → Render mode `spaghetti` (no spike pin): same as 18 but driven
    by settings; switch back to `auto` — lens returns within a second.
20. Clicks/links/scrolling must work normally in every mode, including
    directly through the warped region. Tweet text is never hidden or edited.
21. Navigate Home → a profile → back (SPA nav, no reload): effect re-attaches
    to the new timeline within ~1 s, no console errors, no stuck transforms
    on the old page's tweets.
22. Modal suspension: with the hole visible, open the composer (or click a
    photo). The hole + warp ease out within ~2 s — a half-typed reply is
    never lensed. Close it: the hole eases back. Mass keeps accruing while
    the modal is open (check the options status line).
23. Perf degrade (best-effort): DevTools → Performance → CPU 6× slowdown,
    mass high, scroll hard for ~10 s. Expect at most ONE
    `[event-horizon] perf degrade: lens → spaghetti …` info log and the live
    line flipping to `spaghetti [auto, degraded]` (then possibly
    overlay-only). Changing Render mode in options resets the degradation.

Throughout: the console must stay free of `[event-horizon]` errors (spike panel
and its logs appear only with `?bhspike` / Ctrl+Shift+B).
