/**
 * Dev runner for the API.
 *
 * We cannot use tsx/esbuild here: they strip `emitDecoratorMetadata`, and Nest's
 * dependency injection reads exactly that metadata to know what to inject.
 * So the real TypeScript compiler watches and emits, and Node watches the output.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const apiDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entry = path.join(apiDir, "dist", "main.js");
const isWindows = process.platform === "win32";

const children = [];

function run(command, args, label) {
  const child = spawn(command, args, {
    cwd: apiDir,
    stdio: "inherit",
    shell: isWindows,
  });
  child.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      console.error(`[dev] ${label} exited with code ${code}`);
      shutdown(code);
    }
  });
  children.push(child);
  return child;
}

function shutdown(code = 0) {
  for (const child of children) child.kill();
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

run("tsc", ["-p", "tsconfig.build.json", "--watch", "--preserveWatchOutput"], "tsc");

// Node would crash-loop if it started before the first successful compile.
const waitForFirstBuild = setInterval(() => {
  if (!existsSync(entry)) return;
  clearInterval(waitForFirstBuild);
  console.log("[dev] first build ready, starting API");
  run("node", ["--watch", "--watch-preserve-output", "dist/main.js"], "node");
}, 400);
