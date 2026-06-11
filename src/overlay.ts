// The hole's visual layer: a position:fixed, pointer-events:none canvas
// covering the viewport. Draws (back to front): warm accretion glow,
// chromatic fringe (offset orange/blue arcs — drawn, not sampled), bright
// thin photon ring, pure black event-horizon disc. The caller owns the rAF
// loop and all pause/fade logic; this class only sizes and paints.

const TAU = Math.PI * 2;

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

  draw(x: number, y: number, discR: number, mass: number, alpha: number): void {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    this.blank = false;
    if (alpha <= 0.005 || discR < 0.5) return;
    ctx.save();
    ctx.globalAlpha = alpha;

    // accretion glow
    const glowR = discR * 2.0;
    const glow = ctx.createRadialGradient(x, y, discR * 0.8, x, y, glowR);
    glow.addColorStop(0, `rgba(255,150,70,${0.16 + 0.18 * mass})`);
    glow.addColorStop(0.55, `rgba(255,120,40,${0.05 + 0.08 * mass})`);
    glow.addColorStop(1, "rgba(255,110,30,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, glowR, 0, TAU);
    ctx.fill();

    // chromatic fringe: offset orange/blue arcs just outside the ring
    const fringeR = discR * 1.07;
    const fringeOff = Math.max(1.2, discR * 0.015);
    ctx.lineWidth = Math.max(1.5, discR * 0.02);
    ctx.strokeStyle = "rgba(255,140,40,0.5)";
    ctx.beginPath();
    ctx.arc(x + fringeOff, y, fringeR, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = "rgba(90,150,255,0.4)";
    ctx.beginPath();
    ctx.arc(x - fringeOff, y, fringeR, 0, TAU);
    ctx.stroke();

    // photon ring — thin, bright, slightly warm, with a soft bloom
    ctx.save();
    ctx.lineWidth = Math.max(1.25, discR * 0.018);
    ctx.strokeStyle = "rgba(255,243,224,0.95)";
    ctx.shadowColor = "rgba(255,200,120,0.9)";
    ctx.shadowBlur = Math.max(4, discR * 0.12);
    ctx.beginPath();
    ctx.arc(x, y, discR * 1.03, 0, TAU);
    ctx.stroke();
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
