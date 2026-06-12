import { initHeartbeat } from "./heartbeat";
import { HoleController } from "./hole-controller";
import { RenderManager } from "./render-manager";
import { initSpike } from "./spike";

// Whatever happens, never break x.com.
try {
  initHeartbeat();
} catch (e) {
  console.warn("[event-horizon] heartbeat init failed", e);
}

try {
  const manager = new RenderManager();
  const controller = new HoleController(manager);
  void controller.start().then(() => {
    try {
      initSpike(controller, manager);
    } catch (e) {
      console.warn("[event-horizon] spike init failed", e);
    }
  });
} catch (e) {
  console.warn("[event-horizon] hole init failed", e);
}
