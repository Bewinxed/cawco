/**
 * The checkout's dependencies, installed before anything that needs them
 * loads: by core deps.ts `depsScript` (the root lockfile's frozen install,
 * run only when none was installed from the lockfile and manifests as they
 * stand).
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
 * An install also has to happen before the process resolves anything under
 * the packages it fills, and an entry has already resolved this module and
 * core's deps.ts by then. Bun's resolver keeps what it read of each folder
 * for the life of the process: on a fresh clone it read `packages/core/` with
 * no `node_modules` in it, so after the install an import there still finds
 * none ("Cannot find package 'tldts' from packages/core/src/stream-relay.ts")
 * though the package is on disk. So an entry whose `ensureDeps` installed
 * runs again, whole, in a fresh process, and exits with its exit.
 *
 * This module imports nothing a dependency provides (deps.ts imports
 * nothing), so it loads in a checkout that has none.
 */
import { resolve } from "node:path";
import { DEPS_INSTALLING, depsScript } from "../../packages/core/src/deps";

const ROOT = resolve(import.meta.dir, "..", "..");

let installing: Promise<boolean> | undefined;

/**
 * Installs the dependencies when none were installed from the lockfile and
 * manifests as they stand (once per process); true when this call installed.
 * Throws with the install's own output when it fails. For a module that
 * starts other processes on the dependencies (the scratch fleet's hub): they
 * resolve afresh, so nothing here runs again.
 */
export const installDeps = (): Promise<boolean> => {
  installing ??= (async () => {
    const deps = await Bun.$`sh -c ${depsScript()}`.cwd(ROOT).nothrow().quiet();
    const said = deps.stdout.toString();
    if (deps.exitCode !== 0) {
      throw new Error(
        `the checkout's dependencies did not install (exit ${deps.exitCode}): ${said.trim().split("\n").slice(-20).join("\n")}`
      );
    }
    if (!said.startsWith(DEPS_INSTALLING)) {
      return false;
    }
    console.log(`… ${said.split("\n")[0]?.slice(DEPS_INSTALLING.length)}`);
    return true;
  })();
  return installing;
};

/**
 * An entry's first await: {@link installDeps}, and when it installed, the
 * entry again in a fresh process (its own arguments, environment and stdio),
 * this one exiting with its exit, so no import resolves against what this
 * process read before the install.
 */
export const ensureDeps = async (): Promise<void> => {
  if (!(await installDeps())) {
    return;
  }
  console.log(
    "… running again in a fresh process, on the installed dependencies"
  );
  const again = Bun.spawn([process.execPath, ...process.argv.slice(1)], {
    stdio: ["inherit", "inherit", "inherit"],
  });
  process.exit(await again.exited);
};
