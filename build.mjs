import esbuild from "esbuild";
import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import { generateDisplacementPNG } from "./tools/gen-displacement.mjs";

const watch = process.argv.includes("--watch");

mkdirSync("dist/assets", { recursive: true });
writeFileSync("dist/assets/displacement.png", generateDisplacementPNG(256, 0.7));
cpSync("manifest.json", "dist/manifest.json");
cpSync("src/options.html", "dist/options.html");

const ctx = await esbuild.context({
  entryPoints: ["src/content.ts", "src/background.ts", "src/options.ts"],
  bundle: true,
  outdir: "dist",
  format: "iife",
  target: "chrome120",
  logLevel: "info",
});

if (watch) {
  await ctx.watch();
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
