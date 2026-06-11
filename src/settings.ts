export type RenderMode = "lens" | "spaghetti" | "auto";

export interface Settings {
  enabled: boolean;
  limitMinutes: number;
  decayHalfLifeMinutes: number;
  renderMode: RenderMode;
  /** Fraction of viewport area the hole may eat at mass 1.0 (0..1). */
  maxCoverage: number;
}

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  limitMinutes: 20,
  decayHalfLifeMinutes: 10,
  renderMode: "auto",
  maxCoverage: 0.35,
};

export async function loadSettings(): Promise<Settings> {
  const { settings } = await chrome.storage.local.get("settings");
  return { ...DEFAULT_SETTINGS, ...(settings ?? {}) };
}
