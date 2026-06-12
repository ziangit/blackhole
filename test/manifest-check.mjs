// Automated injection-scope check (docs/SECURITY-AUDIT.md §3): the shipped
// manifest must request only storage+alarms and run only on the two X
// origins. Checks both the source manifest and the built copy in dist/.
// Runs as part of `npm test`.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const ALLOWED = ["https://twitter.com/*", "https://x.com/*"];

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
    `${path}: content script must match exactly the two X origins`,
  );
  for (const war of m.web_accessible_resources ?? []) {
    assert.deepEqual(
      [...war.matches].sort(),
      ALLOWED,
      `${path}: web_accessible_resources must be scoped to the two X origins`,
    );
  }
  assert.ok(!raw.includes("<all_urls>"), `${path}: no <all_urls> anywhere`);
  assert.ok(!raw.includes('"tabs"'), `${path}: no tabs permission`);
  console.log(`manifest-check: ${path} OK`);
}
