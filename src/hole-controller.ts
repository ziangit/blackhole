// Ties live mass (chrome.storage.local, written by the worker) to the
// on-screen hole: eased mass, drift, fade-in, and the overlay canvas.
// Lifecycle rules from the spec:
// - tab hidden → rAF stops, zero work
// - mass ~0 and nothing to fade out → rAF stops until storage changes
// - prefers-reduced-motion → no rAF loop at all; static render on changes
// - modal/composer open → display mass eases to 0 (lensing a half-typed
//   reply is hostile); tracking is unaffected
// The single source of the hole's position: the RenderManager gets the same
// Hole the overlay just drew, so disc and distortion agree to the pixel.

import { diagDec, diagInc } from "./diag";
import { HoleMotion } from "./hole-motion";
import type { HoleState } from "./mass";
import { createOverlay } from "./overlay-gl";
import type { RenderManager } from "./render-manager";
import type { Hole } from "./renderer";
import { DEFAULT_SETTINGS, loadSettings, type Settings } from "./settings";

// Fade-in completes by this mass. Kept tiny so the hole is BORN AT SIZE
// ZERO and visibly grows from a dot — at the old 0.05, √-area scaling
// meant it materialized already at ~22% of full radius.
const FADE_MASS = 0.01;
const MASS_TAU_MS = 700; // eased mass time constant — never pops
// "The black hole should be small, but its affected area should be big":
// the disc is shrunk below the coverage-derived radius, and the lens
// influence is a large multiple of it. The visible full-wrap band outside
// the disc spans 1/INFLUENCE_FACTOR .. ~0.83·sqrt(STRENGTH) of the
// influence radius (displacement.ts) — keep it a band, not a donut.
const DISC_SCALE = 0.62;
const INFLUENCE_FACTOR = 6;

// Ambient frame cap: the drifting hole invalidates the SVG filter raster
// (3 displacement passes over the column) on every change — at 60-120 fps
// that cooks laptops. Drift/orbit redraw at ~30 fps; scrolling and mass
// changes bypass the cap so the warp stays pixel-locked to the page.
const DRAW_MIN_INTERVAL_MS = 33;
const COLUMN_REACQUIRE_MS = 1000;
const MODAL_CHECK_MS = 300; // DOM query for open dialogs, throttled
const REDUCED_POLL_MS = 600; // reduced motion has no rAF to notice modals with

import { acquireColumn } from "./timeline";

export class HoleController {
  private overlay = createOverlay();
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
  private modalOpen = false;
  private modalCheckedAt = 0;
  private orphanCheckedAt = 0;
  private reducedPoll = 0;
  private dead = false;
  private lastDrawAt = 0;
  private lastScrollY = -1;
  private lastDrawnMass = -1;

  constructor(private renderManager: RenderManager | null = null) {}

  // When the extension is reloaded/updated/removed, this script lives on in
  // the tab as an orphan: chrome.* is gone but rAF and DOM access still
  // work — it would keep drawing a stale hole forever, fighting the freshly
  // injected script. Detect it (chrome.runtime.id disappears) and tear
  // everything down, leaving x.com untouched.
  private isOrphaned(): boolean {
    try {
      return !chrome.runtime?.id;
    } catch {
      return true;
    }
  }

  private destroy(): void {
    this.dead = true;
    this.stop();
    if (this.reducedPoll) {
      window.clearInterval(this.reducedPoll);
      this.reducedPoll = 0;
      diagDec("interval");
    }
    this.renderManager?.suspend();
    this.overlay.dispose();
    console.info("[event-horizon] orphaned content script cleaned itself up");
  }

