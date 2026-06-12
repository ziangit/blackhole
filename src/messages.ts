export interface HeartbeatMessage {
  type: "eh-heartbeat";
  /** Absolute scroll distance (px) accumulated since the last heartbeat. */
  scrollDelta: number;
}

/**
 * Full shape + range validation. scrollDelta only ever feeds a boolean
 * comparison (≥ SCROLL_MEANINGFUL_PX ⇒ 1.5× accrual) and time credit is
 * dt-capped wall-clock in the worker, so a hostile value can at worst flip
 * one heartbeat to 1.5× — but reject malformed input outright anyway.
 */
export function isHeartbeat(msg: unknown): msg is HeartbeatMessage {
  if (typeof msg !== "object" || msg === null) return false;
  const m = msg as { type?: unknown; scrollDelta?: unknown };
  return (
    m.type === "eh-heartbeat" &&
    typeof m.scrollDelta === "number" &&
    Number.isFinite(m.scrollDelta) &&
    m.scrollDelta >= 0 &&
    m.scrollDelta < 1e7
  );
}
