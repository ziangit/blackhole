# Chrome Web Store listing — ready to paste

> **OBSOLETE (2026-06-12, owner decision): the extension will NOT be
> published to the Chrome Web Store** — it ships as an open-source
> load-unpacked project only. Kept for reference in case that changes.

## Title

event-horizon — anti-doomscrolling black hole for X

## Short description (132 chars max)

The longer you scroll X, the bigger a black hole grows in your feed —
bending real tweets into it. Leave, and it starves.

## Full description

A black hole grows inside your X/Twitter feed the longer you scroll.

It starts invisibly. After a grace period you choose (default 5 minutes),
a small black hole appears in your timeline — gravitationally lensing the
page, with real tweets visibly bending, swirling, and rainbow-fringing
into it. Keep scrolling and it grows until it's devouring a third of your
screen, drifting across the feed, ringed by a glowing accretion orbit.

It never blocks you. It never hides anything permanently, never intercepts
a click, never breaks scrolling. It just makes the cost of one more
doomscroll *visible* — and increasingly inconvenient.

Leave X and the hole starves: its accumulated time halves every 10 minutes
(configurable), and below the grace boundary it disappears completely.
Closing the tab is the reset. There is deliberately no reset button.

Everything is configurable: when it appears, how fast it grows, how big it
gets, how fast it starves, and the render style (true lens warp, or a
cheaper "spaghettification" mode that stretches whole tweets into the
hole). The toolbar badge shows your minutes on X today.

Private by construction: runs only on x.com/twitter.com, reads no tweet
content (geometry only), and contains no network code whatsoever — no
analytics, no telemetry, nothing leaves your machine. Source available
under MIT.

Inspired by s13k's ghostty-blackhole (a Ghostty terminal shader where a
black hole grows the longer you work) — this extension inverts the idea:
the hole feeds on doomscrolling instead.

## Single-purpose statement

Visual break reminder for x.com.

## Permission justifications

- **storage** — saves user settings and the hole's state locally.
- **alarms** — shrinks the hole over time while you're away (a 1-minute
  decay tick that must survive the service worker being suspended).

## Data-use declaration

This extension collects nothing and transmits nothing. It does not read
tweet content. The only stored data is user settings and a single
local-only "mass" value in chrome.storage.local. No analytics, no remote
code, no network requests of any kind.

## Category / misc

- Category: Productivity (or Fun — Productivity recommended)
- Language: English
- Screenshots: 1280×800 (see tools/store-screenshot.sh for the sandbox
  fallback; a real x.com capture is preferred — see PUBLISH-CHECKLIST.md)