  async start(): Promise<void> {
    this.settings = await loadSettings();
    this.renderManager?.setMode(this.settings.renderMode);
    const { state } = await chrome.storage.local.get("state");
    this.targetMass = (state as HoleState | undefined)?.mass ?? 0;

    diagInc("listener"); // storage.onChanged (app-lifetime)
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (changes["settings"]?.newValue) {
        this.settings = {
          ...DEFAULT_SETTINGS,
          ...changes["settings"].newValue,
        };
        this.renderManager?.setMode(this.settings.renderMode);
      }
      if (changes["state"]?.newValue) {
        this.targetMass =
          (changes["state"].newValue as HoleState).mass ?? 0;
      }
      this.wake();
    });

    diagInc("listener"); // visibilitychange (app-lifetime)
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") this.stop();
      else this.wake();
    });
    diagInc("listener"); // resize (app-lifetime)
    window.addEventListener("resize", () => {
      this.overlay.resize();
      this.wake();
    });

    // Reduced motion renders only on changes — poll so an opening/closing
    // modal still suspends/restores the static hole.
    if (this.motion.reduced) {
      diagInc("interval");
      this.reducedPoll = window.setInterval(() => {
        if (this.isOrphaned()) {
          this.destroy();
          return;
        }
        if (document.visibilityState === "hidden") return;
        const open = this.queryModal();
        if (open !== this.modalOpen) {
          this.modalOpen = open;
          this.wake();
        }
      }, REDUCED_POLL_MS);
    }

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
    if (this.override !== null) return this.override; // debug pin (spike)
    if (!this.settings.enabled) return 0;
    // Popup "Show Black Hole Now": forced presence on top of tracking.
    if (this.settings.forceShow) return Math.max(this.targetMass, 0.85);
    return this.targetMass;
  }

  private wake(): void {
    if (this.dead) return;
    if (document.visibilityState === "hidden") return;
    if (this.motion.reduced) {
      // No animation at all: a single static frame (renderFrame snaps the
      // mass itself).
      this.renderFrame(performance.now(), 0);
      return;
    }
    if (this.raf) return;
    diagInc("rafLoop");
    this.lastFrameAt = performance.now();
    const tick = (now: number) => {
      this.raf = requestAnimationFrame(tick);
      if (now - this.orphanCheckedAt > 2000) {
        this.orphanCheckedAt = now;
        if (this.isOrphaned()) {
          this.destroy();
          return;
        }
      }
      const rawDt = now - this.lastFrameAt;
      const dt = Math.min(rawDt, 100);
      this.lastFrameAt = now;
      const t0 = performance.now();
      this.renderFrame(now, dt);
      // Feed the perf degrade ladder: our scripting cost + the raw rAF
      // delta (the SVG filter's raster cost only shows up as missed vsync).
      this.renderManager?.recordFrame(performance.now() - t0, rawDt);
      // Idle: fully starved and nothing left to fade out. (A modal with
      // real mass behind it keeps the loop alive — effectiveTarget stays
      // high while the displayed mass eases to 0 — so we notice the close.)
      if (this.effectiveTarget() <= 0.0005 && this.easedMass <= 0.0005) {
        this.stop();
      }
    };
    this.raf = requestAnimationFrame(tick);
  }

  private stop(): void {
    if (this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
      diagDec("rafLoop");
    }
    this.overlay.clear();
  }

  private queryModal(): boolean {
    return document.querySelector('[aria-modal="true"]') !== null;
  }

  private renderFrame(now: number, dt: number): void {
    if (now - this.modalCheckedAt > MODAL_CHECK_MS) {
      this.modalOpen = this.queryModal();
      this.modalCheckedAt = now;
    }
    const target = this.modalOpen ? 0 : this.effectiveTarget();
    if (this.motion.reduced) {
      this.easedMass = target; // no animation at all — snap, don't ease
    }
    if (dt > 0) {
      this.easedMass += (target - this.easedMass) * (1 - Math.exp(-dt / MASS_TAU_MS));
      if (Math.abs(target - this.easedMass) < 0.0005) this.easedMass = target;
    }
    const m = this.easedMass;

    // Ambient 30 fps cap (cheap checks only — no layout reads). Scrolling
    // or a changing mass renders at full rate; pure drift waits its turn.
    // Reduced motion renders only on demand, so it always passes through.
    const scrollY = window.scrollY;
    if (
      !this.motion.reduced &&
      Math.abs(scrollY - this.lastScrollY) < 0.5 &&
      Math.abs(m - this.lastDrawnMass) < 0.0015 &&
      now - this.lastDrawAt < DRAW_MIN_INTERVAL_MS
    ) {
      return;
    }
    this.lastDrawAt = now;
    this.lastScrollY = scrollY;
    this.lastDrawnMass = m;

    if (now - this.columnCheckedAt > COLUMN_REACQUIRE_MS || !this.column?.isConnected) {
      this.column = acquireColumn();
      this.columnCheckedAt = now;
    }
    const colRect = this.column?.getBoundingClientRect() ?? null;

    // The AFFECTED area is what maxCoverage governs; the black disc itself
    // is a scaled-down core of it.
    const maxR = Math.sqrt(
      (this.settings.maxCoverage * window.innerWidth * window.innerHeight) /
        Math.PI,
    );
    const discR = maxR * Math.sqrt(m) * DISC_SCALE;
    const { x, y } = this.motion.position(now, colRect, discR);
    const alpha = Math.min(1, m / FADE_MASS);

    this.hole = {
      x,
      y,
      radius: Math.max(discR * INFLUENCE_FACTOR, 1),
      mass: m,
    };
    this.overlay.draw(x, y, discR, m, alpha, this.motion.reduced ? 0 : now / 1000);
    this.renderManager?.frame(this.hole);
  }
}
