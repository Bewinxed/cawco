/**
 * A Linux workspace's dependencies, installed as it is cut, as hardlinks to
 * the files in the workspaces' bun cache (paths.ts `workspaceCacheEnv`), so
 * a clone pays for its own changes and not for every package again.
 *
 * Inside a boundary bun cannot link: the clone, its scratch dir and the
 * workspaces' cache are each a bind mount of their own, and link(2) refuses
 * across mount points even on one filesystem (link(2), EXDEV: "Linux permits
 * a filesystem to be mounted at multiple points, but link() does not work
 * across different mount points"). bun's hardlink backend then copies
 * (bun.com/docs/pm/cli/install: "When unavailable or on error, clonefile and
 * hardlink fall back to a platform-specific implementation of copying
 * files"): 2.0 GB of copies in every cockpit clone, every file of one link
 * (2026-10-16). On this host, before its boundary starts, the clone and the
 * cache are one mount, and bun links.
 *
 * Nothing of the repository runs on this host: `--ignore-scripts` ("Skip
 * lifecycle scripts for all packages, including the project's package.json
 * and trusted dependencies"), and HOME and the config dirs an empty folder,
 * so neither this user's `~/.npmrc` (its registry tokens) nor a global
 * bunfig is read; the cache is `--cache-dir`, which no project bunfig moves.
 * Every package whose install runs a script is then taken out again
 * ({@link scriptedPackages}), and the boundary's own `bun install`
 * ({@link finishInstall}) puts those back and runs their scripts inside it,
 * as any install there does. bun installs a package that is missing and
 * leaves one that is there (install docs: the isolated linker "checks only
 * that the package's store entry exists"), so that install copies those few
 * and runs only their scripts and the project's own.
 *
 * Only for a `bun.lock` or `bun.lockb` at the clone's root: other package
 * managers copy inside a boundary as before. On macOS bun clones files
 * (`clonefile`) inside its boundary already: Seatbelt makes no mounts.
 */
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import {
  depsScript,
  WORKSPACE_INSTALL_TIMEOUT_MS,
  type WorkspaceRef,
} from "@cawco/core";
import { workspaceCacheEnv, workspaceStateDir } from "@cawco/core/paths";
import { SAFE_GIT_SHELL } from "@cawco/core/safe-git";
import { hostEnvironment } from "@cawco/core/session-env";
import { runWorkflowCommand } from "./workflow-command";

const BUN_LOCKFILES = ["bun.lock", "bun.lockb"];

/** The lifecycle scripts bun runs as a dependency installs. */
const INSTALL_SCRIPTS = ["preinstall", "install", "postinstall"];

/** A package's own root: `node_modules/<name>` or `node_modules/@scope/<name>`. */
const PACKAGE_ROOT = /(^|\/)node_modules\/(@[^/]+\/)?[^/]+\/package\.json$/;
/** An isolated install's store entry: `node_modules/.bun/<entry>`. */
const STORE_ENTRY = /^(.*\/)?node_modules\/\.bun\/[^/]+(?=\/node_modules\/)/;

const exists = (path: string): Promise<boolean> =>
  stat(path).then(
    () => true,
    () => false
  );

/**
 * Whether bun runs a script as the package at `dir` installs: one of
 * {@link INSTALL_SCRIPTS}, or `node-gyp rebuild` for a `binding.gyp` with no
 * `install` or `preinstall` of its own (npm's default, which bun keeps).
 */
const runsScript = async (dir: string): Promise<boolean> => {
  const manifest = await readFile(join(dir, "package.json"), "utf8")
    .then((text) => JSON.parse(text) as { scripts?: Record<string, unknown> })
    .catch(() => undefined);
  const scripts = manifest?.scripts ?? {};
  if (INSTALL_SCRIPTS.some((name) => typeof scripts[name] === "string")) {
    return true;
  }
  return exists(join(dir, "binding.gyp"));
};

/**
 * What to take out of `clone`'s `node_modules` so its boundary's install
 * runs each install script there: the store entry of a package with one
 * (isolated linker), or the package's own folder (hoisted). Links are not
 * followed, so a workspace package of the repository is never one.
 */
