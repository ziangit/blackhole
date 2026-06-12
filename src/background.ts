// MV3 service worker: owns the mass model. Treat every event as if the
// worker just woke up cold — load state from chrome.storage.local, apply a
// pure function from src/mass.ts, write back. The decay alarm persists
// across worker death and browser restarts; onStartup additionally runs an
// immediate catch-up so an overnight gap decays without waiting a minute.

import { accrueHeartbeat, decayTick, emptyState, type HoleState } from "./mass";
import { isHeartbeat } from "./messages";
import { loadSettings } from "./settings";

const DECAY_ALARM = "eh-decay";

function localDayKey(d = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

async function loadState(): Promise<HoleState> {
  const { state } = await chrome.storage.local.get("state");
  return { ...emptyState(), ...(state ?? {}) };
}

async function saveState(state: HoleState): Promise<void> {
  await chrome.storage.local.set({ state });
  await updateBadge(state);
}

async function updateBadge(state: HoleState): Promise<void> {
  const minutes = Math.floor(state.daySeconds / 60);
  await chrome.action.setBadgeText({ text: minutes > 0 ? String(minutes) : "" });
  // slate-gray → red as the hole grows
  const t = state.mass;
  const lerp = (a: number, b: number) => Math.round(a + (b - a) * t);
  await chrome.action.setBadgeBackgroundColor({
    color: [lerp(71, 220), lerp(85, 38), lerp(105, 38), 255],
  });
  await chrome.action.setBadgeTextColor({ color: [255, 255, 255, 255] });
}

// Storage writes are read-modify-write; serialize handlers so two tabs'
// simultaneous heartbeats can't both read the same pre-state (which would
// defeat the elapsed-time dedupe).
let queue: Promise<unknown> = Promise.resolve();
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.catch(() => {});
  return next;
}

async function handleHeartbeat(scrollDelta: number): Promise<void> {
  const settings = await loadSettings();
  if (!settings.enabled) return;
  const state = await loadState();
  await saveState(
    accrueHeartbeat(state, settings, Date.now(), scrollDelta, localDayKey()),
  );
}

async function handleDecayTick(): Promise<void> {
  const settings = await loadSettings();
  const state = await loadState();
  await saveState(decayTick(state, settings, Date.now(), localDayKey()));
}

async function ensureAlarm(): Promise<void> {
  const existing = await chrome.alarms.get(DECAY_ALARM);
  if (!existing) {
    await chrome.alarms.create(DECAY_ALARM, { periodInMinutes: 1 });
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Only our own content scripts may feed the model (defense in depth —
  // with no externally_connectable, other senders shouldn't reach us).
  if (sender.id !== chrome.runtime.id) return false;
  if (!isHeartbeat(msg)) return false;
  void enqueue(() => handleHeartbeat(msg.scrollDelta)).finally(() =>
    sendResponse(true),
  );
  return true; // keep the channel (and worker) alive until handled
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== DECAY_ALARM) return;
  void enqueue(handleDecayTick);
});

chrome.runtime.onInstalled.addListener(() => {
  void ensureAlarm();
  void enqueue(handleDecayTick); // also refreshes the badge immediately
});

chrome.runtime.onStartup.addListener(() => {
  void ensureAlarm();
  // Catch up the browser-closed gap now instead of in up to a minute.
  void enqueue(handleDecayTick);
});
