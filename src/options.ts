import type { HoleState } from "./mass";
import { loadSettings, type RenderMode, type Settings } from "./settings";

const $ = <T extends HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

const enabled = $<HTMLInputElement>("enabled");
const limit = $<HTMLInputElement>("limit");
const decay = $<HTMLInputElement>("decay");
const mode = $<HTMLSelectElement>("mode");
const coverage = $<HTMLInputElement>("coverage");
const coverageOut = $<HTMLOutputElement>("coverageOut");
const status = $<HTMLParagraphElement>("status");

function num(el: HTMLInputElement, lo: number, hi: number, fallback: number) {
  const v = el.valueAsNumber;
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
}

async function save(): Promise<void> {
  const settings: Settings = {
    enabled: enabled.checked,
    limitMinutes: num(limit, 1, 480, 20),
    decayHalfLifeMinutes: num(decay, 1, 240, 10),
    renderMode: mode.value as RenderMode,
    maxCoverage: num(coverage, 5, 60, 35) / 100,
  };
  await chrome.storage.local.set({ settings });
}

function renderStatus(state: HoleState | undefined): void {
  if (!state) return;
  const pct = Math.round(state.mass * 100);
  const minutes = Math.floor(state.daySeconds / 60);
  status.textContent = `hole mass ${pct}% · ${minutes} min on X today`;
}

async function init(): Promise<void> {
  const s = await loadSettings();
  enabled.checked = s.enabled;
  limit.value = String(s.limitMinutes);
  decay.value = String(s.decayHalfLifeMinutes);
  mode.value = s.renderMode;
  coverage.value = String(Math.round(s.maxCoverage * 100));
  coverageOut.textContent = `${coverage.value}%`;

  for (const el of [enabled, limit, decay, mode, coverage]) {
    el.addEventListener("change", () => void save());
  }
  coverage.addEventListener("input", () => {
    coverageOut.textContent = `${coverage.value}%`;
  });

  // Live status — also the manual test surface for decay-after-worker-kill:
  // watch mass tick down once a minute with no X tab active.
  const { state } = await chrome.storage.local.get("state");
  renderStatus(state);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes["state"]?.newValue) {
      renderStatus(changes["state"].newValue as HoleState);
    }
  });
}

void init();
