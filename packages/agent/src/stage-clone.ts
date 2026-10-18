/**
 * A place's stage clone: where the sheet stage of a session with no workspace
 * of its own runs (stage.ts), cut from the checkout the session works in.
 *
 * A stage's toolchain writes into the tree it serves: SvelteKit's sync writes
 * the tsconfig its project extends into `node_modules` (kit 3.1
 * `write_parent_tsconfig`: `path.join(root, \`node_modules/${id}.json\`)`),
 * its types under `node_modules/$app/types` and its output in `.svelte-kit/`.
 * A place's boundary holds every `node_modules` read-only
 * (workspace-policy.ts `linkedIn`), so the dashboard's stage died with
 * "EROFS: read-only file system, open '…/apps/dashboard/node_modules/$app/
 * tsconfig.json'"; and a shared repository root is never a stage's to write.
 * So it runs in a clone of its own, as a delegate's does:
 *
 * - cut ({@link cut}) at the checkout's HEAD (that one commit, fetched from
 *   the checkout, its `origin`) with its uncommitted changes and its own
 *   secret files, under a workspace id of its own (core `stageCloneId`),
 *   never a place's: its `node_modules` are its own to write;
 * - installed by the project's own package manager inside its boundary
 *   ({@link installStage}): the `packageManager` its package.json names
 *   (Corepack's field), else the one its lockfile names, with that manager's
 *   frozen install, where its bun links from the workspaces' cache
 *   (boundary.ts `writeBunConfig`);
 * - kept in step with the checkout ({@link syncStageClone}): a new HEAD
 *   fetched and checked out, then every path the checkout's `git status`
 *   names, and every one it named the time before, made in the clone as it
 *   is in the checkout. Before each use of the stage, and every
 *   {@link MIRROR_MS} while it serves, so the session's edits reach an open
 *   sheet through its HMR, as a delegate's own edits do;
 * - a sheet's write, made by the stage in the clone, copied to the
 *   checkout's story file ({@link copyBack}), in the same turn as the
 *   mirror, so neither undoes the other;
 * - filed with the hub as a workspace of the stage kind on each use
 *   ({@link setStageCloneSink}), so the hub's retire sweep settles it like
 *   any workspace once its stage sleeps: what it holds that the checkout
 *   lacks keeps it ({@link sameAsCheckout} names what it does not), and the
 *   next sheet cuts it again.
 *
 * The checkout is only read: its status without optional locks (git writes
 * no index there), its HEAD fetched from it. Only the story file a person's
 * sheet edit names is written back.
 */
import { createHash } from "node:crypto";
import { constants, existsSync } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  readlink,
  realpath,
  rename,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, sep } from "node:path";
import { LOCKFILES, type WorkspaceRef } from "@cawco/core";
import { readWithin } from "@cawco/core/bounded";
import { workspaceScratchDir, workspaceStateDir } from "@cawco/core/paths";
import { SAFE_GIT_ENV, safeGitArgv } from "@cawco/core/safe-git";
import { hostEnvironment } from "@cawco/core/session-env";
import {
  STAGE_CLONE_GIT_MS,
  STAGE_CLONE_INSTALL_MS,
  type StageCloneFrame,
} from "@cawco/core/stage";
import { readRecord, writeStateFile } from "@cawco/core/state-file";
import { cloneDenies, stageCloneId } from "@cawco/core/workspace-policy";
import { ensureBoundary, stopWorkspaceBoundary } from "./boundary";
import { expandHome } from "./fs";
import { runWorkflowCommand } from "./workflow-command";
import { copyOwnSecrets, gitUntil } from "./workspace";

/** How often a serving place stage's clone is brought in step with its checkout. Ours: an edit shows within a second, for one `git status` (20 ms on cockpit). */
export const MIRROR_MS = 1000;

/** Where a place's stage runs: its clone's boundary, and the place's folder as it stands in the clone. */
export interface StageClone {
  readonly boundary: WorkspaceRef;
  /** The place's folder in the clone: what the session's paths resolve against. */
  readonly folder: string;
}

/** The form of the clone this build cuts: one of an earlier form (no `origin`) is cut again. */
const FORM = 2;

