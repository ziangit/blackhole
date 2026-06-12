// Debug/tuning harness (born as the Milestone 0 spike; since Milestone 3 it
// is the test rig for the real render pipeline). Ships disabled: only
// activates with ?bhspike in the URL or Ctrl+Shift+B.
//
// Strategies cycle: off → lens-data → lens-packaged → spaghetti →
// overlay-only. "off" releases the RenderManager back to the renderMode
// setting; the others pin it (which also disables the perf degrade ladder,
// so a tuning session isn't yanked away mid-look). The manager is driven by
// the controller's rAF — the spike owns no renderers and no loop of its own.
//
// The panel includes a mass-override slider (0..1) that bypasses the
// tracker via HoleController.setMassOverride — tune disc/ring/glow/drift at
// any size without scrolling for 20 minutes.
// Verified live on x.com 2026-06-11: all three strategies PASS, zero CSP
// violations (docs/ARCHITECTURE.md). lens-data is the default.

import { displacementDataURL } from "./displacement";
import type { HoleController } from "./hole-controller";
import type { RenderManager } from "./render-manager";
import { svgEl } from "./renderer";

type Strategy = "off" | "lens-data" | "lens-packaged" | "spaghetti" | "overlay-only";
const ORDER: Strategy[] = [
  "off",
  "lens-data",
  "lens-packaged",
  "spaghetti",
  "overlay-only",
];

const TAG = "[event-horizon spike]";
const PROBE_MASS = 0.7;

interface State {
  strategy: Strategy;
  panel: HTMLDivElement | null;
  statusEl: HTMLPreElement | null;
  cspViolations: number;
  lastViolation: string;
  probeResult: string;
  probeToken: number;
}

const state: State = {
  strategy: "off",
  panel: null,
  statusEl: null,
  cspViolations: 0,
  lastViolation: "",
  probeResult: "—",
  probeToken: 0,
};

let controller: HoleController;
let manager: RenderManager;

export function initSpike(
  holeController: HoleController,
  renderManager: RenderManager,
): void {
  controller = holeController;
  manager = renderManager;

  document.addEventListener("securitypolicyviolation", (e) => {
    state.cspViolations++;
    state.lastViolation = `${e.violatedDirective}: ${e.blockedURI}`;
    console.warn(`${TAG} CSP violation —`, e.violatedDirective, e.blockedURI);
    updatePanel();
  });

  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.shiftKey && (e.key === "B" || e.key === "b")) {
      e.preventDefault();
      ensurePanel();
      const next =
        ORDER[(ORDER.indexOf(state.strategy) + 1) % ORDER.length] ?? "off";
      setStrategy(next);
    }
  });

  if (new URLSearchParams(location.search).has("bhspike")) {
    ensurePanel();
    setStrategy("lens-data");
  }
}

function setStrategy(s: Strategy): void {
  state.probeToken++; // invalidate any in-flight probe
  state.strategy = s;
  state.probeResult = "—";
  console.info(`${TAG} strategy → ${s}`);
  if (s === "off") {
    manager.force(null);
  } else if (s === "lens-data") {
    manager.force("lens");
    void runProbe(displacementDataURL(PROBE_MASS));
  } else if (s === "lens-packaged") {
    manager.force("lens-packaged");
    void runProbe(chrome.runtime.getURL("assets/displacement.png"));
  } else if (s === "spaghetti") {
    manager.force("spaghetti");
    state.probeResult = "n/a (no SVG filter — CSP-proof)";
  } else {
    manager.force("off");
    state.probeResult = "n/a (overlay only)";
  }
  updatePanel();
}

