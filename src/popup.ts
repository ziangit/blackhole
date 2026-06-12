// Toolbar popup — the extension's "menu bar" (modeled on the user's
// menu-bar-app reference): live meters (active browsing time, minutes
// until the hole appears, minutes until it starves away), Show Black Hole
// Now, break-in presets + inline custom minutes (our graceMinutes),
// enable toggle, and a door to the full options page.
// All state flows through chrome.storage.local; the content script
// live-applies via storage.onChanged. Deliberately NO mass reset here.

import type { HoleState } from "./mass";
import {
  loadSettings,
  sanitizeSettings,
  type Settings,
} from "./settings";

const PRESET_MINUTES = [5, 10, 15, 20, 30, 45, 60];
/** Picking a preset keeps at least this much growth window after grace. */
const MIN_GROW_MINUTES = 15;

const $ = <T extends HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

const status = $<HTMLParagraphElement>("status");
const mActive = $<HTMLDivElement>("mActive");
const mAppear = $<HTMLDivElement>("mAppear");
const mGone = $<HTMLDivElement>("mGone");
const showNow = $<HTMLButtonElement>("showNow");
const presets = $<HTMLDivElement>("presets");
const customMin = $<HTMLInputElement>("customMin");
const applyCustom = $<HTMLButtonElement>("applyCustom");
const enabled = $<HTMLInputElement>("enabled");
const optionsLink = $<HTMLAnchorElement>("options");

let settings: Settings;
let lastState: HoleState | undefined;
const presetButtons: HTMLButtonElement[] = [];

async function save(next: Partial<Settings>): Promise<void> {
  settings = sanitizeSettings({ ...settings, ...next });
  await chrome.storage.local.set({ settings });
  render();
}

function setGrace(minutes: number): void {
  void save({
    graceMinutes: minutes,
    limitMinutes: Math.max(settings.limitMinutes, minutes + MIN_GROW_MINUTES),
  });
}

function render(): void {
  showNow.textContent = settings.forceShow
    ? "Hide it again (keeps tracking)"
    : "Show Black Hole Now";
  showNow.classList.toggle("active", settings.forceShow);
  enabled.checked = settings.enabled;
  let presetMatched = false;
  for (const b of presetButtons) {
    const hit = Number(b.dataset["min"]) === settings.graceMinutes;
    b.classList.toggle("active", hit);
    presetMatched = presetMatched || hit;
  }
  customMin.placeholder = presetMatched
    ? "Custom minutes"
    : `Custom: ${settings.graceMinutes} min`;
  renderMeters();
}

// The three live meters. effectiveSeconds IS the "not idle" clock: it
// accrues only while a tab is visible+focused (scrolling 1.5×) and decays
// with the configured half-life when you're away.
function renderMeters(): void {
  if (!lastState) return;
  const eff = lastState.effectiveSeconds;
  const graceSec = settings.graceMinutes * 60;
  const limitSec = settings.limitMinutes * 60;

  mActive.textContent = `${(eff / 60).toFixed(1)} min of active browsing (decays while you're away)`;

  if (settings.forceShow) {
    mAppear.textContent = "hole is forced on (Show Black Hole Now)";
  } else if (eff < graceSec) {
    const mins = (graceSec - eff) / 60;
    mAppear.textContent = `appears after ~${mins < 1 ? mins.toFixed(1) : Math.ceil(mins)} more min of browsing`;
  } else if (eff < limitSec) {
    mAppear.textContent = `hole is out — full size in ~${Math.ceil((limitSec - eff) / 60)} more min`;
  } else {
    mAppear.textContent = "hole is at full size";
  }

  // Decay from eff down to the grace boundary (or to ~zero if grace is 0):
  // t = halfLife · log2(eff / threshold).
  const threshold = Math.max(graceSec, 0.5);
  if (eff > threshold) {
    const mins = settings.decayHalfLifeMinutes * Math.log2(eff / threshold);
    mGone.textContent = `disappears ~${mins < 1 ? mins.toFixed(1) : Math.ceil(mins)} min after you step away`;
  } else {
    mGone.textContent = "not out yet — nothing to starve";
  }
}

function renderStatus(state: HoleState | undefined): void {
  if (!state) return;
  lastState = state;
  const pct = Math.round(state.mass * 100);
  const minutes = Math.floor(state.daySeconds / 60);
  status.textContent = `hole mass ${pct}% · ${minutes} min browsing today`;
  renderMeters();
}

async function init(): Promise<void> {
  settings = await loadSettings();

  for (const min of PRESET_MINUTES) {
    const b = document.createElement("button");
    b.dataset["min"] = String(min);
    b.textContent = `${min}m`;
    b.addEventListener("click", () => setGrace(min));
    presets.appendChild(b);
    presetButtons.push(b);
  }

  const applyCustomValue = () => {
    const v = customMin.valueAsNumber;
    if (!Number.isFinite(v)) return;
    setGrace(Math.min(479, Math.max(0, Math.round(v))));
    customMin.value = "";
  };
  applyCustom.addEventListener("click", applyCustomValue);
  customMin.addEventListener("keydown", (e) => {
    if (e.key === "Enter") applyCustomValue();
  });

  showNow.addEventListener("click", () => {
    void save({ forceShow: !settings.forceShow });
  });
  enabled.addEventListener("change", () => {
    void save({ enabled: enabled.checked });
  });
  optionsLink.addEventListener("click", () => chrome.runtime.openOptionsPage());

  const { state } = await chrome.storage.local.get("state");
  renderStatus(state as HoleState | undefined);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes["state"]?.newValue) {
      renderStatus(changes["state"].newValue as HoleState);
    }
  });

  render();
}

void init();
