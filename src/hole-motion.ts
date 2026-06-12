// The hole is supposed to HINDER, which means staying where the content is:
// horizontally it is anchored to the FEED COLUMN (overshooting its edges by
// ~25% of its width), vertically it roams the full viewport height. Each
// axis sums three incommensurate sines (quasi-random Lissajous wander —
// never visibly repeats) with periods of ~9–30 s, so it sweeps the feed in
// tens of seconds. Two earlier mistakes, kept for the record: 57–217 s
// periods parked it near a path extreme for a minute ("drifted into a
// corner and died"), and roaming the whole viewport sent it over the dark
// sidebars where a black disc is invisible and the column filter has
// nothing to warp ("it disappeared"). A hard clamp keeps ≥ ~80% of the
// disc on screen — "can't find it" is worse than "not annoying enough".
// Respects prefers-reduced-motion: static center over the feed, no drift.
//
// (The clamp now keeps the disc FULLY visible: after the second "it went
// off-screen" report, any off-screen lean loses more than it gains.)

export class HoleMotion {
  readonly reduced = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  position(
    nowMs: number,
    columnRect: DOMRect | null,
    discRadius: number,
  ): { x: number; y: number } {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const cx = columnRect ? columnRect.left + columnRect.width / 2 : w / 2;
    if (this.reduced) return { x: cx, y: h / 2 };
    const t = nowMs / 1000;
    const mx = Math.min(discRadius + 12, w / 2);
    const my = Math.min(discRadius + 12, h / 2);
    const ax = columnRect ? columnRect.width * 0.6 : w * 0.25;
    const ay = Math.max(0, h / 2 - my);
    let wx =
      0.5 * Math.sin(t * 0.43) +
      0.35 * Math.sin(t * 0.211 + 1.7) +
      0.15 * Math.sin(t * 0.083 + 4.1);
    let wy =
      0.5 * Math.sin(t * 0.331 + 0.9) +
      0.35 * Math.sin(t * 0.157 + 4.2) +
      0.15 * Math.sin(t * 0.071 + 2.3);
    // Bound the wander to an ellipse: both axes can't peak at once, so the
    // screen corners are geometrically unreachable.
    const n = Math.hypot(wx, wy);
    if (n > 1) {
      wx /= n;
      wy /= n;
    }
    return {
      x: Math.min(Math.max(cx + wx * ax, mx), w - mx),
      y: h / 2 + wy * ay,
    };
  }
}