/** What the agent keeps of a stage clone beside its `create.json`, written once its cut is whole. */
interface Kept {
  form?: number;
  /** The checkout's HEAD the clone is at. */
  head: string;
  /** Each folder the stage installed, from the clone's root, with what it installed from ({@link installAt}). */
  installed?: Record<string, string>;
  /** The paths the checkout's status named at the last mirror, from the repository's root. */
  mirrored: string[];
  /** The checkout's repository root it was cut from, as a real path. */
  repo: string;
}

const KEPT = "stage-clone.json";

/** Whether workspace `id` is a place's stage clone this machine cut. */
export const isStageClone = (id: string): boolean =>
  existsSync(join(workspaceStateDir(id), KEPT));

let filed: (frame: StageCloneFrame) => void = () => undefined;

/** Where each clone's word goes: the daemon's socket to the hub, which files it as a workspace. */
export const setStageCloneSink = (send: (frame: StageCloneFrame) => void) => {
  filed = send;
};

/** Each clone's cut, mirror or write-back under way: one at a time per clone. */
const turns = new Map<string, Promise<unknown>>();

/** `work` on stage clone `id`, after whatever it is doing now. */
export const inCloneTurn = <T>(
  id: string,
  work: () => Promise<T>
): Promise<T> => {
  const mine = (turns.get(id) ?? Promise.resolve())
    .catch(() => undefined)
    .then(work);
  turns.set(id, mine);
  const forget = () => {
    if (turns.get(id) === mine) {
      turns.delete(id);
    }
  };
  mine.then(forget, forget);
  return mine;
};

/** Each source file's size and change time when it was last made in the clone, by clone and path: one unchanged since is not read again. */
const copied = new Map<string, Map<string, string>>();

/**
 * git on this host, as safe-git.ts says, within {@link STAGE_CLONE_GIT_MS}:
 * its whole stdout, or git's stderr thrown. Never takes optional locks, so a
 * status in a person's checkout writes nothing there.
 */
const gitRaw = async (
  dir: string,
  args: readonly string[]
): Promise<string> => {
  const ran = await readWithin(STAGE_CLONE_GIT_MS, async (signal) => {
    const child = Bun.spawn(
      safeGitArgv(["--no-optional-locks", "-C", dir, ...args]),
      {
        env: { ...hostEnvironment(), ...SAFE_GIT_ENV },
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
        signal,
        killSignal: "SIGKILL",
      }
    );
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    if (code !== 0) {
      throw new Error(
        `git ${args[0]} failed in ${dir}: ${stderr.trim() || `exit ${code}`}`
      );
    }
    return stdout;
  });
  switch (ran.kind) {
    case "answered":
      return ran.value;
    case "unanswered":
      throw new Error(
        `git ${args[0]} in ${dir} did not finish within ${STAGE_CLONE_GIT_MS / 1000}s`
      );
    default: {
      const unhandled: never = ran;
      throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
    }
  }
};

/** A porcelain v2 entry's path: what follows its `fields` space-separated fields. */
const pathAfter = (entry: string, fields: number): string => {
  let at = 0;
  for (let field = 0; field < fields; field += 1) {
    at = entry.indexOf(" ", at) + 1;
  }
  return entry.slice(at);
};

/**
 * A checkout's HEAD and every path its status names (changed, staged,
 * deleted, unmerged, untracked; renames as the two paths they are), from
 * its repository's root. Ignored files are not named: they are no one's
 * change, as a delegate's clone has none either.
 */
const statusOf = async (
  repo: string
): Promise<{ head: string; paths: string[] }> => {
  const out = await gitRaw(repo, [
    "status",
    "--porcelain=v2",
    "-z",
    "--branch",
    "--untracked-files=all",
    "--no-renames",
  ]);
  let head = "";
  const paths: string[] = [];
  for (const entry of out.split("\0")) {
    if (entry.startsWith("# branch.oid ")) {
      head = entry.slice("# branch.oid ".length);
    } else if (entry.startsWith("1 ")) {
      paths.push(pathAfter(entry, 8));
    } else if (entry.startsWith("u ")) {
      paths.push(pathAfter(entry, 10));
    } else if (entry.startsWith("? ")) {
      paths.push(entry.slice(2));
    }
  }
  return { head, paths };
};

