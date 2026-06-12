// WebGL overlay: the hole's own visuals as a real GLSL fragment shader —
// lensed procedural starfield (point-mass lens equation, same β = θ − θE²/θ
// as the displacement map, so the synthetic sky and the SVG-warped page
// bend consistently), Keplerian accretion disc with Doppler beaming and a
// naturally-emerging secondary image arcing over the hole, photon ring,
// and the black horizon. Inspired by Bruneton's black-hole shader and
// s13k's ghostty-blackhole (both screen-space precomputed-deflection
// designs); written from scratch. Page content itself is still warped by
// the SVG filter — the platform deliberately offers no GLSL access to
// page pixels (CSS Custom Filters was removed for pixel-stealing risk).
//
// Falls back to the canvas-2D HoleOverlay when WebGL is unavailable.
// Same lifecycle contract: lazily mounted, fully unmounted at mass 0.

import { diagDec, diagInc } from "./diag";
import { HoleOverlay, type OverlayLike } from "./overlay";

// Fragment count scales with dpr² — full Retina (dpr 2) costs 4× dpr 1.
// The hole is glow, starfield and soft gradients; it doesn't need device
// pixels. Capping the GL backing store is the single biggest lever on GPU
// heat (user-reported warm laptop); the compositor upscales the canvas.
// The crisp photon ring softens slightly at the cap — acceptable.
const GL_MAX_DPR = 1.5;

const VERT = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
uniform vec2 u_center;  // device px, GL origin (bottom-left)
uniform float u_rs;     // horizon radius, device px
uniform float u_mass;   // 0..1
uniform float u_alpha;  // fade multiplier
uniform float u_time;   // seconds; constant under reduced motion

const float TILT = -0.42;     // disc tilt — matches the old orbit ring
const float INCL = 0.34;      // disc inclination (squash)
const float INFLUENCE = 6.0;  // influence radius / rs (hole-controller)
const float THETA_E = 1.55;   // Einstein radius / rs

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// Accretion disc sampled in a (possibly lensed) source-plane position:
// tilted inclined annulus, Keplerian differential rotation, blackbody-ish
// radial color, Doppler-beamed bright side. Returns straight rgb + alpha.
vec4 disc(vec2 sp, float t) {
  float cs = cos(TILT);
  float sn = sin(TILT);
  vec2 q = vec2(cs * sp.x + sn * sp.y, (-sn * sp.x + cs * sp.y) / INCL);
  float dr = length(q);
  float inner = u_rs * 1.55;
  float outer = u_rs * 4.6;
  float band = smoothstep(inner, inner * 1.3, dr) *
               (1.0 - smoothstep(outer * 0.72, outer, dr));
  if (band <= 0.0) return vec4(0.0);
  float phi = atan(q.y, q.x);
  float omega = 1.6 * pow(u_rs / dr, 1.5); // Keplerian ω ∝ r^-3/2
  float streak =
      0.62 + 0.38 * sin(phi * 7.0 - omega * t * 7.0 + dr / u_rs * 3.0);
  streak *= 0.78 + 0.22 * sin(phi * 19.0 - omega * t * 12.0);
  float beam = 1.0 + 0.9 * sin(phi + 0.55); // approaching side brighter
  float temp = clamp((dr - inner) / (outer - inner), 0.0, 1.0);
  vec3 c = mix(vec3(1.0, 0.97, 0.9), vec3(1.0, 0.42, 0.1), pow(temp, 0.55));
  float a = clamp(band * streak * beam, 0.0, 1.6);
  return vec4(c * min(a, 1.0) * (0.7 + 0.5 * u_mass), min(a, 1.0));
}

