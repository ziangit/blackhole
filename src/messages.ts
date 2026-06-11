export interface HeartbeatMessage {
  type: "eh-heartbeat";
  /** Absolute scroll distance (px) accumulated since the last heartbeat. */
  scrollDelta: number;
}

export function isHeartbeat(msg: unknown): msg is HeartbeatMessage {
  return (
    typeof msg === "object" &&
    msg !== null &&
    (msg as { type?: unknown }).type === "eh-heartbeat"
  );
}
