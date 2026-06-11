// X is a React SPA with virtualized scrolling and client-side navigation:
// the timeline container may not exist at injection time and does not
// survive navigation. Always re-acquire; never cache across navigations.

export function acquireColumn(): HTMLElement | null {
  const main = document.querySelector<HTMLElement>('main[role="main"]');
  if (!main) return null;
  return main.querySelector<HTMLElement>('[data-testid="primaryColumn"]') ?? main;
}
