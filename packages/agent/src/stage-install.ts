/**
 * A stage's project installed as its lockfile names it, before the stage
 * serves (stage.ts `start`): one path for every stage, a delegate's
 * workspace's sheet or server and a place's stage clone's sheet alike.
 *
 * On 2026-10-29 a workspace's `apps/dashboard` dev server, started after
 * its workspace was fast-forwarded to a main that added dependencies
 * (`@terrazzo/parser` among them), answered every page with Vite's "500
 * Internal Error" until `bun install --frozen-lockfile` ran there by hand:
 * the stage started on whatever `node_modules` held. So install is part of
 * a stage's readiness:
 *
 * - the project a stage's folder installs as ({@link installOf}) is found
 *   from it up: the `packageManager` a package.json names (Corepack's
 *   field), else the lockfile a folder holds;
 * - what it installs from (its manager's frozen install, its package.json
 *   and lockfiles) is hashed at each install and kept with the workspace
 *   ({@link RECORD}); a start or wake whose hash differs, or whose folder
 *   has no `node_modules`, installs first ({@link installProject}), and a
 *   live stage whose hash moves is installed and started again
 *   ({@link installMoved}, read by stage.ts);
 * - the install runs inside the stage's boundary by that manager, its
 *   failure thrown with the installer's last lines, which the stage shows as
 *   its error.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, rm, stat } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import {
  LOCKFILES,
  PACKAGE_MANAGERS,
  type PackageManager,
  type WorkspaceRef,
} from "@cawco/core";
import { workspaceStateDir } from "@cawco/core/paths";
import { STAGE_INSTALL_MS } from "@cawco/core/stage";
import { readRecord, writeStateFile } from "@cawco/core/state-file";
import { unhandled } from "@cawco/core/unhandled";
import { z } from "zod";
import { runHubCommand } from "./hub-command";

/** Each lockfile and the manager it names, in core move.ts `LOCKFILES` order. */
const LOCK_MANAGER: Record<(typeof LOCKFILES)[number], PackageManager> = {
  "bun.lock": "bun",
  "bun.lockb": "bun",
  "pnpm-lock.yaml": "pnpm",
  "package-lock.json": "npm",
  "yarn.lock": "yarn",
};

/** How a machine gets each manager, from its own install page. */
const HOW_TO_GET: Record<PackageManager, string> = {
  npm: "install Node.js, which brings npm (nodejs.org/en/download)",
  pnpm: "run `corepack enable pnpm` or `npm install -g pnpm` (pnpm.io/installation)",
  yarn: "run `corepack enable yarn` or `npm install -g yarn` (yarnpkg.com/getting-started/install)",
  bun: "run `curl -fsSL https://bun.com/install | bash` (bun.com/docs/installation)",
};

/** What a missing manager's check prints, for the daemon to read. */
const NO_MANAGER = "cawco-stage: no package manager";

/** How many of the installer's last lines a failed install says. Ours. */
const LAST_LINES = 5;

/** What an install leaves in its folder: `node_modules`, or Yarn Plug'n'Play's loader in its place. */
const INSTALLED = ["node_modules", ".pnp.cjs"];

/** The files an install reads: a change to one installs it again. */
const INPUTS = ["package.json", ...LOCKFILES];

/** The project a folder installs as: its folder, its manager and what named it. */
interface Install {
  dir: string;
  /** The major version its `packageManager` names, when it names one. */
  major?: number;
  manager: PackageManager;
  /** What named the manager, in words: `its packageManager pnpm@9.1.0`, `its yarn.lock`. */
  named: string;
}

/**
 * Where a stage's project is: the boundary it installs in, the folder it
 * runs from (absolute, in the boundary's tree), and how the person names the
 * boundary's root (a place's checkout, for its stage clone).
 */
export interface ProjectAt {
  readonly boundary: WorkspaceRef;
  readonly from: string;
  /** The person's own path for `boundary.path`. */
  readonly shownAs: string;
}

/** A folder of the boundary's tree as the person names it. */
const shown = (at: ProjectAt, dir: string): string =>
  join(at.shownAs, relative(at.boundary.path, dir));

/** A folder's package.json's `packageManager`, or nothing where it has no package.json or names none; one that does not parse is refused with why. */
const packageManagerIn = async (dir: string): Promise<string | undefined> => {
  const file = join(dir, "package.json");
  const text = await readFile(file, "utf8").catch(() => undefined);
  if (text === undefined) {
    return;
  }
  let field: unknown;
  try {
    field = z
      .object({ packageManager: z.unknown().optional() })
      .parse(JSON.parse(text)).packageManager;
  } catch (error) {
    throw new Error(
      `${file} does not parse as JSON (${error instanceof Error ? error.message : String(error)}), so the stage can't read which package manager installs it.`,
      { cause: error }
    );
  }
  return typeof field === "string" && field ? field : undefined;
};

/**
 * The project `at.from` installs as: the nearest folder from it up to the
 * boundary's root whose package.json names a `packageManager`
 * (nodejs.org/api/corepack.html: it "defines which package manager is
 * expected to be used"), else that holds a lockfile, which names it. Null
 * when none does: the stage never guesses a manager.
 */
