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

    // accretion glow — tight around the ring; the surroundings stay dark
    // like the reference, the chroma rings carry the color further out
    const glowR = discR * 1.9;
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
      const rr = discR * (1.16 + i * 0.24);
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

    // photon ring — thin, bright, slightly warm, with a soft bloom
    ctx.save();
    ctx.lineWidth = Math.max(1.5, discR * 0.022);
    ctx.strokeStyle = "rgba(255,246,230,0.98)";
    ctx.shadowColor = "rgba(255,200,120,0.95)";
    ctx.shadowBlur = Math.max(5, discR * 0.16);
    ctx.beginPath();
    ctx.arc(x, y, discR * 1.03, 0, TAU);
    ctx.stroke();
    ctx.restore();

    // accretion hotspot — white-hot blob orbiting the ring (Doppler-bright
    // side of the accretion disc in the reference)
    const theta = HOTSPOT_PHASE + tSec * HOTSPOT_RATE;
    const hx = x + Math.cos(theta) * discR * 1.03;
    const hy = y + Math.sin(theta) * discR * 1.03;
    const hotR = Math.max(6, discR * 0.5);
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

    // event horizon
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.arc(x, y, discR, 0, TAU);
    ctx.fill();

    ctx.restore();
  }

  dispose(): void {
    this.canvas.remove();
  }
}
