// Render strategies behind one interface, per the Milestone 0 result:
// lens (feImage + data: URL) is the default — verified PASS on real x.com
// with zero CSP violations — and spaghetti is the CSP-proof fallback /
// selectable mode.
//
// Coordinate contract: the Hole is given in VIEWPORT coordinates so it
// always agrees pixel-for-pixel with the position:fixed overlay canvas.
// The lens renderer converts viewport → filtered-element local coords
// every frame (inside the caller's rAF loop, reading the live rect — never
// a debounced scroll listener, or the warp lags during fast scrolls).
// Spaghetti needs no conversion: getBoundingClientRect() on tweets is
// already viewport-relative.

import { displacementDataURL } from "./displacement";
import { acquireColumn } from "./timeline";

export interface Hole {
  /** Center, viewport coordinates (px). */
  x: number;
  y: number;
  /** Influence radius (px) — the displacement map spans 2× this. */
  radius: number;
  /** 0..1 */
  mass: number;
}

export interface LensRenderer {
  /** Drive one animation frame. Caller owns the rAF loop. */
  frame(hole: Hole): void;
  /** Undo every DOM/style side effect. */
  dispose(): void;
}

export type MapSource = "data" | "packaged";

const SVG_NS = "http://www.w3.org/2000/svg";
const FILTER_ID = "event-horizon-lens";
const MAX_SCALE = 85; // feDisplacementMap scale at mass 1 (max shift = scale/2)
const MAP_REGEN_MIN_MS = 100; // ≤ 10 Hz
const MASS_TIERS = 8;

