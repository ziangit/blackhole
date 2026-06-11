// Ties live mass (chrome.storage.local, written by the worker) to the
// on-screen hole: eased mass, drift, fade-in, and the overlay canvas.
// Lifecycle rules from the spec:
// - tab hidden → rAF stops, zero work
// - mass ~0 and nothing to fade out → rAF stops until storage changes
// - prefers-reduced-motion → no rAF loop at all; static render on changes
// - fade in from nothing below mass 0.05
// Also the single source of the hole's position: renderers (Milestone 3)
// read currentHole() so disc and distortion agree to the pixel.

import { HoleMotion } from "./hole-motion";
import type { HoleState } from "./mass";
import { HoleOverlay } from "./overlay";
import type { Hole } from "./renderer";
import { DEFAULT_SETTINGS, loadSettings, type Settings } from "./settings";

const FADE_MASS = 0.05;
const MASS_TAU_MS = 700; // eased mass time constant — never pops
const INFLUENCE_FACTOR = 2.2; // lens influence radius vs disc radius
const COLUMN_REACQUIRE_MS = 1000;

import { acquireColumn } from "./timeline";

export class HoleController {
  private overlay = new HoleOverlay();
  private motion = new HoleMotion();
  private settings: Settings = DEFAULT_SETTINGS;
  private targetMass = 0;
  private easedMass = 0;
  private override: number | null = null;
  private raf = 0;
  private lastFrameAt = 0;
  private column: HTMLElement | null = null;
  private columnCheckedAt = 0;
  private hole: Hole = { x: 0, y: 0, radius: 0, mass: 0 };

  async start(): Promise<void> {
    this.settings = await loadSettings();
    const { state } = await chrome.storage.local.get("state");
    this.targetMass = (state as HoleState | undefined)?.mass ?? 0;

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (changes["settings"]?.newValue) {
        this.settings = {
          ...DEFAULT_SETTINGS,
          ...changes["settings"].newValue,
        };
      }
      if (changes["state"]?.newValue) {
        this.targetMass =
          (changes["state"].newValue as HoleState).mass ?? 0;
      }
      this.wake();
    });

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") this.stop();
      else this.wake();
    });
    window.addEventListener("resize", () => {
      this.overlay.resize();
      this.wake();
    });

    this.wake();
  }

  /** Debug only (spike panel): bypass the tracker. null releases. */
  setMassOverride(m: number | null): void {
    this.override = m;
    this.wake();
  }

  /** The shared truth for renderers — viewport coordinates. */
  currentHole(): Hole {
    return this.hole;
  }

  private effectiveTarget(): number {
    if (this.override !== null) return this.override;
    return this.settings.enabled ? this.targetMass : 0;
  }

  private wake(): void {
    if (document.visibilityState === "hidden") return;
    if (this.motion.reduced) {
      // No animation at all: snap mass and paint a single static frame.
      this.easedMass = this.effectiveTarget();
      this.renderFrame(performance.now(), 0);
      return;
    }
    if (this.raf) return;
    this.lastFrameAt = performance.now();
    const tick = (now: number) => {
      this.raf = requestAnimationFrame(tick);
      const dt = Math.min(now - this.lastFrameAt, 100);
      this.lastFrameAt = now;
      this.renderFrame(now, dt);
      // Idle: fully starved and nothing left to fade out.
      if (this.effectiveTarget() <= 0.0005 && this.easedMass <= 0.0005) {
        this.stop();
      }
    };
    this.raf = requestAnimationFrame(tick);
  }

  private stop(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.overlay.clear();
  }

  private renderFrame(now: number, dt: number): void {
    const target = this.effectiveTarget();
    if (dt > 0) {
      this.easedMass += (target - this.easedMass) * (1 - Math.exp(-dt / MASS_TAU_MS));
      if (Math.abs(target - this.easedMass) < 0.0005) this.easedMass = target;
    }
    const m = this.easedMass;

    if (now - this.columnCheckedAt > COLUMN_REACQUIRE_MS || !this.column?.isConnected) {
      this.column = acquireColumn();
      this.columnCheckedAt = now;
    }
    const colRect = this.column?.getBoundingClientRect() ?? null;

    // Disc area grows linearly with mass, capped at maxCoverage of the
    // viewport area: πR² = coverage·W·H at mass 1.
    const maxR = Math.sqrt(
      (this.settings.maxCoverage * window.innerWidth * window.innerHeight) /
        Math.PI,
    );
    const discR = maxR * Math.sqrt(m);
    const { x, y } = this.motion.position(now, colRect, discR);
    const alpha = Math.min(1, m / FADE_MASS);

    this.hole = {
      x,
      y,
      radius: Math.max(discR * INFLUENCE_FACTOR, 1),
      mass: m,
    };
    this.overlay.draw(x, y, discR, m, alpha);
  }
}
