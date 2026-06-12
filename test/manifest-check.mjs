// Automated injection-scope check (docs/SECURITY-AUDIT.md §3): the shipped
// manifest must request only storage+alarms, and content scripts must
// match exactly the declared policy. Scope policy changed 2026-06-12 by
// owner decision: ALL http/https sites (was: the two X origins) — the
// hole now feeds on browsing anywhere. Checks both the source manifest
// and the built copy in dist/. Runs as part of `npm test`.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const ALLOWED = ["http://*/*", "https://*/*"];

for (const path of ["manifest.json", "dist/manifest.json"]) {
  if (path.startsWith("dist/") && !existsSync(path)) {
    console.warn(`manifest-check: ${path} missing (run npm run build first) — skipped`);
    continue;
  }
  const raw = readFileSync(path, "utf8");
  const m = JSON.parse(raw);

  assert.deepEqual(
    [...m.permissions].sort(),
    ["alarms", "storage"],
    `${path}: permissions must be exactly storage+alarms`,
  );
  assert.equal(m.host_permissions, undefined, `${path}: no host_permissions`);
  assert.equal(m.optional_permissions, undefined, `${path}: no optional_permissions`);
  assert.equal(m.externally_connectable, undefined, `${path}: no externally_connectable`);
  assert.equal(m.content_scripts.length, 1, `${path}: one content script`);
  assert.deepEqual(
    [...m.content_scripts[0].matches].sort(),
    ALLOWED,
    `${path}: content script matches must equal the declared policy`,
  );
  for (const war of m.web_accessible_resources ?? []) {
    assert.deepEqual(
      [...war.matches].sort(),
      ALLOWED,
      `${path}: web_accessible_resources must match the declared policy`,
    );
  }
  assert.ok(!raw.includes("<all_urls>"), `${path}: use explicit http/https patterns, not <all_urls> (which includes file://)`);
  assert.ok(!raw.includes('"tabs"'), `${path}: no tabs permission`);
  console.log(`manifest-check: ${path} OK`);
}
