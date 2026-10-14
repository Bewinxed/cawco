/**
 * The simulator app a probe runs, and whether it was built from this tree.
 *
 * One rule on the Mac, from a CawCo workspace or a person's shell alike:
 * build-both.sh builds into the workspaces' cache,
 * `~/.cawco/workspace-cache/xdg/cawco-apple/<build>` (a workspace's own
 * XDG_CACHE_HOME, and where the Mac build slot's locks already are), and
 * `<build>` is the checkout's folder name (`main` for ~/cockpit). Each
 * simulator build leaves `CawCo.app.tree` beside the app: the stamp of
 * apps/apple it was built from (apps/apple/scripts/tree-stamp.sh). A probe
 * runs the app only when that stamp is this tree's; else it says which
 * build to make. There is no other copy to fall back to.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

/** Where build-both.sh builds on the Mac. */
export const APPLE_BUILDS = join(
  homedir(),
  ".cawco",
  "workspace-cache",
  "xdg",
  "cawco-apple"
);

const TRAILING_SLASH = /\/$/;

/** The build a checkout's apps are made in: its folder's name, `main` for ~/cockpit. */
export const buildName = (top: string): string => {
  const root = top.replace(TRAILING_SLASH, "");
  return root === join(homedir(), "cockpit") ? "main" : basename(root);
};

/** The simulator app build-both.sh makes for the checkout at `top`. */
export const simulatorApp = (top: string): string =>
  join(
    APPLE_BUILDS,
    buildName(top),
    "DerivedData/Build/Products/Debug-iphonesimulator/CawCo.app"
  );

/** This checkout's apps/apple as it stands now (tree-stamp.sh). */
export const treeStamp = (top: string): string => {
  const root = top.replace(TRAILING_SLASH, "");
  const run = Bun.spawnSync(
    ["bash", join(root, "apps/apple/scripts/tree-stamp.sh")],
    { cwd: root, stdout: "pipe", stderr: "pipe" }
  );
  if (run.exitCode !== 0) {
    throw new Error(
      `tree-stamp.sh failed: ${run.stderr.toString().trim() || run.stdout.toString().trim()}`
    );
  }
  return run.stdout.toString().trim();
};

/**
 * Why the app at `app` (by default the checkout's own) cannot be run against
 * this tree, in words that say the fix; nothing when it can.
 */
export function staleApp(
  top: string,
  app = simulatorApp(top)
): string | undefined {
  const build = "bash apps/apple/scripts/build-both.sh ios";
  if (!existsSync(app)) {
    return `no app at ${app}: run ${build}`;
  }
  const stampFile = `${app}.tree`;
  if (!existsSync(stampFile)) {
    return `the app at ${app} carries no tree stamp (built before stamps): run ${build}`;
  }
  const built = readFileSync(stampFile, "utf8").trim();
  const tree = treeStamp(top);
  return built === tree
    ? undefined
    : `the app at ${app} was built from apps/apple ${built.slice(0, 12)}, the tree is ${tree.slice(0, 12)}: run ${build}`;
}

/**
 * The checkout's simulator app, or `PROBE_IOS_APP` when a run names
 * another; either way only when it was built from this tree.
 */
export function freshApp(top: string): { path: string; problem?: string } {
  const path = process.env.PROBE_IOS_APP ?? simulatorApp(top);
  return { path, problem: staleApp(top, path) };
}

/**
 * A probe's own Mac Catalyst build (ios-accounts `MAC_PROBE_BUILD`): built
 * by hand, signed ad hoc, from the apps/apple build-both.sh last synced
 * into the checkout's build folder, whose stamp that sync left beside it
 * (`<build>/tree`). It runs only when that stamp is this tree's and the
 * binary was built after that sync; else it says what to do.
 */
export function macProbeApp(top: string): { path: string; problem?: string } {
  const folder = join(APPLE_BUILDS, buildName(top));
  const path = join(
    folder,
    "DerivedData-macprobe/Build/Products/Debug-maccatalyst/CawCo.app/Contents/MacOS/CawCo"
  );
  const synced = join(folder, "tree");
  const sync = "bash apps/apple/scripts/build-both.sh ios";
  if (!existsSync(synced)) {
    return { path, problem: `nothing synced to ${folder}: run ${sync}` };
  }
  const stamp = readFileSync(synced, "utf8").trim();
  const tree = treeStamp(top);
  if (stamp !== tree) {
    return {
      path,
      problem: `${folder} holds apps/apple ${stamp.slice(0, 12)}, the tree is ${tree.slice(0, 12)}: run ${sync}, then the Mac probe build`,
    };
  }
  if (!existsSync(path) || statSync(path).mtimeMs < statSync(synced).mtimeMs) {
    return {
      path,
      problem: `no Mac probe build at ${path} since the last sync: build it (ios-accounts MAC_PROBE_BUILD)`,
    };
  }
  return { path };
}
