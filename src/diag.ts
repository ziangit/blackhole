// Live resource accounting for leak verification (see docs/SECURITY-AUDIT
// and the soak harness). Shipped but inert: plain counters, no logging, no
// timers — only the ?bhspike panel and the test sandbox read them.
// Contract: every resource class we create increments on create and
// decrements on dispose; after any full lifecycle churn (renderer swap,
// modal, navigation, starvation) every churn-class count returns to its
// baseline. App-lifetime singletons (listeners registered once at
// injection) increment and never decrement — their baseline is constant.

export type DiagKind =
  | "canvas"
  | "svgFilter"
  | "intersectionObserver"
  | "mutationObserver"
  | "interval"
  | "rafLoop"
  | "listener";

export const diagCounts: Record<DiagKind, number> = {
  canvas: 0,
  svgFilter: 0,
  intersectionObserver: 0,
  mutationObserver: 0,
  interval: 0,
  rafLoop: 0,
  listener: 0,
};

export function diagInc(kind: DiagKind): void {
  diagCounts[kind]++;
}

export function diagDec(kind: DiagKind): void {
  diagCounts[kind]--;
}

export function diagSummary(): string {
  const parts = Object.entries(diagCounts).map(([k, v]) => `${k}=${v}`);
  const mem = (
    performance as { memory?: { usedJSHeapSize: number } }
  ).memory;
  if (mem) parts.push(`heapMB=${(mem.usedJSHeapSize / 1048576).toFixed(1)}`);
  return parts.join(" ");
}
