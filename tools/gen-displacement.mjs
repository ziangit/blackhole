// Generates the packaged displacement-map PNG (spike strategy 2) at build time.
// Mirrors the math in src/displacement.ts — keep the two in sync.
import zlib from "node:zlib";

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// Same lens model as src/displacement.ts (keep in sync): radial pull +
// tangential swirl, magnitude ∝ mass / max(r, eventR)², vectors encoded in
// R/G around 128, edges faded to neutral so the map never shifts content
// outside the hole's influence.
export function generateDisplacementPNG(size = 256, mass = 1) {
  const EVENT_R = 0.15;
  const STRENGTH = 0.07;
  const SWIRL = 0.8;
  const rgba = Buffer.alloc(size * size * 4);
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
        m *= f * f * (3 - 2 * f); // smoothstep fade to neutral at map edge
        m = Math.min(m, 1);
        const ux = nx / r;
        const uy = ny / r;
        dx = (ux - SWIRL * uy) * m;
        dy = (uy + SWIRL * ux) * m;
        const len = Math.hypot(dx, dy);
        if (len > 1) {
          dx /= len;
          dy /= len;
        }
      }
      const i = (y * size + x) * 4;
      rgba[i] = Math.round(128 + dx * 127);
      rgba[i + 1] = Math.round(128 + dy * 127);
      rgba[i + 2] = 128;
      rgba[i + 3] = 255;
    }
  }
  return encodePNG(size, size, rgba);
}
