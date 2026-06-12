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

import { diagDec, diagInc } from "./diag";
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
const MAX_SCALE = 260; // feDisplacementMap scale at mass 1 (max shift = scale/2)

// Chromatic aberration: the page is split into R/G/B and each channel is
// displaced at a slightly different strength, then recombined additively —
// lensed content gets the rainbow fringing of the reference shader. Three
// displacement passes ≈ 3× filter raster cost; the degrade ladder is the
// safety net on slow machines.
const CHANNELS: { matrix: string; mul: number }[] = [
  { matrix: "1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0", mul: 1.06 },
  { matrix: "0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0", mul: 1.0 },
  { matrix: "0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0", mul: 0.94 },
];

// Warp intensity ∝ mass^GAMMA. Front-loaded on purpose: the effect must be
// obvious in the first minutes (mass 0.1 → ~40% intensity), not only at the
// endgame. The map itself is baked ONCE at reference mass 1 and intensity
// rides the cheap per-frame `scale` attribute — regenerating the map from
// the live mass at tier crossings made the warp history-dependent (0.5
// approached from above baked a ~25% stronger map than from below).
export const WARP_GAMMA = 0.4;
const MAP_REFERENCE_MASS = 1;

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
  disps: { el: SVGElement; mul: number }[];
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
  filter.append(flood, feImage, merge);

  // One isolate→displace pass per color channel, then add them back up.
  const disps: { el: SVGElement; mul: number }[] = [];
  CHANNELS.forEach(({ matrix, mul }, i) => {
    filter.append(
      svgEl("feColorMatrix", {
        in: "SourceGraphic",
        type: "matrix",
        values: matrix,
        result: `ch${i}`,
      }),
    );
    const disp = svgEl("feDisplacementMap", {
      in: `ch${i}`,
      in2: "fullmap",
      scale: "0",
      xChannelSelector: "R",
      yChannelSelector: "G",
      result: `disp${i}`,
    });
    filter.append(disp);
    disps.push({ el: disp, mul });
  });
  filter.append(
    svgEl("feComposite", {
      in: "disp0",
      in2: "disp1",
      operator: "arithmetic",
      k1: "0",
      k2: "1",
      k3: "1",
      k4: "0",
      result: "rg",
    }),
    svgEl("feComposite", {
      in: "rg",
      in2: "disp2",
      operator: "arithmetic",
      k1: "0",
      k2: "1",
      k3: "1",
      k4: "0",
    }),
  );
  svg.append(filter);
  return { svg, feImage, disps };
}

export class FilterLensRenderer implements LensRenderer {
  private svg: SVGSVGElement;
  private feImage: SVGElement;
  private disps: { el: SVGElement; mul: number }[];
  private column: HTMLElement | null = null;
  private savedFilter = "";
  private lastX = Infinity;
  private lastY = Infinity;
  private lastSize = Infinity;
  private lastScale = Infinity;

  constructor(source: MapSource = "data") {
    const { svg, feImage, disps } = buildLensFilter();
    this.svg = svg;
    this.feImage = feImage;
    this.disps = disps;
    // Static map (reference mass) — per-frame work is attribute-only.
    this.setHref(
      source === "packaged"
        ? chrome.runtime.getURL("assets/displacement.png")
        : displacementDataURL(MAP_REFERENCE_MASS),
    );
    document.documentElement.append(svg);
    diagInc("svgFilter");
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
      // Never "save" a leftover reference to our own filter (e.g. from an
      // orphaned predecessor script) — restoring it later would re-break.
      this.savedFilter = col.style.filter.includes(FILTER_ID)
        ? ""
        : col.style.filter;
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
    const scale = MAX_SCALE * Math.pow(hole.mass, WARP_GAMMA);
    if (Math.abs(scale - this.lastScale) > 0.5) {
      for (const { el, mul } of this.disps) {
        el.setAttribute("scale", (scale * mul).toFixed(1));
      }
      this.lastScale = scale;
    }
  }

