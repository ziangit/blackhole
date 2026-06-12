// The mass model, as pure functions: persisted state in, new state out.
// Nothing here may depend on worker-instance memory — the MV3 service
// worker can be killed between any two events, and decay must still be
// correct when the next alarm wakes a fresh worker (it catches up over the
// full elapsed gap, including browser-closed time). Unit tests:
// test/mass.test.mjs.

import type { Settings } from "./settings";

export const HEARTBEAT_SEC = 5;
export const SCROLL_MEANINGFUL_PX = 150;
export const SCROLL_MULTIPLIER = 1.5;
/** A heartbeat within this window means "an X tab is active": no decay. */
export const ACTIVE_WINDOW_MS = 60_000;
/**
 * dt-cap for clock skew / system sleep: a single decay step never integrates
 * more than this, so waking a laptop doesn't instantly starve the hole by
 * hours. While the machine is awake the alarm ticks every minute, far below
 * the cap, so normal decay (and "off X ~30 min → gone") is unaffected.
 */
export const MAX_DECAY_STEP_MINUTES = 15;

export interface HoleState {
  effectiveSeconds: number;
  /** Derived from effectiveSeconds; persisted so readers never recompute. */
  mass: number;
  /** Epoch ms; doubles as the last-accrual time (the dedupe window). */
  lastHeartbeatAt: number;
  lastDecayAt: number;
  /** Local YYYY-MM-DD owning daySeconds; badge counter resets on change. */
  dayKey: string;
  daySeconds: number;
}

export function emptyState(): HoleState {
  return {
    effectiveSeconds: 0,
    mass: 0,
    lastHeartbeatAt: 0,
    lastDecayAt: 0,
    dayKey: "",
    daySeconds: 0,
  };
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

// Linear growth with a smoothstep push above raw 0.7: the endgame
// accelerates and full mass lands slightly before the nominal limit.
// appearAfterMinutes is a grace period: the hole stays at mass 0 until
// you've fed it that long, THEN grows over the next limitMinutes. Decay
// shrinks the same budget, so leaving X re-earns the grace period too.
export function computeMass(
  effectiveSeconds: number,
  limitMinutes: number,
  appearAfterMinutes = 0,
): number {
  const raw = clamp(
    (effectiveSeconds - appearAfterMinutes * 60) / (limitMinutes * 60),
    0,
    1,
  );
  return clamp(raw + 0.18 * smoothstep(0.7, 1, raw), 0, 1);
}

/**
 * Accrue one heartbeat. Dedupe across tabs: credit the wall-clock elapsed
 * since the last accrual from ANY tab (capped at one heartbeat interval
 * after a gap), so two visible X tabs sum to real time, never 2×.
 */
export function accrueHeartbeat(
  state: HoleState,
  settings: Settings,
  now: number,
  scrollDelta: number,
  dayKey: string,
): HoleState {
  const elapsed =
    state.lastHeartbeatAt > 0
      ? (now - state.lastHeartbeatAt) / 1000
      : HEARTBEAT_SEC;
  const credit =
    elapsed <= 0 ? 0 : elapsed > HEARTBEAT_SEC * 2 ? HEARTBEAT_SEC : elapsed;
  const rate = scrollDelta >= SCROLL_MEANINGFUL_PX ? SCROLL_MULTIPLIER : 1;
  const appear = settings.appearAfterMinutes ?? 0;
  // Cap at grace + limit so an hours-long binge doesn't take hours to decay.
  const effectiveSeconds = Math.min(
    state.effectiveSeconds + credit * rate,
    (appear + settings.limitMinutes) * 60,
  );
  return {
    effectiveSeconds,
    mass: computeMass(effectiveSeconds, settings.limitMinutes, appear),
    lastHeartbeatAt: now,
    lastDecayAt: state.lastDecayAt,
    dayKey,
    daySeconds: (state.dayKey === dayKey ? state.daySeconds : 0) + credit,
  };
}

/**
 * One decay tick (alarm or startup catch-up). No-op while any X tab has
 * heartbeated within ACTIVE_WINDOW_MS; otherwise exponential decay over the
 * REAL elapsed time since the last tick/heartbeat — a killed worker or a
 * closed browser decays the full gap on the next wake.
 */
export function decayTick(
  state: HoleState,
  settings: Settings,
  now: number,
  dayKey: string,
): HoleState {
  const daySeconds = state.dayKey === dayKey ? state.daySeconds : 0;
  if (
    state.lastHeartbeatAt > 0 &&
    now - state.lastHeartbeatAt < ACTIVE_WINDOW_MS
  ) {
    return { ...state, lastDecayAt: now, dayKey, daySeconds };
  }
  const from = Math.max(state.lastDecayAt, state.lastHeartbeatAt);
  const minutes =
    from > 0 ? Math.min((now - from) / 60_000, MAX_DECAY_STEP_MINUTES) : 0;
  if (minutes <= 0) return { ...state, lastDecayAt: now, dayKey, daySeconds };
  let effectiveSeconds =
    state.effectiveSeconds * 0.5 ** (minutes / settings.decayHalfLifeMinutes);
  if (effectiveSeconds < 0.5) effectiveSeconds = 0;
  return {
    effectiveSeconds,
    mass: computeMass(
      effectiveSeconds,
      settings.limitMinutes,
      settings.appearAfterMinutes ?? 0,
    ),
    lastHeartbeatAt: state.lastHeartbeatAt,
    lastDecayAt: now,
    dayKey,
    daySeconds,
  };
}