// Automated check: apply a probe filter (same feImage source) to a small
// canvas via ctx.filter and compare pixels against an unfiltered draw. If
// the feImage was CSP-blocked the map is uniform neutral → pixels match.
async function runProbe(href: string): Promise<void> {
  const token = ++state.probeToken;
  state.probeResult = "probing…";
  updatePanel();

  const id = "bh-spike-probe";
  document.getElementById(id)?.parentElement?.remove();
  const svg = svgEl("svg", {
    width: "0",
    height: "0",
    "aria-hidden": "true",
  }) as SVGSVGElement;
  svg.style.cssText = "position:absolute;width:0;height:0;";
  const filter = svgEl("filter", {
    id,
    x: "0%",
    y: "0%",
    width: "100%",
    height: "100%",
    "color-interpolation-filters": "sRGB",
    primitiveUnits: "userSpaceOnUse",
  });
  const feImage = svgEl("feImage", {
    href,
    x: "0",
    y: "0",
    width: "64",
    height: "64",
    preserveAspectRatio: "none",
    result: "map",
  });
  feImage.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", href);
  const disp = svgEl("feDisplacementMap", {
    in: "SourceGraphic",
    in2: "map",
    scale: "30",
    xChannelSelector: "R",
    yChannelSelector: "G",
  });
  filter.append(feImage, disp);
  svg.append(filter);
  document.documentElement.append(svg);

  const drawPattern = (ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = "#000";
    for (let x = 0; x < 64; x += 8) ctx.fillRect(x, 0, 4, 64);
  };

  let result = "FAIL (no displacement — likely blocked)";
  // feImage sources load async; retry a few times before calling it failed.
  for (let attempt = 0; attempt < 5; attempt++) {
    await new Promise((r) => setTimeout(r, attempt === 0 ? 50 : 300));
    if (token !== state.probeToken) {
      svg.remove();
      return; // strategy changed mid-probe
    }
    try {
      const plain = document.createElement("canvas");
      plain.width = plain.height = 64;
      const pctx = plain.getContext("2d")!;
      drawPattern(pctx);
      const a = pctx.getImageData(0, 0, 64, 64).data;

      const filtered = document.createElement("canvas");
      filtered.width = filtered.height = 64;
      const fctx = filtered.getContext("2d")!;
      fctx.filter = `url(#${id})`;
      drawPattern(fctx);
      const b = fctx.getImageData(0, 0, 64, 64).data;

      let diff = 0;
      for (let i = 0; i < a.length; i += 4) {
        if (Math.abs((a[i] ?? 0) - (b[i] ?? 0)) > 10) diff++;
      }
      if (diff > 50) {
        result = `PASS (${diff} px displaced)`;
        break;
      }
    } catch {
      result = "TAINTED canvas (map likely loaded; visual check needed)";
      break;
    }
  }
  svg.remove();
  if (token !== state.probeToken) return;
  state.probeResult = result;
  console.info(`${TAG} probe [${state.strategy}]: ${result}`);
  updatePanel();
}

// -------------------------------------------------------------- panel

function ensurePanel(): void {
  if (state.panel?.isConnected) return;
  const p = document.createElement("div");
  p.id = "bh-spike-panel";
  p.style.cssText = [
    "position:fixed",
    "right:12px",
    "bottom:12px",
    "z-index:2147483647",
    "pointer-events:auto",
    "background:rgba(10,10,14,0.88)",
    "color:#e7e9ea",
    "font:11px/1.5 ui-monospace,monospace",
    "padding:8px 10px",
    "border:1px solid #f9a826",
    "border-radius:6px",
  ].join(";");

  const status = document.createElement("pre");
  status.style.cssText = "margin:0;font:inherit;white-space:pre;";
  p.append(status);
  state.statusEl = status;

  // mass override — bypasses the tracker for visual tuning
  const row = document.createElement("div");
  row.style.cssText =
    "margin-top:6px;display:flex;align-items:center;gap:6px;border-top:1px solid #38444d;padding-top:6px;";
  const check = document.createElement("input");
  check.type = "checkbox";
  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "0";
  slider.max = "100";
  slider.value = "50";
  slider.style.cssText = "width:110px;accent-color:#f9a826;";
  const label = document.createElement("span");
  label.textContent = "mass 0.50";
  const apply = () => {
    const m = Number(slider.value) / 100;
    label.textContent = `mass ${m.toFixed(2)}`;
    controller.setMassOverride(check.checked ? m : null);
  };
  check.addEventListener("change", apply);
  slider.addEventListener("input", () => {
    check.checked = true;
    apply();
  });
  row.append(check, slider, label);
  p.append(row);

  document.documentElement.append(p);
  state.panel = p;
  // Live view of the manager (degrades happen on their own schedule); also
  // the orphan check — a reloaded extension must not leave a zombie panel.
  const interval = window.setInterval(() => {
    let orphaned = true;
    try {
      orphaned = !chrome.runtime?.id;
    } catch {}
    if (orphaned) {
      window.clearInterval(interval);
      state.panel?.remove();
      state.panel = null;
      return;
    }
    updatePanel();
  }, 1000);
  updatePanel();
}

function updatePanel(): void {
  if (!state.statusEl) return;
  state.statusEl.textContent = [
    `event-horizon ${__EH_BUILD__}`,
    `strategy : ${state.strategy}`,
    `live     : ${manager.status()}`,
    `probe    : ${state.probeResult}`,
    `CSP hits : ${state.cspViolations}${state.lastViolation ? ` (${state.lastViolation})` : ""}`,
    `Ctrl+Shift+B to cycle`,
  ].join("\n");
}
