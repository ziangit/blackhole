export type RenderMode = "lens" | "spaghetti" | "auto";

export interface Settings {
  enabled: boolean;
  limitMinutes: number;
  decayHalfLifeMinutes: number;
  renderMode: RenderMode;
  /** Fraction of viewport area the hole may eat at mass 1.0 (0..1). */
  maxCoverage: number;
  /**
   * Grace period: the hole is completely absent until this many minutes of
   * effective time, then grows from nothing to full size at limitMinutes
   * total. Must be < limitMinutes (sanitizeSettings enforces it).
   */
  graceMinutes: number;
}

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  limitMinutes: 20,
  decayHalfLifeMinutes: 10,
  renderMode: "auto",
  maxCoverage: 0.35,
  graceMinutes: 5,
};

/**
 * Cross-field validation, applied on every load AND on save: grace must
 * leave at least one minute of growth (no divide-by-zero in the mass
 * remap, no hole that can never appear).
 */
export function sanitizeSettings(s: Settings): Settings {
  const limitMinutes = Math.max(1, s.limitMinutes);
  const graceMinutes = Math.min(Math.max(0, s.graceMinutes), limitMinutes - 1);
  return { ...s, limitMinutes, graceMinutes };
}

export async function loadSettings(): Promise<Settings> {
  const { settings } = await chrome.storage.local.get("settings");
  const stored = (settings ?? {}) as Partial<Settings> & {
    appearAfterMinutes?: number;
  };
  // Migrate the pre-release appearAfterMinutes key.
  if (stored.graceMinutes == null && stored.appearAfterMinutes != null) {
    stored.graceMinutes = stored.appearAfterMinutes;
  }
  return sanitizeSettings({ ...DEFAULT_SETTINGS, ...stored });
}
