// X is a React SPA with virtualized scrolling and client-side navigation:
// the timeline container may not exist at injection time and does not
// survive navigation. Always re-acquire; never cache across navigations.
//
// Selector robustness: X renames data-testids periodically. If
// primaryColumn doesn't match, climb from an actual tweet (<article>) to
// its widest column-shaped ancestor (≤ 760 px — the timeline column is
// ~600). Falling back to bare `main` is the LAST resort and is dangerous:
// main includes the right sidebar, so its center is right-of-viewport
// center — anchoring the hole to it parks the hole at the right edge
// (user-reported). HoleMotion has a width plausibility guard for exactly
// that case.

export function acquireColumn(): HTMLElement | null {
  const main = document.querySelector<HTMLElement>('main[role="main"]');
  if (!main) return null;
  const primary = main.querySelector<HTMLElement>(
    '[data-testid="primaryColumn"]',
  );
  if (primary) return primary;
  const article = main.querySelector<HTMLElement>("article");
  if (article) {
    let el: HTMLElement | null = article;
    let best: HTMLElement | null = null;
    while (el && el !== main) {
      const w = el.offsetWidth;
      if (w > 0 && w <= 760) best = el;
      el = el.parentElement;
    }
    if (best) return best;
  }
  return main;
}