  dispose(): void {
    if (this.column?.isConnected) this.column.style.filter = this.savedFilter;
    this.column = null;
    this.svg.remove();
    diagDec("svgFilter");
  }
}

const SPAGHETTI_PULL = 0.6;
const SPAGHETTI_ROT_DEG = 22;
const SPAGHETTI_MIN_SCALE = 0.45;
const SPAGHETTI_BLUR_PX = 3;
const OFFSCREEN_MARGIN = 200;

export class SpaghettiRenderer implements LensRenderer {
  private saved = new Map<HTMLElement, string>();
  // Per the spec: only touch articles intersecting an expanded viewport
  // rect, tracked by IntersectionObserver — the per-frame loop never walks
  // the whole column. A MutationObserver feeds newly virtualized-in
  // articles to the IO; removed nodes fall out via the isConnected check.
  private visible = new Set<HTMLElement>();
  private io: IntersectionObserver;
  private mo: MutationObserver;
  private column: HTMLElement | null = null;

  constructor() {
    this.io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const el = entry.target as HTMLElement;
          if (entry.isIntersecting) {
            this.visible.add(el);
          } else {
            this.visible.delete(el);
            this.restore(el);
          }
        }
      },
      { rootMargin: `${OFFSCREEN_MARGIN}px` },
    );
    this.mo = new MutationObserver((muts) => {
      for (const mut of muts) {
        for (const node of mut.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          if (node.tagName === "ARTICLE") this.io.observe(node);
          for (const a of node.querySelectorAll<HTMLElement>("article")) {
            this.io.observe(a);
          }
        }
      }
    });
    diagInc("intersectionObserver");
    diagInc("mutationObserver");
  }

  // Re-arm both observers whenever X's SPA replaces the column.
  private ensureColumn(): boolean {
    if (this.column?.isConnected) return true;
    const col = acquireColumn();
    this.column = col;
    if (!col) return false;
    this.io.disconnect();
    this.mo.disconnect();
    this.visible.clear();
    // Styles saved against the old column would otherwise leak forever.
    for (const el of [...this.saved.keys()]) this.restore(el);
    for (const a of col.querySelectorAll<HTMLElement>("article")) {
      this.io.observe(a);
    }
    this.mo.observe(col, { childList: true, subtree: true });
    return true;
  }

  frame(hole: Hole): void {
    if (!this.ensureColumn()) return;
    for (const article of this.visible) {
      if (!article.isConnected) {
        // Virtualized out entirely — our styles went with the node.
        this.visible.delete(article);
        this.saved.delete(article);
        continue;
      }
      const r = article.getBoundingClientRect();
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
      const e = t * t * Math.pow(hole.mass, WARP_GAMMA);
      const tx = (hole.x - ex) * SPAGHETTI_PULL * e;
      const ty = (hole.y - ey) * SPAGHETTI_PULL * e;
      const rot = SPAGHETTI_ROT_DEG * e * (ey < hole.y ? -1 : 1);
      const scale = 1 - SPAGHETTI_MIN_SCALE * e;
      article.style.transform = `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px) rotate(${rot.toFixed(1)}deg) scale(${scale.toFixed(3)})`;
      article.style.filter = `blur(${(SPAGHETTI_BLUR_PX * e).toFixed(1)}px)`;
      article.style.transition = "none";
    }
  }

  private restore(el: HTMLElement): void {
    const saved = this.saved.get(el);
    if (saved === undefined) return;
    if (el.isConnected) el.style.cssText = saved;
    this.saved.delete(el);
  }

  dispose(): void {
    this.io.disconnect();
    this.mo.disconnect();
    this.visible.clear();
    for (const el of [...this.saved.keys()]) this.restore(el);
    diagDec("intersectionObserver");
    diagDec("mutationObserver");
  }
}
