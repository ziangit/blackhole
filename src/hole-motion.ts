// The hole is supposed to HINDER: it roams the whole viewport, not just the
// feed column. Each axis sums three incommensurate sines (quasi-random
// Lissajous wander — never visibly repeats) with periods of ~9–30 s, so it
// crosses the screen in tens of seconds. The original two-octave drift had
// 57–217 s periods and sat near a path extreme for a minute at a time —
// that read as "drifted into a corner and died".
// Respects prefers-reduced-motion: static center over the feed, no drift.

export class HoleMotion {
  readonly reduced = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  position(
    nowMs: number,
    columnRect: DOMRect | null,
    discRadius: number,
  ): { x: number; y: number } {
    if (this.reduced) {
      return {
        x: columnRect
          ? columnRect.left + columnRect.width / 2
          : window.innerWidth / 2,
        y: window.innerHeight / 2,
      };
    }
    const t = nowMs / 1000;
    // Amplitude reaches to within `margin` of the viewport edges — at the
    // extremes up to ~30% of the disc may hang off-screen (annoying is the
    // point), but most of it stays visible.
    const margin = discRadius * 0.7 + 30;
    const ax = Math.max(0, window.innerWidth / 2 - margin);
    const ay = Math.max(0, window.innerHeight / 2 - margin);
    const wx =
      0.5 * Math.sin(t * 0.43) +
      0.35 * Math.sin(t * 0.211 + 1.7) +
      0.15 * Math.sin(t * 0.083 + 4.1);
    const wy =
      0.5 * Math.sin(t * 0.331 + 0.9) +
      0.35 * Math.sin(t * 0.157 + 4.2) +
      0.15 * Math.sin(t * 0.071 + 2.3);
    return {
      x: window.innerWidth / 2 + wx * ax,
      y: window.innerHeight / 2 + wy * ay,
    };
  }
}
