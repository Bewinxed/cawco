/**
 * `bun scripts/real-modules.ts <command…>`: runs the command with
 * `node_modules` a folder of the project (lib/real-modules.ts), so Biome
 * reads a package's types in a CawCo workspace too. Every Biome run over
 * the checkout goes through it: check.ts's lint step and `bun run lint:fix`.
 * Exits as the command does; a swap that cannot be made fails the run with
 * its words, never runs the command without it.
 *
 * `--guard <pid>`: the guard it starts, in a session of its own, which puts
 * the link back once `pid` has gone.
 */

import { listedPid } from "../packages/core/src/signal";
import { guardModules, withRealModules } from "./lib/real-modules";
import { runTied } from "./lib/tied-child";

// What Biome reads that no import reaches: its config and plugins, and the
// stylesheet its CSS rules resolve tokens against.
export const checkReads = [
  "biome.jsonc",
  "scripts/lint/**/*.grit",
  "apps/dashboard/src/app.css",
];

const args = process.argv.slice(2);

if (args[0] === "--guard") {
  await guardModules(listedPid(Number(args[1])));
  process.exit(0);
}
if (args.length === 0) {
  console.error("real-modules: name the command to run");
  process.exit(2);
}

const guard = (pid: number): void => {
  Bun.spawn([process.execPath, import.meta.path, "--guard", String(pid)], {
    env: process.env,
    stdio: ["ignore", "ignore", "inherit"],
    detached: true,
  }).unref();
};

try {
  process.exit(await withRealModules(() => runTied(args), guard));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
