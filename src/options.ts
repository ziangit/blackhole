import type { HoleState } from "./mass";
import {
  loadSettings,
  sanitizeSettings,
  type RenderMode,
  type Settings,
} from "./settings";

const $ = <T extends HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

const enabled = $<HTMLInputElement>("enabled");
const grace = $<HTMLInputElement>("grace");
const graceHint = $<HTMLParagraphElement>("graceHint");
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

// Fields not editable here (e.g. the popup's forceShow) must survive a
// save untouched.
let current: Settings;

async function save(): Promise<void> {
  const raw: Settings = {
    ...current,
    enabled: enabled.checked,
    limitMinutes: num(limit, 1, 480, 20),
    decayHalfLifeMinutes: num(decay, 1, 240, 10),
    renderMode: mode.value as RenderMode,
    maxCoverage: num(coverage, 5, 60, 35) / 100,
    graceMinutes: num(grace, 0, 479, 5),
  };
  const settings = sanitizeSettings(raw);
  current = settings;
  // Reflect the cross-field clamp in the UI: grace must stay below limit.
  if (settings.graceMinutes !== raw.graceMinutes) {
    grace.value = String(settings.graceMinutes);
    graceHint.textContent = `Must be below the full-size limit — clamped to ${settings.graceMinutes}.`;
    graceHint.style.display = "block";
  } else {
    graceHint.style.display = "none";
  }
  await chrome.storage.local.set({ settings });
}

function renderStatus(state: HoleState | undefined): void {
  if (!state) return;
  const pct = Math.round(state.mass * 100);
  const minutes = Math.floor(state.daySeconds / 60);
  status.textContent = `hole mass ${pct}% · ${minutes} min browsing today`;
}

async function init(): Promise<void> {
  const s = await loadSettings();
  current = s;
  enabled.checked = s.enabled;
  grace.value = String(s.graceMinutes);
  limit.value = String(s.limitMinutes);
  decay.value = String(s.decayHalfLifeMinutes);
  mode.value = s.renderMode;
  coverage.value = String(Math.round(s.maxCoverage * 100));
  coverageOut.textContent = `${coverage.value}%`;

  for (const el of [enabled, grace, limit, decay, mode, coverage]) {
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
