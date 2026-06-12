// The hole's visual layer: a position:fixed, pointer-events:none canvas
// covering the viewport. Modeled on the reference shader look (Ghostty
// black hole): warm accretion glow, faint chromatic ring echoes rippling
// outward (drawn RGB-offset arcs — not sampled), a bright thin photon ring,
// an orbiting white-hot accretion hotspot on the ring, and the pure black
// event-horizon disc. The caller owns the rAF loop and all pause/fade
// logic; this class only sizes and paints. tSec drives the hotspot orbit —
// pass a constant for prefers-reduced-motion (static hotspot).

const TAU = Math.PI * 2;
const HOTSPOT_RATE = 0.55; // rad/s — one orbit ≈ 11 s
const HOTSPOT_PHASE = 2.4; // t=0 → lower-left, like the reference

// Grok-logo-style orbit: a tilted elliptical accretion ring around the
// disc. The back half passes BEHIND the hole (drawn before the disc, dim),
// the front half crosses in front of it (drawn after, bright) — the
// Saturn/Gargantua look. The hotspot travels this ellipse.
const ORBIT_A = 2.8; // semi-major axis / discR
const ORBIT_B = 0.85; // semi-minor axis / discR (inclined view)
const ORBIT_TILT = -0.42; // rad — the logo's diagonal

