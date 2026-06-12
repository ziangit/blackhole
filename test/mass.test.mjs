// Unit tests for the pure mass model. `npm test` bundles src/mass.ts to
// .mass.bundle.mjs first (no TS test runner needed).
import test from "node:test";
import assert from "node:assert/strict";
import {
  accrueHeartbeat,
  computeMass,
  decayTick,
  emptyState,
  HEARTBEAT_SEC,
  MAX_DECAY_STEP_MINUTES,
} from "./.mass.bundle.mjs";

const SETTINGS = {
  enabled: true,
  limitMinutes: 20,
  decayHalfLifeMinutes: 10,
  renderMode: "auto",
  maxCoverage: 0.35,
};
const DAY = "2026-06-11";
const T0 = 1_780_000_000_000;

function feed(state, { tabs = 1, seconds = 60, scroll = 0, start = T0 } = {}) {
  // Each tab beats every 5 s; interleave them like real timers would.
  const beats = [];
  for (let tab = 0; tab < tabs; tab++) {
    for (let t = HEARTBEAT_SEC; t <= seconds; t += HEARTBEAT_SEC) {
      beats.push(start + (t + (tab * HEARTBEAT_SEC) / tabs) * 1000);
    }
  }
  beats.sort((a, b) => a - b);
  for (const at of beats) {
    state = accrueHeartbeat(state, SETTINGS, at, scroll, DAY);
  }
  return state;
}

test("single tab accrues ~wall time", () => {
  const s = feed(emptyState(), { seconds: 60 });
  assert.ok(Math.abs(s.effectiveSeconds - 60) <= HEARTBEAT_SEC, String(s.effectiveSeconds));
  assert.ok(Math.abs(s.daySeconds - 60) <= HEARTBEAT_SEC);
});

test("two visible tabs do NOT double-feed (window dedupe)", () => {
  const one = feed(emptyState(), { tabs: 1, seconds: 120 });
  const two = feed(emptyState(), { tabs: 2, seconds: 120 });
  // Twice the heartbeats, same wall time → effectively identical accrual.
  assert.ok(
    Math.abs(two.effectiveSeconds - one.effectiveSeconds) <= HEARTBEAT_SEC,
    `1 tab: ${one.effectiveSeconds}, 2 tabs: ${two.effectiveSeconds}`,
  );
});

test("meaningful scroll accrues at 1.5×", () => {
  const idle = feed(emptyState(), { seconds: 60, scroll: 0 });
  const doom = feed(emptyState(), { seconds: 60, scroll: 500 });
  const ratio = doom.effectiveSeconds / idle.effectiveSeconds;
  assert.ok(Math.abs(ratio - 1.5) < 0.05, `ratio ${ratio}`);
});

test("gap after idle credits at most one heartbeat interval", () => {
  let s = feed(emptyState(), { seconds: 30 });
  const before = s.effectiveSeconds;
  // next heartbeat arrives an hour later (tab left open but hidden)
  s = accrueHeartbeat(s, SETTINGS, T0 + 3_630_000, 0, DAY);
  assert.ok(s.effectiveSeconds - before <= HEARTBEAT_SEC);
});

test("decay survives a service-worker kill (state round-trips storage)", () => {
  const live = feed(emptyState(), { seconds: 600, scroll: 500 }); // mass well above 0
  assert.ok(live.mass > 0.5, `mass ${live.mass}`);
  // Worker killed: only the persisted JSON survives. The chrome.alarm
  // outlives the worker and wakes a cold one every minute; each tick must
  // work from storage alone.
  let after = JSON.parse(JSON.stringify(live));
  for (let min = 1; min <= 30; min++) {
    after = decayTick(after, SETTINGS, live.lastHeartbeatAt + min * 60_000, DAY);
    after = JSON.parse(JSON.stringify(after)); // a fresh worker every tick
  }
  const expected = live.effectiveSeconds * 0.5 ** (30 / 10);
  assert.ok(
    Math.abs(after.effectiveSeconds - expected) < 1,
    `${after.effectiveSeconds} vs ${expected}`,
  );
  assert.ok(after.mass < live.mass);
});

test("decay is a no-op while a tab heartbeated within the last minute", () => {
  const live = feed(emptyState(), { seconds: 300 });
  const lastBeat = live.lastHeartbeatAt;
  const ticked = decayTick(live, SETTINGS, lastBeat + 30_000, DAY);
  assert.equal(ticked.effectiveSeconds, live.effectiveSeconds);
});

test("consecutive ticks decay by elapsed time, not per-tick", () => {
  const live = feed(emptyState(), { seconds: 600 });
  const start = live.lastHeartbeatAt;
  // three 1-minute ticks vs one 3-minute gap must agree
  let a = live;
  for (let i = 1; i <= 3; i++) a = decayTick(a, SETTINGS, start + 60_000 + i * 60_000, DAY);
  const b = decayTick(live, SETTINGS, start + 60_000 + 3 * 60_000, DAY);
  assert.ok(Math.abs(a.effectiveSeconds - b.effectiveSeconds) < 0.6,
    `${a.effectiveSeconds} vs ${b.effectiveSeconds}`);
});

