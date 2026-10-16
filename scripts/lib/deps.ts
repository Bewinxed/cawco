/**
 * The checkout's dependencies, installed before anything that needs them
 * loads: by the rule a work item's landing gate uses (move.ts `depsScript`: the
 * root lockfile's install, run only when the lockfile changed since the
 * dependencies were installed).
 *
 * A fresh workspace clone has no node_modules, and a pull can bring a
 * package the installed ones lack. Bun resolves an entry's whole static
 * import graph before it runs any of it, so an entry that imports the
 * scratch fleet or the probe kit dies at load ("Cannot find module
 * '@cawco/core/lines'") before any install of its own could run. An entry
 * therefore imports only this statically, awaits it, and then imports what
 * needs the dependencies:
 *
 *   import { ensureDeps } from "./lib/deps";
 *   await ensureDeps();
 *   const { scratchFleet } = await import("./scratch-fleet");
 *
 * This module imports nothing a dependency provides (move.ts imports only a
 * type), so it loads in a checkout that has none.
 */
import { resolve } from "node:path";
import { DEPS_INSTALLING, depsScript } from "../../packages/core/src/move";

const ROOT = resolve(import.meta.dir, "..", "..");

let installing: Promise<void> | undefined;

/** Installs the dependencies when the lockfile changed (once per process); throws with the install's own output when it fails. */
export const ensureDeps = (): Promise<void> => {
  installing ??= (async () => {
    const deps = await Bun.$`sh -c ${depsScript()}`.cwd(ROOT).nothrow().quiet();
    const said = deps.stdout.toString();
    if (deps.exitCode !== 0) {
      throw new Error(
        `the checkout's dependencies did not install (exit ${deps.exitCode}): ${said.trim().split("\n").slice(-20).join("\n")}`
      );
    }
    if (said.startsWith(DEPS_INSTALLING)) {
      console.log(`… ${said.split("\n")[0]?.slice(DEPS_INSTALLING.length)}`);
    }
  })();
  return installing;
};
