// Displacement-map generation for the feDisplacementMap lens.
// Deflection vectors encoded in R/G around the 128 neutral point;
// magnitude ∝ mass / max(r, eventRadius)². The vector is radial pull plus a
// tangential SWIRL component — pure inward pull reads as "suction", the
// tangential part wraps content AROUND the hole like the reference shader
// (light orbiting the photon sphere). Map edges fade smoothly to neutral so
// the filter never shifts content outside the hole's influence.
// Mirrored at build time by tools/gen-displacement.mjs — keep in sync.

export const MAP_SIZE = 256;

const EVENT_R = 0.15;
const STRENGTH = 0.085;
const SWIRL = 0.8; // tangential : radial deflection ratio

export function renderDisplacementMap(
  canvas: HTMLCanvasElement,
  mass: number,
): void {
  const size = MAP_SIZE;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  const img = ctx.createImageData(size, size);
  const data = img.data;
  const c = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (x - c) / c;
      const ny = (y - c) / c;
      const r = Math.hypot(nx, ny);
      let dx = 0;
      let dy = 0;
      if (r > 1e-4 && r < 1) {
        let m = (mass * STRENGTH) / Math.max(r, EVENT_R) ** 2;
        const f = Math.min((1 - r) / 0.25, 1);
        m *= f * f * (3 - 2 * f);
        m = Math.min(m, 1);
        const ux = nx / r;
        const uy = ny / r;
        dx = (ux - SWIRL * uy) * m;
        dy = (uy + SWIRL * ux) * m;
        // The 128±127 encoding can't hold vectors longer than 1.
        const len = Math.hypot(dx, dy);
        if (len > 1) {
          dx /= len;
          dy /= len;
        }
      }
      const i = (y * size + x) * 4;
      data[i] = Math.round(128 + dx * 127);
      data[i + 1] = Math.round(128 + dy * 127);
      data[i + 2] = 128;
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

export function displacementDataURL(mass: number): string {
  const canvas = document.createElement("canvas");
  renderDisplacementMap(canvas, mass);
  return canvas.toDataURL("image/png");
}
