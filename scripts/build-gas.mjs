#!/usr/bin/env node
/**
 * Bundles apps-script/src/main.ts into apps-script/dist/Code.js for clasp.
 *
 * Apps Script has no modules and only runs top-level functions, so the bundle
 * is an IIFE assigned to `Striker`, followed by one global wrapper per entry
 * point (menu items, triggers and doPost must be globals).
 */
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Functions Apps Script must see as globals, in wrapper order. */
export const GAS_ENTRY_POINTS = [
  "doPost",
  "onOpen",
  "strikerTick",
  "strikerSetup",
  "strikerShowStatus",
  "strikerNewSecret",
];

const footer = GAS_ENTRY_POINTS.map((name) => `function ${name}(e) { return Striker.${name}(e); }`).join("\n");

/** Returns the bundle source. With `write`, also writes dist/Code.js and dist/appsscript.json. */
export async function buildGas({ write = false } = {}) {
  const result = await build({
    absWorkingDir: root,
    entryPoints: ["apps-script/src/main.ts"],
    tsconfig: "apps-script/tsconfig.json",
    bundle: true,
    format: "iife",
    globalName: "Striker",
    target: "es2022", // Apps Script V8
    platform: "neutral",
    charset: "utf8",
    footer: { js: footer },
    write: false,
    logLevel: "warning",
  });
  const code = result.outputFiles[0].text;
  for (const name of GAS_ENTRY_POINTS) {
    if (!new RegExp(`\\b${name}: \\(\\) => ${name}\\b`).test(code)) {
      throw new Error(`build:gas: main.ts does not export ${name}`);
    }
  }
  if (write) {
    const dist = resolve(root, "apps-script/dist");
    await mkdir(dist, { recursive: true });
    const { writeFile } = await import("node:fs/promises");
    await writeFile(resolve(dist, "Code.js"), code);
    await copyFile(resolve(root, "apps-script/appsscript.json"), resolve(dist, "appsscript.json"));
  }
  return code;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const code = await buildGas({ write: true });
  console.log(`apps-script/dist/Code.js (${(code.length / 1024).toFixed(1)} kB) + appsscript.json`);
}
