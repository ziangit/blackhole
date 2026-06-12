export type RenderMode = "lens" | "spaghetti" | "auto";

export interface Settings {
  enabled: boolean;
  limitMinutes: number;
  decayHalfLifeMinutes: number;
  renderMode: RenderMode;
  /** Fraction of viewport area the hole may eat at mass 1.0 (0..1). */
  maxCoverage: number;
  /**
   * Grace period: the hole stays hidden until this many minutes have been
   * fed, then grows over the next limitMinutes. 0 = appears immediately.
   */
  appearAfterMinutes: number;
}

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  limitMinutes: 20,
  decayHalfLifeMinutes: 10,
  renderMode: "auto",
  maxCoverage: 0.35,
  appearAfterMinutes: 0,
};

export async function loadSettings(): Promise<Settings> {
  const { settings } = await chrome.storage.local.get("settings");
  return { ...DEFAULT_SETTINGS, ...(settings ?? {}) };
}
