// Bundle entry for test/integration-sandbox.html (NOT shipped):
//   npx esbuild test/integration-entry.ts --bundle --format=iife \
//     --global-name=EH --outfile=test/.integration.bundle.js
// Exposes the real M3 pipeline so the sandbox can drive it headlessly.

export { HoleController } from "../src/hole-controller";
export { RenderManager } from "../src/render-manager";