/** Whether `path` lies under no CawCo-held path of a clone (core `cloneDenies`): those are the boundary's, never mirrored. */
const mirrorable = (clone: string, path: string): boolean =>
  !cloneDenies(clone).some(({ path: held }) => {
    const rel = relative(clone, held);
    return path === rel || path.startsWith(`${rel}/`);
  });

/**
 * Whether every folder from the clone's root down to `path`'s own is a
 * folder of the clone's (never a link): the clone's boundary writes it, and
 * a link it planted would lead this host's write out of the clone.
 */
const foldersOwn = async (clone: string, path: string): Promise<boolean> => {
  const parts = path.split("/").slice(0, -1);
  let at = clone;
  for (const part of parts) {
    at = join(at, part);
    // biome-ignore lint/performance/noAwaitInLoops: each folder is looked at before the one inside it
    const found = await lstat(at).catch(() => undefined);
    if (!found) {
      await mkdir(at);
    } else if (!found.isDirectory()) {
      return false;
    }
  }
  return true;
};

/**
 * Writes `bytes` (or a link to `link`) at `path` in the clone as a new entry
 * renamed over whatever stood there, never through it.
 */
const placeIn = async (
  clone: string,
  path: string,
  made: { bytes: Buffer; mode: number } | { link: string }
): Promise<boolean> => {
  if (!(await foldersOwn(clone, path))) {
    console.warn(
      `[stage] the clone ${clone} has a link on the way to ${path}: it was not written there`
    );
    return false;
  }
  const to = join(clone, path);
  const fresh = join(dirname(to), `.cawco-mirror-${crypto.randomUUID()}`);
  try {
    if ("link" in made) {
      await symlink(made.link, fresh);
    } else {
      // `wx`: a new file, never one a link names.
      await writeFile(fresh, made.bytes, { flag: "wx", mode: made.mode });
      await chmod(fresh, made.mode);
    }
    const there = await lstat(to).catch(() => undefined);
    if (there?.isDirectory()) {
      await rm(to, { recursive: true, force: true });
    }
    await rename(fresh, to);
  } finally {
    await rm(fresh, { force: true });
  }
  return true;
};

/** A file mode's permission bits (chmod(2)'s whole range). */
const permissions = (mode: number): number => mode % 0o1_0000;

/** Makes `path` in the clone as it is in the checkout at `repo`; whether it changed anything. */
const mirrorOne = async (
  repo: string,
  clone: string,
  path: string,
  seen: Map<string, string>
): Promise<boolean> => {
  const from = join(repo, path);
  const to = join(clone, path);
  const source = await lstat(from).catch(() => undefined);
  const there = await lstat(to).catch(() => undefined);
  if (!source) {
    seen.delete(path);
    if (!there || there.isDirectory()) {
      return false;
    }
    if (!(await foldersOwn(clone, path))) {
      return false;
    }
    await rm(to, { force: true });
    return true;
  }
  const stamp = `${source.mode} ${source.size} ${source.mtimeMs}`;
  if (seen.get(path) === stamp && there) {
    return false;
  }
  let changed = false;
  if (source.isSymbolicLink()) {
    const link = await readlink(from);
    const now = there?.isSymbolicLink() ? await readlink(to) : undefined;
    if (now !== link) {
      changed = await placeIn(clone, path, { link });
    }
  } else if (source.isFile()) {
    const bytes = await readFile(from);
    const now = there?.isFile() ? await readFile(to) : undefined;
    const mode = permissions(source.mode);
    if (!(now?.equals(bytes) && permissions(there?.mode ?? 0) === mode)) {
      changed = await placeIn(clone, path, { bytes, mode });
    }
  }
  seen.set(path, stamp);
  return changed;
};

/** The clone's record, or nothing when its cut never finished. */
const keptOf = async (id: string): Promise<Kept | undefined> =>
  await readRecord<Kept>(join(workspaceStateDir(id), KEPT)).catch(
    () => undefined
  );

