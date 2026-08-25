/**
 * Marks a build output directory as ES modules.
 *
 * Shared packages ship both CommonJS (for the NestJS API) and ESM (for Vite and
 * any ESM-first consumer). Node decides which is which from the nearest
 * package.json, so the ESM folder needs its own one-line marker.
 *
 * Usage: node ../../scripts/mark-esm.mjs dist/esm
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const target = process.argv[2];
if (!target) {
  console.error("Usage: node mark-esm.mjs <directory>");
  process.exit(1);
}

const directory = path.resolve(process.cwd(), target);
mkdirSync(directory, { recursive: true });
writeFileSync(path.join(directory, "package.json"), `${JSON.stringify({ type: "module" }, null, 2)}\n`);