const scriptedPackages = async (clone: string): Promise<string[]> => {
  const inDependencies = "*/node_modules/*";
  const listed = await Bun.$`/usr/bin/find ${clone} -xdev -path ${inDependencies} -name package.json -type f -print0`
    .quiet()
    .nothrow();
  const roots = listed.stdout
    .toString()
    .split("\0")
    .filter((file) => PACKAGE_ROOT.test(file))
    .map((file) => file.slice(0, -"/package.json".length));
  const scripted = await Promise.all(
    roots.map(async (dir) => ((await runsScript(dir)) ? dir : undefined))
  );
  const targets = new Set<string>();
  for (const dir of scripted) {
    if (dir) {
      targets.add(STORE_ENTRY.exec(dir)?.[0] ?? dir);
    }
  }
  return [...targets];
};

/**
 * Seeds the dependencies of workspace `id`'s clone at `path` on this host,
 * before its boundary starts. Answers whether it seeded: false where there
 * is nothing to seed (not Linux, no bun lockfile) or bun refused, which the
 * log says; the clone is then installed inside its boundary as before.
 */
export const seedDependencies = async (
  id: string,
  path: string
): Promise<boolean> => {
  if (process.platform !== "linux") {
    return false;
  }
  const found = await Promise.all(
    BUN_LOCKFILES.map((name) => exists(join(path, name)))
  );
  if (!found.some(Boolean)) {
    return false;
  }
  const cache = workspaceCacheEnv();
  const home = await mkdtemp(join(workspaceStateDir(id), "seed-home-"));
  const started = Date.now();
  try {
    const install = Bun.spawn(
      [
        "bun",
        "install",
        "--frozen-lockfile",
        "--ignore-scripts",
        "--backend",
        "hardlink",
        "--cache-dir",
        cache.BUN_INSTALL_CACHE_DIR,
        "--no-progress",
      ],
      {
        cwd: path,
        env: {
          ...hostEnvironment(),
          ...cache,
          HOME: home,
          XDG_CONFIG_HOME: home,
          NPM_CONFIG_USERCONFIG: join(home, ".npmrc"),
        },
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
        timeout: WORKSPACE_INSTALL_TIMEOUT_MS,
        killSignal: "SIGKILL",
      }
    );
    const [, stderr, code] = await Promise.all([
      new Response(install.stdout).text(),
      new Response(install.stderr).text(),
      install.exited,
    ]);
    if (code !== 0) {
      const why =
        install.signalCode === "SIGKILL"
          ? `it ran past ${WORKSPACE_INSTALL_TIMEOUT_MS / 1000}s`
          : stderr.trim().split("\n").slice(-3).join(" ");
      console.warn(
        `[workspace] ${id}: its dependencies were not linked from the workspaces' cache (${why}); they install inside its boundary as copies`
      );
      return false;
    }
    const scripted = await scriptedPackages(path);
    await Promise.all(
      scripted.map((dir) => rm(dir, { recursive: true, force: true }))
    );
    console.info(
      `[workspace] ${id}: its dependencies linked from the workspaces' cache in ${((Date.now() - started) / 1000).toFixed(1)}s; ${scripted.length} with install scripts left to its boundary (${scripted.map((dir) => relative(path, dir).split(sep).at(-1)).join(", ") || "none"})`
    );
    return true;
  } finally {
    await rm(home, { recursive: true, force: true });
  }
};

/**
 * The install a seeded clone's boundary finishes, as the hub's checks run it
 * (core `depsScript`): the packages {@link seedDependencies} left out, their
 * scripts and the project's own, then the lockfile's stamp, so a check finds
 * them installed. One that fails is logged, and its next install there runs
 * it again.
 */
export const finishInstall = async (workspace: WorkspaceRef): Promise<void> => {
  const result = await runWorkflowCommand(
    workspace.path,
    `${SAFE_GIT_SHELL}${depsScript()}`,
    WORKSPACE_INSTALL_TIMEOUT_MS,
    workspace
  );
  if (result.exitCode !== 0) {
    console.warn(
      `[workspace] ${workspace.id}: its install inside its boundary failed (exit ${result.exitCode}): ${(result.stderr || result.stdout).trim().split("\n").slice(-3).join(" ")}`
    );
  }
};