const keep = (id: string, kept: Kept): Promise<void> =>
  writeStateFile(
    join(workspaceStateDir(id), KEPT),
    `${JSON.stringify(kept)}\n`
  );

/** The ref the checkout's HEAD is fetched to in the clone: on its `origin`, so a retirement's read finds nothing of the clone's own in it (workspace.ts `holding`). */
const STAGE_REF = "refs/remotes/origin/stage";

/**
 * The checkout's HEAD fetched into the clone and checked out, detached: one
 * commit, from the checkout, which is the clone's `origin`. Its tracked files
 * then stand as at that commit, and the mirror lays the uncommitted changes
 * on top.
 */
const atHead = async (clone: string): Promise<void> => {
  const git = gitUntil(Date.now() + STAGE_CLONE_GIT_MS);
  await git(
    clone,
    "fetch",
    "--quiet",
    "--depth=1",
    "--no-tags",
    "origin",
    `+HEAD:${STAGE_REF}`
  );
  await git(clone, "checkout", "--quiet", "--force", "--detach", STAGE_REF);
};

/**
 * Makes the clone as the checkout is: its HEAD when that moved, then every
 * path its status names now or named at the last mirror. Answers the paths
 * it changed and the record as it stands now.
 */
const mirror = async (
  boundary: WorkspaceRef,
  kept: Kept
): Promise<{ changed: string[]; kept: Kept }> => {
  const { head, paths } = await statusOf(kept.repo);
  if (head !== kept.head) {
    await atHead(boundary.path);
  }
  const seen = copied.get(boundary.id) ?? new Map<string, string>();
  copied.set(boundary.id, seen);
  if (head !== kept.head) {
    // The checkout moved every tracked file in the clone: none is as copied.
    seen.clear();
  }
  const named = [...new Set([...paths, ...kept.mirrored])].filter((path) =>
    mirrorable(boundary.path, path)
  );
  const changed: string[] = [];
  for (const path of named) {
    // biome-ignore lint/performance/noAwaitInLoops: one path at a time, each folder made before what goes in it
    if (await mirrorOne(kept.repo, boundary.path, path, seen)) {
      changed.push(path);
    }
  }
  return { changed, kept: { ...kept, head, mirrored: paths } };
};

/** The package managers a stage clone installs with. */
type Manager = "npm" | "pnpm" | "yarn" | "bun";

const MANAGERS: readonly Manager[] = ["npm", "pnpm", "yarn", "bun"];

/** Each lockfile and the manager it names, in core move.ts `LOCKFILES` order. */
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
const NO_MANAGER = "cawco-stage: no package manager";

/** The project a toolchain root installs as: its folder, its manager and what named it. */
interface Install {
  dir: string;
  /** The major version its `packageManager` names, when it names one. */
  major?: number;
  manager: Manager;
  /** What named the manager, in words: `its packageManager pnpm@9.1.0`, `its yarn.lock`. */
  named: string;
}

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
      `${file} does not parse as JSON (${error instanceof Error ? error.message : String(error)}), so the stage can't read which package manager installs it.`,
      { cause: error }
    );
  }
  return typeof field === "string" && field ? field : undefined;
};

/**
 * The project the toolchain root `from` installs as: the nearest folder from
 * it up to the clone's root whose package.json names a `packageManager`
 * (nodejs.org/api/corepack.html: it "defines which package manager is
 * expected to be used"), else that holds a lockfile, which names it. Refused
 * in words when none does: the stage never guesses a manager.
 */
const installOf = async (
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
          `${join(repo, relative(clone, dir))}'s package.json names ${field} as its packageManager, and a sheet's stage installs with npm, pnpm, yarn or bun.`
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
    `${join(repo, relative(clone, from))} has no lockfile (${LOCKFILES.join(", ")}) and no packageManager in a package.json up to its repository's root, so the stage can't tell which package manager installs it: commit the project's lockfile, then call again.`
  );
};

/** The files a project installs from: a change to one installs it again. */
const MANIFESTS: ReadonlySet<string> = new Set(["package.json", ...LOCKFILES]);