test("~30 min off X essentially kills the hole (per-minute alarm cadence)", () => {
  const live = feed(emptyState(), { seconds: 1200, scroll: 500 });
  assert.equal(live.mass, 1);
  let s = live;
  for (let min = 1; min <= 35; min++) {
    s = decayTick(s, SETTINGS, live.lastHeartbeatAt + min * 60_000, DAY);
  }
  assert.ok(s.mass < 0.12, `mass ${s.mass}`);
});

test("clock skew / sleep: a single decay step is dt-capped", () => {
  const live = feed(emptyState(), { seconds: 1200, scroll: 500 });
  // Laptop wakes 8 h later → one tick sees a huge gap; cap applies.
  const slept = decayTick(live, SETTINGS, live.lastHeartbeatAt + 8 * 3_600_000, DAY);
  const capped = live.effectiveSeconds *
    0.5 ** (MAX_DECAY_STEP_MINUTES / SETTINGS.decayHalfLifeMinutes);
  assert.ok(Math.abs(slept.effectiveSeconds - capped) < 1,
    `${slept.effectiveSeconds} vs ${capped}`);
  assert.ok(slept.mass > 0, "hole must survive a sleep gap");
});

test("clock jump backwards feeds and starves nothing", () => {
  const live = feed(emptyState(), { seconds: 300 });
  const before = live.effectiveSeconds;
  const fed = accrueHeartbeat(live, SETTINGS, live.lastHeartbeatAt - 3_600_000, 0, DAY);
  assert.equal(fed.effectiveSeconds, before);
  const decayed = decayTick(live, SETTINGS, live.lastHeartbeatAt - 3_600_000, DAY);
  assert.equal(decayed.effectiveSeconds, before);
});

test("day rollover resets the badge counter but not the mass", () => {
  const live = feed(emptyState(), { seconds: 300 });
  const next = accrueHeartbeat(live, SETTINGS, live.lastHeartbeatAt + 5000, 0, "2026-06-12");
  assert.ok(next.daySeconds <= HEARTBEAT_SEC + 0.1);
  assert.ok(next.effectiveSeconds > live.effectiveSeconds);
});

test("effectiveSeconds caps at the limit; mass clamps to 1", () => {
  const live = feed(emptyState(), { seconds: 3600, scroll: 500 });
  assert.equal(live.effectiveSeconds, SETTINGS.limitMinutes * 60);
  assert.equal(live.mass, 1);
});

test("mass curve: linear early, accelerating endgame, monotonic", () => {
  assert.equal(computeMass(0, 20), 0);
  assert.ok(Math.abs(computeMass(600, 20) - 0.5) < 1e-9); // raw 0.5 untouched
  let prev = -1;
  for (let s = 0; s <= 1200; s += 10) {
    const m = computeMass(s, 20);
    assert.ok(m >= prev, `not monotonic at ${s}`);
    prev = m;
  }
  // accelerating: the last 30% of the time covers more than 30% of mass
  assert.ok(1 - computeMass(840, 20) > 0.3);
});

test("appearAfterMinutes gates mass through the grace period", () => {
  // 1 min grace + 2 min limit: hidden until 60 s, halfway at 120 s, full at 180 s
  assert.equal(computeMass(0, 2, 1), 0);
  assert.equal(computeMass(59, 2, 1), 0);
  assert.ok(Math.abs(computeMass(120, 2, 1) - 0.5) < 1e-9);
  assert.equal(computeMass(180, 2, 1), 1);
});

test("appearAfterMinutes: accrual cap covers grace+limit; decay re-earns the grace", () => {
  const s = {
    ...SETTINGS,
    appearAfterMinutes: 1,
    limitMinutes: 2,
    decayHalfLifeMinutes: 1,
  };
  let state = emptyState();
  for (let t = HEARTBEAT_SEC; t <= 600; t += HEARTBEAT_SEC) {
    state = accrueHeartbeat(state, s, T0 + t * 1000, 0, DAY);
  }
  assert.equal(state.mass, 1, "full mass reachable past the grace period");
  assert.ok(state.effectiveSeconds <= 3 * 60 + 1, "cap = (grace+limit)*60");
  // Off X for 3 minutes at a 1-min half-life: budget falls below the grace
  // threshold, so the hole is hidden again (grace re-earned).
  state = decayTick(state, s, T0 + (600 + 180) * 1000, DAY);
  assert.ok(state.effectiveSeconds < 60, String(state.effectiveSeconds));
  assert.equal(state.mass, 0);
});
