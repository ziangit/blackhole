import esbuild from "esbuild";
import { execSync } from "node:child_process";
import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import { generateDisplacementPNG } from "./tools/gen-displacement.mjs";
import { generateIconPNG } from "./tools/gen-icons.mjs";

const watch = process.argv.includes("--watch");

// Build tag shown in the spike panel + logged at injection — ends the
// "which build is this tab actually running?" guessing game.
let sha = "nogit";
try {
  sha = execSync("git rev-parse --short HEAD").toString().trim();
} catch {}
const buildTag = `${sha} ${new Date().toISOString().slice(0, 16)}Z`;

mkdirSync("dist/assets", { recursive: true });
// Reference-mass map: intensity is driven by the filter's scale attribute,
// never by re-baking the map (see src/renderer.ts WARP_GAMMA).
writeFileSync("dist/assets/displacement.png", generateDisplacementPNG(256, 1));
for (const size of [16, 48, 128]) {
  writeFileSync(`dist/assets/icon${size}.png`, generateIconPNG(size));
}
cpSync("manifest.json", "dist/manifest.json");
cpSync("src/options.html", "dist/options.html");
cpSync("src/popup.html", "dist/popup.html");

const ctx = await esbuild.context({
  entryPoints: [
    "src/content.ts",
    "src/background.ts",
    "src/options.ts",
    "src/popup.ts",
  ],
  bundle: true,
  outdir: "dist",
  format: "iife",
  target: "chrome120",
  logLevel: "info",
  define: { __EH_BUILD__: JSON.stringify(buildTag) },
});

if (watch) {
  await ctx.watch();
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
