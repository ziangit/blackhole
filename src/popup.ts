// Toolbar popup — the extension's "menu bar" (modeled on the user's
// menu-bar-app reference): Show Black Hole Now, break-in presets (our
// graceMinutes), enable toggle, and a door to the full options page.
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
const showNow = $<HTMLButtonElement>("showNow");
const presets = $<HTMLDivElement>("presets");
const custom = $<HTMLButtonElement>("custom");
const enabled = $<HTMLInputElement>("enabled");
const optionsLink = $<HTMLAnchorElement>("options");

let settings: Settings;
const presetButtons: HTMLButtonElement[] = [];

async function save(next: Partial<Settings>): Promise<void> {
  settings = sanitizeSettings({ ...settings, ...next });
  await chrome.storage.local.set({ settings });
  render();
}

function render(): void {
  showNow.textContent = settings.forceShow
    ? "Hide it again (keeps tracking)"
    : "Show Black Hole Now";
  showNow.classList.toggle("active", settings.forceShow);
  enabled.checked = settings.enabled;
  for (const b of presetButtons) {
    b.classList.toggle(
      "active",
      Number(b.dataset["min"]) === settings.graceMinutes,
    );
  }
}

function renderStatus(state: HoleState | undefined): void {
  if (!state) return;
  const pct = Math.round(state.mass * 100);
  const minutes = Math.floor(state.daySeconds / 60);
  status.textContent = `hole mass ${pct}% · ${minutes} min browsing today`;
}

async function init(): Promise<void> {
  settings = await loadSettings();

  for (const min of PRESET_MINUTES) {
    const b = document.createElement("button");
    b.dataset["min"] = String(min);
    b.textContent = `${min}m`;
    b.addEventListener("click", () => {
      void save({
        graceMinutes: min,
        limitMinutes: Math.max(settings.limitMinutes, min + MIN_GROW_MINUTES),
      });
    });
    presets.appendChild(b);
    presetButtons.push(b);
  }

  showNow.addEventListener("click", () => {
    void save({ forceShow: !settings.forceShow });
  });
  enabled.addEventListener("change", () => {
    void save({ enabled: enabled.checked });
  });
  custom.addEventListener("click", () => chrome.runtime.openOptionsPage());
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