/** What an install leaves in its folder: `node_modules`, or Yarn Plug'n'Play's loader in its place. */
const INSTALLED = ["node_modules", ".pnp.cjs"];

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
    default: {
      const unhandled: never = install.manager;
      throw new Error(`unhandled manager: ${String(unhandled)}`);
    }
  }
};

/** What the install at `dir` installs from: its command, lockfiles and package.json, hashed. */
const inputsOf = async (dir: string, command: string): Promise<string> => {
  const hash = createHash("sha256").update(command);
  for (const name of ["package.json", ...LOCKFILES]) {
    // biome-ignore lint/performance/noAwaitInLoops: a handful of small files, hashed in order
    const bytes = await readFile(join(dir, name)).catch(() => undefined);
    hash.update(`\0${name}\0`);
    if (bytes) {
      hash.update(bytes);
    }
  }
  return hash.digest("hex");
};

/**
 * The project the toolchain root `root` (absolute, in the clone) installs as
 * ({@link installOf}), installed inside the clone's boundary by its manager's
 * frozen install, unless it is installed from the same inputs already.
 * Refused in words when the machine has no such manager, or the install
 * fails. Answers the record with what it installed.
 */
const installAt = async (
  boundary: WorkspaceRef,
  kept: Kept,
  root: string
): Promise<Kept> => {
  const install = await installOf(boundary.path, kept.repo, root);
  const command = frozenInstall(install);
  const key = relative(boundary.path, install.dir) || ".";
  const inputs = await inputsOf(install.dir, command);
  if (
    kept.installed?.[key] === inputs &&
    INSTALLED.some((name) => existsSync(join(install.dir, name)))
  ) {
    return kept;
  }
  const where = join(kept.repo, relative(boundary.path, install.dir));
  const result = await runWorkflowCommand(
    install.dir,
    `command -v ${install.manager} >/dev/null 2>&1 || { echo '${NO_MANAGER}'; exit 127; }\n${command}`,
    STAGE_CLONE_INSTALL_MS,
    boundary
  );
  if (result.stdout.includes(NO_MANAGER)) {
    throw new Error(
      `${where} installs with ${install.manager} (${install.named}), and this machine has no ${install.manager}: ${HOW_TO_GET[install.manager]}, then call again.`
    );
  }
  if (result.exitCode !== 0) {
    throw new Error(
      `${where} did not install in the stage's clone: \`${command}\` (${install.named}) exited ${result.exitCode}: ${(result.stderr || result.stdout).trim().split("\n").slice(-3).join(" ")}`
    );
  }
  console.info(
    `[stage] ${boundary.id}: ${key} installed with \`${command}\` (${install.named})`
  );
  return { ...kept, installed: { ...kept.installed, [key]: inputs } };
};

/**
 * A whole clone brought in step ({@link mirror}), its record kept when
 * anything moved; a package manifest or lockfile among what changed installs
 * each project it installed before again ({@link installAt}, which installs
 * only when its inputs changed). The paths it changed.
 */
