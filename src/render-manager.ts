// Milestone 3: ties the renderMode setting and live mass to an active
// renderer, and owns the perf-budget degrade ladder
// (lens → spaghetti → overlay-only).
//
// The HoleController calls frame(hole) inside its rAF loop and reports each
// frame's cost afterwards; this class decides which renderer (if any) should
// exist and swaps/disposes accordingly. Disposal restores every DOM side
// effect (column filter, tweet styles), so overlay-only / starved / modal-
// suspended all leave x.com untouched.

import type { Hole, LensRenderer } from "./renderer";
import { FilterLensRenderer, SpaghettiRenderer } from "./renderer";
import type { RenderMode } from "./settings";

const TAG = "[event-horizon]";

// A renderer exists only while the hole is actually visible. Hysteresis so a
// mass hovering at the threshold doesn't churn filter setup/teardown.
const ACTIVATE_MASS = 0.02;
const DEACTIVATE_MASS = 0.01;

// Perf budget (spec): < 4 ms scripting/frame; rolling avg above ~12 ms →
// degrade one rung. The cost metric is our scripting time plus how far the
// rAF interval overshot one 60 Hz frame — the SVG filter's raster cost shows
// up as missed vsync, never as JS time, so dt overshoot is the only signal
// we have for it.
const PERF_WINDOW = 48;
const DEGRADE_AVG_MS = 12;
const FRAME_INTERVAL_MS = 17.5;
const WARMUP_FRAMES = 30; // filter/map setup jank right after a swap isn't steady-state data
const MAX_SAMPLE_MS = 100; // tab restores and debugger pauses aren't perf data

type Kind = "lens" | "lens-packaged" | "spaghetti";
/** Degrade ladder; null = overlay-only (no renderer). */
const LADDER: (Kind | null)[] = ["lens", "spaghetti", null];

/** Debug pin from the spike panel. "off" = overlay-only. */
export type ForcedMode = "off" | Kind;

export class RenderManager {
  private mode: RenderMode = "auto";
  private rung = 0;
  private forced: ForcedMode | null = null;
  private renderer: LensRenderer | null = null;
  private kind: Kind | null = null;
  private samples: number[] = [];
  private warmup = WARMUP_FRAMES;

  setMode(mode: RenderMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.rung = this.baseRung(); // a deliberate mode change forgives past degradation
    this.resetPerf();
  }

  /** Debug only (spike panel) — pins the renderer, disables degrade. null releases. */
  force(mode: ForcedMode | null): void {
    this.forced = mode;
    this.rung = this.baseRung();
    this.resetPerf();
  }

  /** One-line state for the spike panel. */
  status(): string {
    const active = this.kind ?? "overlay-only";
    const why = this.forced
      ? "forced"
      : this.rung > this.baseRung()
        ? `${this.mode}, degraded`
        : this.mode;
    return `${active} [${why}]`;
  }

  private baseRung(): number {
    return (this.forced ?? this.mode) === "spaghetti" ? 1 : 0;
  }

  private desiredKind(hole: Hole): Kind | null {
    const kind = this.forced
      ? this.forced === "off"
        ? null
        : this.forced
      : (LADDER[this.rung] ?? null);
    if (!kind) return null;
    const threshold = this.kind !== null ? DEACTIVATE_MASS : ACTIVATE_MASS;
    return hole.mass < threshold ? null : kind;
  }

  /** Called by the controller every animation frame, after the overlay draw. */
  frame(hole: Hole): void {
    const kind = this.desiredKind(hole);
    if (kind !== this.kind) {
      this.renderer?.dispose();
      this.renderer =
        kind === "spaghetti"
          ? new SpaghettiRenderer()
          : kind
            ? new FilterLensRenderer(kind === "lens-packaged" ? "packaged" : "data")
            : null;
      this.kind = kind;
      this.resetPerf();
    }
    this.renderer?.frame(hole);
  }

  /** Undo all DOM side effects; next frame() recreates lazily. */
  suspend(): void {
    this.renderer?.dispose();
    this.renderer = null;
    this.kind = null;
    this.resetPerf();
  }

  /**
   * Perf feed from the controller's rAF loop: our scripting time this frame
   * and the raw rAF delta. Degrading is unconditional across render modes —
   * the < 12 ms budget is a hard constraint, not a preference — but a debug
   * pin (spike panel) disables it so tuning sessions aren't yanked away.
   */
  recordFrame(scriptMs: number, dtMs: number): void {
    if (!this.renderer || this.forced) return;
    if (this.warmup > 0) {
      this.warmup--;
      return;
    }
    if (dtMs > MAX_SAMPLE_MS) return;
    this.samples.push(scriptMs + Math.max(0, dtMs - FRAME_INTERVAL_MS));
    if (this.samples.length < PERF_WINDOW) return;
    const avg = this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
    this.samples.length = 0;
    if (avg <= DEGRADE_AVG_MS || this.rung >= LADDER.length - 1) return;
    const from = LADDER[this.rung];
    this.rung++;
    console.info(
      `${TAG} perf degrade: ${from} → ${LADDER[this.rung] ?? "overlay-only"} ` +
        `(avg frame cost ${avg.toFixed(1)} ms over ${PERF_WINDOW} frames)`,
    );
  }

  private resetPerf(): void {
    this.samples.length = 0;
    this.warmup = WARMUP_FRAMES;
  }
}