export function svgEl(tag: string, attrs: Record<string, string>): SVGElement {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

// feImage gotchas (verified in Milestone 0, see docs/ARCHITECTURE.md):
// - uncovered filter regions read as transparent black → uniform -scale/2
//   shift; fix by compositing the map over a neutral #808080 feFlood.
// - default linearRGB color interpolation destroys the 128-neutral
//   encoding; must be sRGB.
function buildLensFilter(): {
  svg: SVGSVGElement;
  feImage: SVGElement;
  disp: SVGElement;
} {
  const svg = svgEl("svg", {
    width: "0",
    height: "0",
    "aria-hidden": "true",
  }) as SVGSVGElement;
  svg.style.cssText = "position:absolute;width:0;height:0;";
  const filter = svgEl("filter", {
    id: FILTER_ID,
    x: "-20%",
    y: "-20%",
    width: "140%",
    height: "140%",
    "color-interpolation-filters": "sRGB",
    primitiveUnits: "userSpaceOnUse",
  });
  const flood = svgEl("feFlood", {
    "flood-color": "#808080",
    result: "neutral",
  });
  const feImage = svgEl("feImage", {
    x: "0",
    y: "0",
    width: "0",
    height: "0",
    preserveAspectRatio: "none",
    result: "map",
  });
  const merge = svgEl("feMerge", { result: "fullmap" });
  merge.append(
    svgEl("feMergeNode", { in: "neutral" }),
    svgEl("feMergeNode", { in: "map" }),
  );
  const disp = svgEl("feDisplacementMap", {
    in: "SourceGraphic",
    in2: "fullmap",
    scale: "0",
    xChannelSelector: "R",
    yChannelSelector: "G",
  });
  filter.append(flood, feImage, merge, disp);
  svg.append(filter);
  return { svg, feImage, disp };
}

export class FilterLensRenderer implements LensRenderer {
  private svg: SVGSVGElement;
  private feImage: SVGElement;
  private disp: SVGElement;
  private column: HTMLElement | null = null;
  private savedFilter = "";
  private lastX = Infinity;
  private lastY = Infinity;
  private lastSize = Infinity;
  private lastScale = Infinity;
  private lastMapTier = -1;
  private lastMapAt = -Infinity;

  constructor(private source: MapSource = "data") {
    const { svg, feImage, disp } = buildLensFilter();
    this.svg = svg;
    this.feImage = feImage;
    this.disp = disp;
    if (source === "packaged") {
      this.setHref(chrome.runtime.getURL("assets/displacement.png"));
    }
    document.documentElement.append(svg);
  }

  private setHref(href: string): void {
    this.feImage.setAttribute("href", href);
    this.feImage.setAttributeNS(
      "http://www.w3.org/1999/xlink",
      "xlink:href",
      href,
    );
  }

  frame(hole: Hole): void {
    // Re-acquire the column whenever X's SPA tears it down.
    if (!this.column?.isConnected) {
      const col = acquireColumn();
      if (!col) return;
      if (this.column) this.column.style.filter = this.savedFilter;
      this.savedFilter = col.style.filter;
      this.column = col;
    }
    const col = this.column;
    // X re-renders can wipe inline styles — re-assert, don't assume.
    const url = `url(#${FILTER_ID})`;
    if (col.style.filter !== url) col.style.filter = url;

    // Viewport → element-local conversion, fresh every frame.
    const rect = col.getBoundingClientRect();
    const x = hole.x - rect.left - hole.radius;
    const y = hole.y - rect.top - hole.radius;
    const size = hole.radius * 2;
    if (Math.abs(x - this.lastX) > 0.5) {
      this.feImage.setAttribute("x", x.toFixed(1));
      this.lastX = x;
    }
    if (Math.abs(y - this.lastY) > 0.5) {
      this.feImage.setAttribute("y", y.toFixed(1));
      this.lastY = y;
    }
    if (Math.abs(size - this.lastSize) > 0.5) {
      this.feImage.setAttribute("width", size.toFixed(1));
      this.feImage.setAttribute("height", size.toFixed(1));
      this.lastSize = size;
    }
    const scale = MAX_SCALE * hole.mass;
    if (Math.abs(scale - this.lastScale) > 0.5) {
      this.disp.setAttribute("scale", scale.toFixed(1));
      this.lastScale = scale;
    }

    // Map regeneration: only on mass-tier changes and at most 10 Hz —
    // per-frame motion is attribute updates only, never canvas work.
    if (this.source === "data") {
      const tier = Math.round(hole.mass * MASS_TIERS);
      const now = performance.now();
      if (tier !== this.lastMapTier && now - this.lastMapAt >= MAP_REGEN_MIN_MS) {
        this.setHref(displacementDataURL(Math.max(hole.mass, 0.05)));
        this.lastMapTier = tier;
        this.lastMapAt = now;
      }
    }
  }

  dispose(): void {
    if (this.column?.isConnected) this.column.style.filter = this.savedFilter;
    this.column = null;
    this.svg.remove();
  }
}

const SPAGHETTI_PULL = 0.6;
const SPAGHETTI_ROT_DEG = 22;
const SPAGHETTI_MIN_SCALE = 0.45;
const SPAGHETTI_BLUR_PX = 3;
const OFFSCREEN_MARGIN = 200;

export class SpaghettiRenderer implements LensRenderer {
  private saved = new Map<HTMLElement, string>();

  frame(hole: Hole): void {
    const column = acquireColumn();
    if (!column) return;
    const seen = new Set<HTMLElement>();
    for (const article of column.querySelectorAll<HTMLElement>("article")) {
      seen.add(article);
      const r = article.getBoundingClientRect();
      if (
        r.bottom < -OFFSCREEN_MARGIN ||
        r.top > window.innerHeight + OFFSCREEN_MARGIN
      ) {
        continue;
      }
      const ex = r.left + r.width / 2;
      const ey = r.top + r.height / 2;
      const d = Math.hypot(ex - hole.x, ey - hole.y);
      const t = Math.max(0, 1 - d / hole.radius);
      if (t <= 0) {
        this.restore(article);
        continue;
      }
      if (!this.saved.has(article)) {
        this.saved.set(article, article.style.cssText);
      }
      const e = t * t * hole.mass;
      const tx = (hole.x - ex) * SPAGHETTI_PULL * e;
      const ty = (hole.y - ey) * SPAGHETTI_PULL * e;
      const rot = SPAGHETTI_ROT_DEG * e * (ey < hole.y ? -1 : 1);
      const scale = 1 - SPAGHETTI_MIN_SCALE * e;
      article.style.transform = `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px) rotate(${rot.toFixed(1)}deg) scale(${scale.toFixed(3)})`;
      article.style.filter = `blur(${(SPAGHETTI_BLUR_PX * e).toFixed(1)}px)`;
      article.style.transition = "none";
    }
    // Virtualization-safe restore: anything we styled that left the query
    // gets its styles back (nodes X removed entirely take our styles with
    // them).
    for (const el of this.saved.keys()) {
      if (!seen.has(el)) this.restore(el);
    }
  }

  private restore(el: HTMLElement): void {
    const saved = this.saved.get(el);
    if (saved === undefined) return;
    if (el.isConnected) el.style.cssText = saved;
    this.saved.delete(el);
  }

  dispose(): void {
    for (const el of this.saved.keys()) this.restore(el);
  }
}

export function createRenderer(
  mode: "lens" | "spaghetti",
  source: MapSource = "data",
): LensRenderer {
  return mode === "lens" ? new FilterLensRenderer(source) : new SpaghettiRenderer();
}
