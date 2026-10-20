/**
 * A project's install inside a clone's boundary, by the project's own package
 * manager with its frozen install: the lockfile as committed, never
 * rewritten. A place's stage clone installs what its stage serves this way
 * (stage-clone.ts `installAt`), and a workspace cut again installs what its
 * retired clone had installed (workspace.ts `reinstall`). Under the
 * workspace's bunfig and pnpm config the install links from the workspaces'
 * cache (boundary.ts `writeBunConfig`, `writePnpmConfig`).
 */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { LOCKFILES, type WorkspaceRef } from "@cawco/core";
import { runWorkflowCommand } from "./workflow-command";

/** The package managers a clone installs with. */
type Manager = "npm" | "pnpm" | "yarn" | "bun";

const MANAGERS: readonly Manager[] = ["npm", "pnpm", "yarn", "bun"];

/** Each lockfile and the manager it names, in core deps.ts `LOCKFILES` order. */
const LOCK_MANAGER: Record<(typeof LOCKFILES)[number], Manager> = {
  "bun.lock": "bun",
  "bun.lockb": "bun",
  "pnpm-lock.yaml": "pnpm",
  "package-lock.json": "npm",
  "yarn.lock": "yarn",
};

/** How a machine gets each manager, from its own install page. */
const HOW_TO_GET: Record<Manager, string> = {
  npm: "install Node.js, which brings npm (nodejs.org/en/download)",
  pnpm: "run `corepack enable pnpm` or `npm install -g pnpm` (pnpm.io/installation)",
  yarn: "run `corepack enable yarn` or `npm install -g yarn` (yarnpkg.com/getting-started/install)",
  bun: "run `curl -fsSL https://bun.com/install | bash` (bun.com/docs/installation)",
};

/** What a missing manager's check prints, for the daemon to read. */
const NO_MANAGER = "cawco-install: no package manager";

/** The project a folder installs as: its folder, its manager and what named it. */
export interface Install {
  dir: string;
  /** The major version its `packageManager` names, when it names one. */
  major?: number;
  manager: Manager;
  /** What named the manager, in words: `its packageManager pnpm@9.1.0`, `its yarn.lock`. */
  named: string;
}

/** What an install leaves in its folder: `node_modules`, or Yarn Plug'n'Play's loader in its place. */
export const INSTALLED = ["node_modules", ".pnp.cjs"];

/** A folder's package.json's `packageManager`, or nothing where it has no package.json or names none; one that does not parse is refused with why. */
const packageManagerIn = async (dir: string): Promise<string | undefined> => {
  const file = join(dir, "package.json");
  const text = await readFile(file, "utf8").catch(() => undefined);
  if (text === undefined) {
    return;
  }
  let field: unknown;
  try {
    field = (JSON.parse(text) as { packageManager?: unknown }).packageManager;
  } catch (error) {
    throw new Error(
      `${file} does not parse as JSON (${error instanceof Error ? error.message : String(error)}), so CawCo can't read which package manager installs it.`,
      { cause: error }
    );
  }
  return typeof field === "string" && field ? field : undefined;
};

/**
 * The project the folder `from` in the clone at `clone` installs as: the
 * nearest folder from it up to the clone's root whose package.json names a
 * `packageManager` (nodejs.org/api/corepack.html: it "defines which package
 * manager is expected to be used"), else that holds a lockfile, which names
 * it. Refused in words when none does: CawCo never guesses a manager. `repo`
 * is the folder the clone stands for, which the words name.
 */
export const installOf = async (
  clone: string,
  repo: string,
  from: string
): Promise<Install> => {
  for (let dir = from; ; dir = dirname(dir)) {
    // biome-ignore lint/performance/noAwaitInLoops: the nearest folder that names its manager, one folder at a time
    const field = await packageManagerIn(dir);
    if (field) {
      const [name = "", version = ""] = field.split("@");
      const manager = MANAGERS.find((one) => one === name);
      if (!manager) {
        throw new Error(
          `${join(repo, relative(clone, dir))}'s package.json names ${field} as its packageManager, and CawCo installs with npm, pnpm, yarn or bun.`
        );
      }
      const major = Number.parseInt(version, 10);
      return {
        dir,
        manager,
        named: `its packageManager ${field}`,
        ...(Number.isNaN(major) ? {} : { major }),
      };
    }
    const lock = LOCKFILES.find((name) => existsSync(join(dir, name)));
    if (lock) {
      return { dir, manager: LOCK_MANAGER[lock], named: `its ${lock}` };
    }
    if (dir === clone || relative(clone, dir).startsWith("..")) {
      break;
    }
  }
  throw new Error(
    `${join(repo, relative(clone, from))} has no lockfile (${LOCKFILES.join(", ")}) and no packageManager in a package.json up to its repository's root, so CawCo can't tell which package manager installs it: commit the project's lockfile, then call again.`
  );
};

/** A manager's frozen install: the lockfile as committed, never rewritten. */
export const frozenInstall = (install: Install): string => {
  switch (install.manager) {
    case "npm":
      return "npm ci";
    case "pnpm":
      return "pnpm install --frozen-lockfile";
    case "bun":
      return "bun install --frozen-lockfile";
    case "yarn":
      // Yarn 2 on refuses `--frozen-lockfile` for `--immutable`; Yarn 1 has only the first.
      if (install.major === undefined) {
        return 'if [ "$(yarn --version | cut -d. -f1)" -ge 2 ]; then yarn install --immutable; else yarn install --frozen-lockfile; fi';
      }
      return install.major >= 2
        ? "yarn install --immutable"
        : "yarn install --frozen-lockfile";
    default: {
      const unhandled: never = install.manager;
      throw new Error(`unhandled manager: ${String(unhandled)}`);
    }
  }
};

/**
 * `install` run inside the clone's `boundary` by its manager's frozen install
 * ({@link frozenInstall}), within `timeoutMs`. Refused in words when the
 * machine has no such manager, or the install fails; `where` is the folder
 * the words name, `what` the clone they say it did not install in. Answers
 * the command it ran.
 */
export const runInstall = async (
  boundary: WorkspaceRef,
  install: Install,
  where: string,
  what: string,
  timeoutMs: number
): Promise<string> => {
  const command = frozenInstall(install);
  const result = await runWorkflowCommand(
    install.dir,
    `command -v ${install.manager} >/dev/null 2>&1 || { echo '${NO_MANAGER}'; exit 127; }\n${command}`,
    timeoutMs,
    boundary
  );
  if (result.stdout.includes(NO_MANAGER)) {
    throw new Error(
      `${where} installs with ${install.manager} (${install.named}), and this machine has no ${install.manager}: ${HOW_TO_GET[install.manager]}, then call again.`
    );
  }
  if (result.exitCode !== 0) {
    throw new Error(
      `${where} did not install in ${what}: \`${command}\` (${install.named}) exited ${result.exitCode}: ${(result.stderr || result.stdout).trim().split("\n").slice(-3).join(" ")}`
    );
  }
  return command;
};
