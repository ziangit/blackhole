# Manual test script — Milestones 1 & 2

Setup: `chrome://extensions` → reload **event-horizon** (or Load unpacked → `dist/`).
Open the extension options page (Details → Extension options) in one window — its
`hole mass N% · M min on X today` status line updates live and is the instrument
for everything below.

## 1. Feeding & badge (M1)
1. Open x.com and scroll actively for ~2 minutes.
2. Expect: options status climbs (scrolling ≈ 1.5× the idle rate — at the default
   20-min limit, ~2 min of doomscrolling ≈ 15%); badge shows minutes today after
   the first full minute, background drifting slate→red.
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
16. Confirm there is no reset button anywhere; closing the X tab(s) and waiting
    is the only way to starve it.

Throughout: the console must stay free of `[event-horizon]` errors (spike panel
and its logs appear only with `?bhspike` / Ctrl+Shift+B).