const installOf = async (at: ProjectAt): Promise<Install | null> => {
  const top = at.boundary.path;
  for (let dir = at.from; ; dir = dirname(dir)) {
    const field = await packageManagerIn(dir);
    if (field) {
      const [name = "", version = ""] = field.split("@");
      const manager = PACKAGE_MANAGERS.find((one) => one === name);
      if (!manager) {
        throw new Error(
          `${shown(at, dir)}'s package.json names ${field} as its packageManager, and a stage installs with npm, pnpm, yarn or bun.`
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
    if (
      dir === top ||
      dirname(dir) === dir ||
      relative(top, dir).startsWith("..")
    ) {
      return null;
    }
  }
};

/** A manager's frozen install: the lockfile as committed, never rewritten. */
const frozenInstall = (install: Install): string => {
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
    default:
      unhandled("manager", install.manager);
  }
};

/** Each folder's last hash, by the size and change time of its inputs then: a live stage's look stats them, and hashes only when one moved. */
const hashed = new Map<string, { hash: string; stamp: string }>();

/** What the install at `dir` installs from, hashed: its command, package.json and lockfiles. */
const inputsOf = async (dir: string, command: string): Promise<string> => {
  const stats = await Promise.all(
    INPUTS.map((name) => stat(join(dir, name)).catch(() => undefined))
  );
  const stamp = `${command}\0${stats.map((one) => (one ? `${one.size}:${one.mtimeMs}` : "-")).join(" ")}`;
  const last = hashed.get(dir);
  if (last?.stamp === stamp) {
    return last.hash;
  }
  const hash = createHash("sha256").update(command);
  for (const name of INPUTS) {
    const bytes = await readFile(join(dir, name)).catch(() => undefined);
    hash.update(`\0${name}\0`);
    if (bytes) {
      hash.update(bytes);
    }
  }
  const digest = hash.digest("hex");
  hashed.set(dir, { hash: digest, stamp });
  return digest;
};

/** Where a workspace keeps what each of its folders was installed from, by folder from its root. */
const RECORD = "stage-installed.json";
const RecordSchema = z.record(z.string(), z.string());

const recordOf = (id: string) => join(workspaceStateDir(id), RECORD);

const readInstalled = async (id: string): Promise<Record<string, string>> =>
  (await readRecord(recordOf(id), RecordSchema).catch(() => undefined)) ?? {};

/** Forgets every install of workspace `id`: a stage clone cut again has none. */
export const forgetInstalls = (id: string): Promise<void> =>
  rm(recordOf(id), { force: true });

/** What a project at `at` installs, and whether its folder stands installed from the inputs it has now. */
const lookAt = async (at: ProjectAt) => {
  const install = await installOf(at);
  if (!install) {
    return null;
  }
  const command = frozenInstall(install);
  const key = relative(at.boundary.path, install.dir) || ".";
  const inputs = await inputsOf(install.dir, command);
  const current =
    (await readInstalled(at.boundary.id))[key] === inputs &&
    INSTALLED.some((name) => existsSync(join(install.dir, name)));
  return { install, command, key, inputs, current };
};

/**
 * Whether the project at `at` no longer stands installed from what it
 * installs from: its lockfile or package.json moved since its install, or
 * its `node_modules` went. False for a folder no manager names.
 */
export const installMoved = async (at: ProjectAt): Promise<boolean> => {
  const look = await lookAt(at);
  return look !== null && !look.current;
};

/** Each install under way, by boundary and folder: a second ask joins it. */
const installing = new Map<string, Promise<void>>();

/**
 * The project at `at` installed inside its boundary by its manager's frozen
 * install, unless it stands installed from the inputs it has now. A folder
 * no manager names is refused in words when `required` (a sheet in a stage
 * clone, whose `node_modules` only this makes) and left as it is otherwise.
 * Refused in words when the machine has no such manager, or the install
 * fails, with the installer's last lines.
 */
export const installProject = async (
  at: ProjectAt,
  required: boolean
): Promise<void> => {
  const look = await lookAt(at);
  if (!look) {
    if (required) {
      throw new Error(
        `${shown(at, at.from)} has no lockfile (${LOCKFILES.join(", ")}) and no packageManager in a package.json up to its repository's root, so the stage can't tell which package manager installs it: commit the project's lockfile, then call again.`
      );
    }
    return;
  }
  if (look.current) {
    return;
  }
  const turn = `${at.boundary.id}:${look.key}`;
  const under = installing.get(turn);
  if (under) {
    return under;
  }
  const run = runInstall(at, look).finally(() => installing.delete(turn));
  installing.set(turn, run);
  return run;
};

const runInstall = async (
  at: ProjectAt,
  {
    install,
    command,
    key,
    inputs,
  }: NonNullable<Awaited<ReturnType<typeof lookAt>>>
): Promise<void> => {
  const where = shown(at, install.dir);
  const result = await runHubCommand(
    install.dir,
    `command -v ${install.manager} >/dev/null 2>&1 || { echo '${NO_MANAGER}'; exit 127; }\n${command}`,
    STAGE_INSTALL_MS,
    at.boundary,
    undefined,
    // A heavy run: it waits for one of the machine's heavy-work slots.
    `the stage's install of ${where}@${at.boundary.id.slice(0, 8)}`
  );
  if (result.stdout.includes(NO_MANAGER)) {
    throw new Error(
      `${where} installs with ${install.manager} (${install.named}), and this machine has no ${install.manager}: ${HOW_TO_GET[install.manager]}, then call again.`
    );
  }
  if (result.exitCode !== 0) {
    const last = (result.stderr || result.stdout)
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(-LAST_LINES)
      .join("\n");
    throw new Error(
      `${where} did not install: \`${command}\` (${install.named}) exited ${result.exitCode}:\n${last}`
    );
  }
  const record = await readInstalled(at.boundary.id);
  await writeStateFile(
    recordOf(at.boundary.id),
    `${JSON.stringify({ ...record, [key]: inputs })}\n`
  );
  console.info(
    `[stage] ${at.boundary.id.slice(0, 8)}: ${key} installed with \`${command}\` (${install.named})`
  );
};