export class HoleOverlay {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private blank = true;

  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.id = "event-horizon-overlay";
    this.canvas.style.cssText = [
      "position:fixed",
      "inset:0",
      "pointer-events:none",
      "z-index:2147483600",
    ].join(";");
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    this.ctx = ctx;
    this.resize();
    document.documentElement.append(this.canvas);
  }

  resize(): void {
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
  }

  clear(): void {
    if (this.blank) return;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.blank = true;
  }

  draw(
    x: number,
    y: number,
    discR: number,
    mass: number,
    alpha: number,
    tSec = 0,
  ): void {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    this.blank = false;
    if (alpha <= 0.005 || discR < 0.5) return;
    ctx.save();
    ctx.globalAlpha = alpha;

    // dark vignette around the hole — the reference dims the surroundings,
    // which also makes the warped content pop
    const veilR = discR * 5;
    const veil = ctx.createRadialGradient(x, y, discR * 1.05, x, y, veilR);
    veil.addColorStop(0, `rgba(0,0,0,${0.12 + 0.25 * mass})`);
    veil.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = veil;
    ctx.beginPath();
    ctx.arc(x, y, veilR, 0, TAU);
    ctx.fill();

    // accretion glow — tight around the ring; the surroundings stay dark
    // like the reference, the chroma rings carry the color further out
    const glowR = discR * 2.2;
    const glow = ctx.createRadialGradient(x, y, discR * 0.9, x, y, glowR);
    glow.addColorStop(0, `rgba(255,150,70,${0.14 + 0.16 * mass})`);
    glow.addColorStop(0.45, `rgba(255,120,40,${0.04 + 0.06 * mass})`);
    glow.addColorStop(1, "rgba(255,110,30,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, glowR, 0, TAU);
    ctx.fill();

    // chromatic ring echoes — RGB-separated arcs rippling outward, fading
    // with distance (the drawn stand-in for the shader's lensed rings)
    const chromaOff = Math.max(1.5, discR * 0.02);
    for (let i = 0; i < 3; i++) {
      const rr = discR * (1.5 + i * 0.8);
      const a = (0.4 / (i + 1)) * (0.4 + 0.6 * mass);
      ctx.lineWidth = Math.max(1.2, discR * (0.022 - i * 0.005));
      ctx.strokeStyle = `rgba(255,90,50,${a})`;
      ctx.beginPath();
      ctx.arc(x + chromaOff * (i + 1), y, rr, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = `rgba(80,150,255,${a * 0.85})`;
      ctx.beginPath();
      ctx.arc(x - chromaOff * (i + 1), y, rr, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = `rgba(120,255,150,${a * 0.5})`;
      ctx.beginPath();
      ctx.arc(x, y + chromaOff * (i + 1) * 0.6, rr, 0, TAU);
      ctx.stroke();
    }

    // orbit geometry (shared by both arc halves and the hotspot)
    const oa = discR * ORBIT_A;
    const ob = discR * ORBIT_B;
    const theta = HOTSPOT_PHASE + tSec * HOTSPOT_RATE;
    const ou = oa * Math.cos(theta);
    const ov = ob * Math.sin(theta);
    const hx = x + ou * Math.cos(ORBIT_TILT) - ov * Math.sin(ORBIT_TILT);
    const hy = y + ou * Math.sin(ORBIT_TILT) + ov * Math.cos(ORBIT_TILT);
    const hotspotInFront = Math.sin(theta) > 0;

    // back half of the orbit ring — occluded by the disc drawn after it
    ctx.save();
    ctx.lineWidth = Math.max(2.5, discR * 0.06);
    ctx.strokeStyle = `rgba(255,180,100,${0.55 * (0.5 + 0.5 * mass)})`;
    ctx.beginPath();
    ctx.ellipse(x, y, oa, ob, ORBIT_TILT, Math.PI, TAU);
    ctx.stroke();
    ctx.restore();
    if (!hotspotInFront) this.drawHotspot(hx, hy, discR * 0.9, mass * 0.55);

    // photon ring — THICK and bright like the reference, soft outer bloom
    // plus a crisp white core stroke
    ctx.save();
    ctx.lineWidth = Math.max(3, discR * 0.07);
    ctx.strokeStyle = "rgba(255,243,222,0.92)";
    ctx.shadowColor = "rgba(255,210,140,0.95)";
    ctx.shadowBlur = Math.max(8, discR * 0.2);
    ctx.beginPath();
    ctx.arc(x, y, discR * 1.045, 0, TAU);
    ctx.stroke();
    ctx.lineWidth = Math.max(1.5, discR * 0.03);
    ctx.strokeStyle = "rgba(255,255,252,0.98)";
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(x, y, discR * 1.03, 0, TAU);
    ctx.stroke();
    ctx.restore();

    // event horizon
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.arc(x, y, discR, 0, TAU);
    ctx.fill();

    // front half of the orbit ring — crosses IN FRONT of the disc
    ctx.save();
    ctx.lineWidth = Math.max(3, discR * 0.075);
    ctx.strokeStyle = `rgba(255,215,155,${0.95 * (0.5 + 0.5 * mass)})`;
    ctx.shadowColor = "rgba(255,190,110,0.9)";
    ctx.shadowBlur = Math.max(6, discR * 0.14);
    ctx.beginPath();
    ctx.ellipse(x, y, oa, ob, ORBIT_TILT, 0, Math.PI);
    ctx.stroke();
    ctx.restore();
    if (hotspotInFront) this.drawHotspot(hx, hy, discR * 1.2, mass);

    ctx.restore();
  }

  // White-hot accretion blob (Doppler-bright side of the disc in the
  // reference). Scaled/dimmed when on the far side of the orbit.
  private drawHotspot(hx: number, hy: number, r: number, mass: number): void {
    const ctx = this.ctx;
    const hotR = Math.max(8, r * 0.65);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const hot = ctx.createRadialGradient(hx, hy, 0, hx, hy, hotR);
    hot.addColorStop(0, `rgba(255,255,250,${0.85 * (0.5 + 0.5 * mass)})`);
    hot.addColorStop(0.25, `rgba(255,220,170,${0.5 * (0.5 + 0.5 * mass)})`);
    hot.addColorStop(0.6, "rgba(255,150,70,0.18)");
    hot.addColorStop(1, "rgba(255,120,40,0)");
    ctx.fillStyle = hot;
    ctx.beginPath();
    ctx.arc(hx, hy, hotR, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  dispose(): void {
    this.canvas.remove();
  }
}
