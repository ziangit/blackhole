// Displacement-map generation for the feDisplacementMap lens.
//
// The map now encodes the REAL point-mass (Schwarzschild weak-field) lens
// equation instead of the old ad-hoc 1/r² suction: a lens at the origin
// with Einstein radius θE maps an observed position θ to the source
// position β = θ − θE²/θ. The displacement we encode is (β − θ) — i.e.
// sample the source INWARD by θE²/θ, which pushes apparent content
// OUTWARD and tangentially stretches it (true lensing), and for θ < θE
// the sign flips and the sampled source crosses to the OPPOSITE side:
// the inverted secondary image of the Einstein ring, free of charge.
// This is the same "precompute deflection into a table, apply per pixel"
// architecture as Bruneton's black-hole shader — feDisplacementMap is our
// table applicator. A small tangential swirl is kept on top (artistic;
// a non-rotating hole has no frame dragging — the reference's swirl comes
// from disc motion, and it reads better on text).
//
// Magnitude is normalized for the 128±127 encoding; live strength rides
// the feDisplacementMap scale attribute (renderer.ts WARP_GAMMA).
// Map edges fade smoothly to neutral so the filter never shifts content
// outside the hole's influence.
// Mirrored at build time by tools/gen-displacement.mjs — keep in sync.

export const MAP_SIZE = 256;

/** Einstein radius as a fraction of the map half-size (influence radius). */
const THETA_E = 0.3;
/** Normalizes θE²/θ into the unit encoding range. */
const STRENGTH = 0.7;
const SWIRL = 0.35; // tangential : radial ratio (aesthetic only)

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
        // lens equation: displacement toward the center by θE²/θ — past
        // the Einstein radius the magnitude exceeds θ and the sample
        // lands on the far side (secondary image).
        let m = (mass * STRENGTH * THETA_E * THETA_E) / r;
        const f = Math.min((1 - r) / 0.25, 1);
        m *= f * f * (3 - 2 * f); // smoothstep fade to neutral at the edge
        const ux = nx / r;
        const uy = ny / r;
        dx = -ux * m - SWIRL * -uy * m;
        dy = -uy * m - SWIRL * ux * m;
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