const step = async (boundary: WorkspaceRef, kept: Kept): Promise<string[]> => {
  const { changed, kept: mirrored } = await mirror(boundary, kept);
  let now = mirrored;
  const manifests = changed.some((path) => MANIFESTS.has(basename(path)));
  if (manifests) {
    for (const key of Object.keys(now.installed ?? {})) {
      try {
        // biome-ignore lint/performance/noAwaitInLoops: one install at a time in one boundary
        now = await installAt(boundary, now, join(boundary.path, key));
      } catch (error) {
        console.warn(
          `[stage] ${boundary.id}: ${key} did not install again: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }
  if (JSON.stringify(now) !== JSON.stringify(kept)) {
    await keep(boundary.id, now);
  }
  return changed;
};

/**
 * Cuts place `place`'s stage clone at `boundary.path` from the checkout at
 * `repo` (a real path): `git init`, the checkout as its `origin`, its HEAD
 * fetched and checked out ({@link atHead}), its uncommitted changes mirrored,
 * its own secret files copied (workspace.ts `copyOwnSecrets`), its boundary
 * started. Its projects install as its stage first needs them
 * ({@link installStage}). A cut that fails is cut again whole at the next
 * use, and says why.
 */
const cut = async (
  boundary: WorkspaceRef,
  repo: string,
  place: WorkspaceRef
): Promise<Kept> => {
  const state = workspaceStateDir(boundary.id);
  // A cut that never finished, one of an earlier form or of another repository: nothing of it runs on.
  await stopWorkspaceBoundary(boundary);
  await rm(boundary.path, { recursive: true, force: true });
  await mkdir(state, { recursive: true });
  await rm(join(state, KEPT), { force: true });
  // Written before the clone: the boundary and every scan of this machine's clones find it by this record.
  await writeStateFile(
    join(state, "create.json"),
    JSON.stringify({ path: boundary.path })
  );
  const started = Date.now();
  try {
    const git = gitUntil(Date.now() + STAGE_CLONE_GIT_MS);
    await mkdir(dirname(boundary.path), { recursive: true });
    await git(dirname(boundary.path), "init", "--quiet", boundary.path);
    await git(boundary.path, "remote", "add", "origin", `file://${repo}`);
    const { head } = await statusOf(repo);
    if (head === "(initial)" || !head) {
      throw new Error(
        `${repo} has no commit yet, and a sheet's stage runs in a clone cut from its HEAD: commit, then call again.`
      );
    }
    await atHead(boundary.path);
    const { kept } = await mirror(boundary, {
      form: FORM,
      repo,
      head,
      mirrored: [],
    });
    await copyOwnSecrets(repo, boundary.path, git);
    await ensureBoundary(boundary);
    await keep(boundary.id, kept);
    console.info(
      `[stage] ${place.id}: its stage clone ${boundary.path} cut from ${repo} at ${kept.head.slice(0, 9)} with ${kept.mirrored.length} uncommitted path(s), in ${((Date.now() - started) / 1000).toFixed(1)}s`
    );
    return kept;
  } catch (error) {
    await rm(join(state, KEPT), { force: true });
    throw new Error(
      `The stage for ${place.path} runs in a clone of its checkout, and that clone could not be made: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    );
  }
};

/** The repository root `folder` is in, as a real path; refused in words when it is in none. */
const repoOf = async (folder: string): Promise<string> => {
  const top = await gitRaw(folder, ["rev-parse", "--show-toplevel"]).catch(
    (error: Error) => {
      throw new Error(
        `${folder} is in no git repository, and a sheet's stage runs in a clone of the checkout it shows, cut from its HEAD with your uncommitted changes: run git init and commit there, then call again. (${error.message})`,
        { cause: error }
      );
    }
  );
  return await realpath(top.trim());
};

/** The clone's root as its `create.json` names it, or nothing. */
const recordedPath = async (id: string): Promise<string | undefined> =>
  (
    await readRecord<{ path?: string }>(
      join(workspaceStateDir(id), "create.json")
    ).catch(() => undefined)
  )?.path;

/**
 * Place `place`'s stage clone, cut when it has none whole (or one of an
 * earlier form, or of another repository), and brought in step with the
 * checkout: where its stage runs. The hub hears of it each time
 * ({@link setStageCloneSink}).
 */
export const stageCloneOf = (place: WorkspaceRef): Promise<StageClone> => {
  const id = stageCloneId(place.id);
  return inCloneTurn(id, async () => {
    const repo = await repoOf(place.path);
    const sub = relative(repo, await realpath(place.path));
    const kept = await keptOf(id);
    const path =
      (await recordedPath(id)) ??
      expandHome(`~/.worktrees/${basename(repo)}-stage-${id.slice(0, 8)}`);
    const boundary: WorkspaceRef = { id, path };
    const whole =
      kept?.repo === repo &&
      kept.form === FORM &&
      (await stat(join(path, ".git")).then(
        (found) => found.isDirectory(),
        () => false
      ));
    if (whole && kept) {
      await step(boundary, kept);
    } else {
      copied.delete(id);
      await cut(boundary, repo, place);
    }
    filed({
      kind: "stage-clone",
      id,
      place: place.id,
      path,
      repoRoot: repo,
      tmp: workspaceScratchDir(id),
    });
    return { boundary, folder: sub ? join(path, sub) : path };
  });
};

/**
 * The project the stage at toolchain root `root` (absolute, in the clone)
 * runs installed in place `place`'s stage clone ({@link installAt}), in the
 * clone's turn.
 */
export const installStage = (
  place: WorkspaceRef,
  clone: StageClone,
  root: string
): Promise<void> =>
  inCloneTurn(clone.boundary.id, async () => {
    const kept = await keptOf(clone.boundary.id);
    if (!kept) {
      throw new Error(
        `The stage for ${place.path} has no clone of its checkout to install: call again.`
      );
    }
    const now = await installAt(clone.boundary, kept, root);
    if (now !== kept) {
      await keep(clone.boundary.id, now);
    }
  });

/**
 * Brings place `place`'s stage clone in step with its checkout, when it has
 * one whole: its stage's every {@link MIRROR_MS}. The paths it changed.
 */
export const syncStageClone = (place: WorkspaceRef): Promise<string[]> => {
  const id = stageCloneId(place.id);
  return inCloneTurn(id, async () => {
    const kept = await keptOf(id);
    const path = await recordedPath(id);
    if (!(kept && path)) {
      return [];
    }
    return step({ id, path }, kept);
  });
};

/** Whether `a` (the checkout's) and `b` (the clone's) are the same entry: both absent, the same link, or files of the same bytes and mode. */
const sameEntry = async (a: string, b: string): Promise<boolean> => {
  const [x, y] = await Promise.all([
    lstat(a).catch(() => undefined),
    lstat(b).catch(() => undefined),
  ]);
  if (!(x && y)) {
    return !(x || y);
  }
  if (x.isSymbolicLink() && y.isSymbolicLink()) {
    return (await readlink(a)) === (await readlink(b));
  }
  if (x.isFile() && y.isFile()) {
    return (
      permissions(x.mode) === permissions(y.mode) &&
      (await readFile(a)).equals(await readFile(b))
    );
  }
  return false;
};

/**
 * The paths stage clone `id` at `clone` changed against its HEAD that stand
 * exactly as in its checkout: copies of the person's own work, which the
 * checkout still holds, so a retirement passes over them (workspace.ts
 * `holding`'s `skip`). What differs from the checkout (a write the stage made
 * that never reached it) still counts as held. None for a clone with no
 * record.
 */
export const sameAsCheckout = async (
  id: string,
  clone: string
): Promise<string[]> => {
  const kept = await keptOf(id);
  if (!kept) {
    return [];
  }
  const { paths } = await statusOf(clone);
  const same = await Promise.all(
    paths.map(async (path) =>
      (await sameEntry(join(kept.repo, path), join(clone, path)))
        ? path
        : undefined
    )
  );
  return same.filter((path): path is string => path !== undefined);
};

/**
 * A sheet's write, made by the stage in the clone at `written` (absolute),
 * copied to the same path in place `place`'s checkout: read without
 * following a link, a regular file of the clone's own, and written there as
 * the person's own file is. In the clone's turn, after the write itself.
 */
export const copyBack = async (
  place: WorkspaceRef,
  clone: StageClone,
  written: string
): Promise<void> => {
  const inFolder = relative(clone.folder, written);
  if (isAbsolute(inFolder) || inFolder.split(sep).includes("..")) {
    throw new Error(`${written} is outside the stage's clone of ${place.path}`);
  }
  if (
    !(await foldersOwn(
      clone.boundary.path,
      relative(clone.boundary.path, written)
    ))
  ) {
    throw new Error(
      `the stage's clone has a link on the way to ${inFolder}, so the sheet's write was not copied to ${place.path}`
    );
  }
  const file = await open(
    written,
    // biome-ignore lint/suspicious/noBitwiseOperators: open(2) takes its flags as one bit set
    constants.O_RDONLY | constants.O_NOFOLLOW
  );
  let bytes: Buffer;
  try {
    const info = await file.stat();
    if (!info.isFile()) {
      throw new Error(`${inFolder} in the stage's clone is no file`);
    }
    bytes = await file.readFile();
  } finally {
    await file.close();
  }
  const to = join(place.path, inFolder);
  await mkdir(dirname(to), { recursive: true });
  await writeFile(to, bytes);
};
