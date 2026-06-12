// Content-column acquisition. Originally X-only; since the all-web scope
// change this must work on ARBITRARY sites, where the rules are:
// - Prefer the page's main content column (that's what the hole hinders
//   and what the lens filter warps).
// - NEVER return something close to the full viewport width: filtering a
//   page-wide container breaks fixed-position descendants (SVG filters
//   create a containing block) and tanks perf — the original "never
//   filter body" hard constraint, generalized.
// - Returning null is FINE: the renderers skip their work and the hole
//   runs overlay-only on that page. Safe beats warped.
// Pages are SPAs more often than not: never cache across navigations;
// callers re-acquire via isConnected checks + periodic polls.

export function acquireColumn(): HTMLElement | null {
  const main =
    document.querySelector<HTMLElement>('main[role="main"]') ??
    document.querySelector<HTMLElement>("main");
  // X fast path (testids churn — see the article-climb fallback below)
  const primary = main?.querySelector<HTMLElement>(
    '[data-testid="primaryColumn"]',
  );
  if (primary) return primary;

  const root = main ?? document.body;
  if (!root) return null;
  const maxW = Math.min(window.innerWidth * 0.85, 1100);

  // Climb from a representative content block to its widest column-shaped
  // ancestor. <article> first (feeds, blogs), then a paragraph.
  const seed =
    root.querySelector<HTMLElement>("article") ??
    root.querySelector<HTMLElement>("p");
  if (seed) {
    let el: HTMLElement | null = seed;
    let best: HTMLElement | null = null;
    while (el && el !== document.body && el !== document.documentElement) {
      const w = el.offsetWidth;
      if (w > 200 && w <= maxW) best = el;
      el = el.parentElement;
    }
    if (best) return best;
  }
  if (main && main.offsetWidth > 200 && main.offsetWidth <= maxW) return main;
  return null; // overlay-only here — never risk a page-wide filter target
}
