import { initHeartbeat } from "./heartbeat";
import { HoleController } from "./hole-controller";
import { initSpike } from "./spike";

// Whatever happens, never break x.com.
try {
  initHeartbeat();
} catch (e) {
  console.warn("[event-horizon] heartbeat init failed", e);
}

try {
  const controller = new HoleController();
  void controller.start().then(() => {
    try {
      initSpike(controller);
    } catch (e) {
      console.warn("[event-horizon] spike init failed", e);
    }
  });
} catch (e) {
  console.warn("[event-horizon] overlay init failed", e);
}
