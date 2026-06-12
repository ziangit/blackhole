// Programmatic extension icons (16/48/128): black event-horizon disc with
// a warm photon ring and soft glow on transparent background. Pure pixel
// math — no canvas, no deps — encoded by the same PNG writer as the
// displacement map.
import { encodePNG } from "./gen-displacement.mjs";

const clamp01 = (v) => Math.min(1, Math.max(0, v));

export function generateIconPNG(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const c = (size - 1) / 2;
  const discR = size * 0.3;
  const ringR = size * 0.36;
  const ringW = Math.max(1, size * 0.05);
  const glowR = size * 0.5;

  // source-over compositing of straight-alpha layers
  const over = (px, layer) => {
    const a = layer[3] + px[3] * (1 - layer[3]);
    if (a <= 0) return [0, 0, 0, 0];
    return [
      (layer[0] * layer[3] + px[0] * px[3] * (1 - layer[3])) / a,
      (layer[1] * layer[3] + px[1] * px[3] * (1 - layer[3])) / a,
      (layer[2] * layer[3] + px[2] * px[3] * (1 - layer[3])) / a,
      a,
    ];
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = Math.hypot(x - c, y - c);
      let px = [0, 0, 0, 0];
      // warm accretion glow
      const glow = clamp01(1 - Math.abs(r - ringR) / (glowR - ringR));
      if (glow > 0) px = over(px, [255, 140, 60, glow * glow * 0.55]);
      // photon ring
      const ring = clamp01(1 - Math.abs(r - ringR) / ringW);
      if (ring > 0) px = over(px, [255, 244, 224, ring]);
      // event-horizon disc (on top, antialiased edge)
      const disc = clamp01(discR + 0.8 - r);
      if (disc > 0) px = over(px, [0, 0, 0, disc]);
      const i = (y * size + x) * 4;
      rgba[i] = Math.round(px[0]);
      rgba[i + 1] = Math.round(px[1]);
      rgba[i + 2] = Math.round(px[2]);
      rgba[i + 3] = Math.round(px[3] * 255);
    }
  }
  return encodePNG(size, size, rgba);
}
