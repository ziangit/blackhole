// Bundle entry for unit tests (`npm test` → test/.mass.bundle.mjs).
// Re-exports the pure model plus settings validation. loadSettings touches
// chrome.* only when called — never called from tests.
export * from "../src/mass";
export { DEFAULT_SETTINGS, sanitizeSettings } from "../src/settings";