void main() {
  vec2 d = gl_FragCoord.xy - u_center;
  float r = length(d);
  float infl = u_rs * INFLUENCE;
  if (r >= infl) { gl_FragColor = vec4(0.0); return; }
  vec2 dir = d / max(r, 1e-3);
  float thetaE = u_rs * THETA_E;

  // Lens equation: signed source-plane radius. beta < 0 (inside the
  // Einstein radius) samples the OPPOSITE side — the secondary image.
  float beta = r - thetaE * thetaE / max(r, 1.0);
  vec2 src = dir * beta;

  // --- lensed starfield over a synthetic sky (screen-anchored far away,
  // bending into rings near the hole)
  vec2 skyP = u_center + src;
  vec2 cell = floor(skyP / 2.5);
  float h = hash21(cell);
  float star = step(0.996, h);
  float tw = 0.55 + 0.45 * sin(u_time * 1.5 + h * 50.0);
  float mag = clamp(1.0 + thetaE * thetaE / max(r * r, 1.0), 1.0, 3.5);
  vec3 col = vec3(0.85, 0.92, 1.0) * (star * tw * mag);

  // --- dark veil: space gets opaque toward the hole, clear at the rim
  float veil = 1.0 - smoothstep(u_rs * 1.05, infl, r);
  float a = veil * (0.55 + 0.35 * u_mass);

  // --- lensed (far-side / distorted) disc image
  vec4 dl = disc(src, u_time);
  col = mix(col, dl.rgb / max(dl.a, 1e-3), dl.a);
  a = max(a, dl.a);

  // --- event horizon swallows everything sampled behind it
  float horizon = 1.0 - smoothstep(u_rs * 0.985, u_rs * 1.015, r);
  col *= (1.0 - horizon);
  a = max(a, horizon);

  // --- near-side disc passes IN FRONT of the horizon (lower half in the
  // tilted frame), sampled direct (negligible bending on the near path)
  float dy = -sin(TILT) * d.x + cos(TILT) * d.y;
  if (dy < 0.0) {
    vec4 dn = disc(d, u_time);
    col = mix(col, dn.rgb / max(dn.a, 1e-3), dn.a);
    a = max(a, dn.a);
  }

  // --- photon ring: crisp line + warm bloom, additive
  float ring = exp(-pow((r - u_rs * 1.04) / (u_rs * 0.022), 2.0));
  float glow = exp(-pow((r - u_rs * 1.08) / (u_rs * 0.22), 2.0)) * 0.45;
  col += vec3(1.0, 0.93, 0.8) * (ring * 1.3 + glow);
  a = max(a, clamp(ring + glow, 0.0, 1.0));

  gl_FragColor = vec4(clamp(col, 0.0, 1.5), clamp(a, 0.0, 1.0)) * u_alpha;
}
`;

class GlHoleOverlay implements OverlayLike {
  private canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext;
  private u: Record<string, WebGLUniformLocation>;
  private mounted = false;
  private w = 0;
  private h = 0;
  private dpr = 1;

  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.id = "event-horizon-overlay";
    this.canvas.style.cssText = [
      "position:fixed",
      "inset:0",
      "pointer-events:none",
      "z-index:2147483600",
    ].join(";");
    const gl = this.canvas.getContext("webgl", {
      alpha: true,
      premultipliedAlpha: false,
      antialias: false,
      depth: false,
      stencil: false,
    });
    if (!gl) throw new Error("no webgl");
    this.gl = gl;

    const compile = (type: number, src: string): WebGLShader => {
      const sh = gl.createShader(type);
      if (!sh) throw new Error("shader alloc");
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        throw new Error(`shader: ${gl.getShaderInfoLog(sh)}`);
      }
      return sh;
    };
    const prog = gl.createProgram();
    if (!prog) throw new Error("program alloc");
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(`link: ${gl.getProgramInfoLog(prog)}`);
    }
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]), // fullscreen triangle
      gl.STATIC_DRAW,
    );
    const loc = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    this.u = {};
    for (const name of ["u_center", "u_rs", "u_mass", "u_alpha", "u_time"]) {
      const u = gl.getUniformLocation(prog, name);
      if (!u) throw new Error(`uniform ${name}`);
      this.u[name] = u;
    }
    this.resize();
  }

  private mount(): void {
    if (this.mounted) return;
    document.documentElement.append(this.canvas);
    this.mounted = true;
    diagInc("canvas");
  }

  private unmount(): void {
    if (!this.mounted) return;
    this.canvas.remove();
    this.mounted = false;
    diagDec("canvas");
  }

  resize(): void {
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, GL_MAX_DPR);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    // Replaced element: pin the CSS box or it renders at intrinsic size
    // (the Retina 2× bug — see ARCHITECTURE.md).
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
  }

  clear(): void {
    if (!this.mounted) return;
    const gl = this.gl;
    gl.disable(gl.SCISSOR_TEST);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.unmount();
  }

  draw(
    x: number,
    y: number,
    discR: number,
    mass: number,
    alpha: number,
    tSec = 0,
  ): void {
    if (alpha <= 0.005 || discR < 0.5) {
      this.clear();
      return;
    }
    this.mount();
    const gl = this.gl;
    const W = this.canvas.width;
    const H = this.canvas.height;
    gl.viewport(0, 0, W, H);
    gl.disable(gl.SCISSOR_TEST);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    // Raster only the influence square — the shader discards outside it
    // anyway, but the scissor saves the GPU the trip.
    const rInf = discR * 6 * this.dpr;
    const cx = x * this.dpr;
    const cy = H - y * this.dpr; // CSS y-down → GL y-up
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(
      Math.max(0, Math.floor(cx - rInf)),
      Math.max(0, Math.floor(cy - rInf)),
      Math.ceil(rInf * 2),
      Math.ceil(rInf * 2),
    );
    gl.uniform2f(this.u["u_center"]!, cx, cy);
    gl.uniform1f(this.u["u_rs"]!, discR * this.dpr);
    gl.uniform1f(this.u["u_mass"]!, mass);
    gl.uniform1f(this.u["u_alpha"]!, alpha);
    gl.uniform1f(this.u["u_time"]!, tSec);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  dispose(): void {
    this.unmount();
    this.gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}

/** WebGL when available, canvas-2D otherwise. */
export function createOverlay(): OverlayLike {
  try {
    return new GlHoleOverlay();
  } catch (e) {
    console.info("[event-horizon] WebGL unavailable, using 2D overlay", e);
    return new HoleOverlay();
  }
}
