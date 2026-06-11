// Drift within the feed column: slow time-based sines with different x/y
// frequencies (two octaves each so the path never looks like a Lissajous
// loop). Amplitude is clamped so the disc stays inside the column
// horizontally. Respects prefers-reduced-motion: static center, no drift.

export class HoleMotion {
  readonly reduced = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  position(
    nowMs: number,
    columnRect: DOMRect | null,
    discRadius: number,
  ): { x: number; y: number } {
    const cx = columnRect
      ? columnRect.left + columnRect.width / 2
      : window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    if (this.reduced) return { x: cx, y: cy };
    const t = nowMs / 1000;
    const ax = columnRect
      ? Math.max(0, columnRect.width / 2 - discRadius - 24)
      : 60;
    const ay = window.innerHeight * 0.16;
    return {
      x: cx + (Math.sin(t * 0.11) * 0.7 + Math.sin(t * 0.043 + 1.7) * 0.3) * ax,
      y: cy + (Math.sin(t * 0.071 + 0.9) * 0.7 + Math.sin(t * 0.029 + 4.2) * 0.3) * ay,
    };
  }
}
