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
 * - cut once ({@link cut}), at the checkout's HEAD (that one commit, fetched
 *   from the checkout) with its uncommitted changes and its own secret files,
 *   its dependencies installed inside its own boundary ({@link installInside}),
 *   under a workspace id of its own ({@link stageCloneId}), never a place's:
 *   its `node_modules` are its own to write;
 * - kept in step with the checkout ({@link syncStageClone}): a new HEAD
 *   fetched and checked out, then every path the checkout's `git status`
 *   names, and every one it named the time before, made in the clone as it
 *   is in the checkout. Before each use of the stage, and every
 *   {@link MIRROR_MS} while it serves, so the session's edits reach an open
 *   sheet through its HMR, as a delegate's own edits do;
 * - a sheet's write, made by the stage in the clone, copied to the
 *   checkout's story file ({@link copyBack}), in the same turn as the
 *   mirror, so neither undoes the other.
 *
 * The checkout is only read: its status without optional locks (git writes
 * no index there), its HEAD fetched from it. Only the story file a person's
 * sheet edit names is written back.
 */
import { createHash } from "node:crypto";
import { constants } from "node:fs";
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
import { depsScript, LOCKFILES, type WorkspaceRef } from "@cawco/core";
import { readWithin } from "@cawco/core/bounded";
import { workspaceStateDir } from "@cawco/core/paths";
import {
  SAFE_GIT_ENV,
  SAFE_GIT_SHELL,
  safeGitArgv,
} from "@cawco/core/safe-git";
import { hostEnvironment } from "@cawco/core/session-env";
import { STAGE_CLONE_GIT_MS, STAGE_CLONE_INSTALL_MS } from "@cawco/core/stage";
import { readRecord, writeStateFile } from "@cawco/core/state-file";
import { cloneDenies } from "@cawco/core/workspace-policy";
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

/** What the agent keeps of a stage clone beside its `create.json`, written once its cut is whole. */
interface Kept {
  /** The checkout's HEAD the clone is at. */
  head: string;
  /** The paths the checkout's status named at the last mirror, from the repository's root. */
  mirrored: string[];
  /** The checkout's repository root it was cut from, as a real path. */
  repo: string;
}

const KEPT = "stage-clone.json";

/**
 * Place `placeId`'s stage clone's workspace id: a workspace id of its own,
 * never a place's (core `isPlace`), its first 8 characters its own hash, so
 * its scratch and door dirs are its own and not the place's.
 */
export const stageCloneId = (placeId: string): string => {
  const hex = createHash("sha256").update(`stage\0${placeId}`).digest("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
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
 * The checkout's HEAD and every path its status names (changed, staged,
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

/** The paths of `paths` that are a package manifest or a lockfile: a change to one installs again. */
const manifests = (paths: readonly string[]): string[] =>
  paths.filter((path) =>
    ["package.json", ...LOCKFILES].includes(basename(path) as never)
  );

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

/**
 * The checkout's HEAD fetched into the clone and checked out, detached: one
 * commit, from the checkout itself. Its tracked files then stand as at that
 * commit, and the mirror lays the uncommitted changes on top.
 */
const atHead = async (clone: string, repo: string): Promise<void> => {
  const git = gitUntil(Date.now() + STAGE_CLONE_GIT_MS);
  await git(
    clone,
    "fetch",
    "--quiet",
    "--depth=1",
    "--no-tags",
    `file://${repo}`,
    "HEAD"
  );
  await git(clone, "checkout", "--quiet", "--force", "--detach", "FETCH_HEAD");
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
    await atHead(boundary.path, kept.repo);
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

/**
 * The clone's dependencies installed inside its own boundary from its
 * lockfile (core `depsScript`, which installs only when they were not
 * installed from the lockfile and manifests as they stand), where its bun
 * links from the workspaces' cache (boundary.ts `writeBunConfig`): the stage
 * runs the project's own toolchain from them. One that fails is logged, and
 * its next install there runs it again; the stage then says what it could
 * not load (stage.ts `notInstalled`).
 */
const installInside = async (boundary: WorkspaceRef): Promise<void> => {
  const result = await runWorkflowCommand(
    boundary.path,
    `${SAFE_GIT_SHELL}${depsScript()}`,
    STAGE_CLONE_INSTALL_MS,
    boundary
  );
  if (result.exitCode !== 0) {
    console.warn(
      `[stage] ${boundary.id}: its clone's install inside its boundary failed (exit ${result.exitCode}: ${(result.stderr || result.stdout).trim().split("\n").slice(-3).join(" ")})`
    );
  }
};

/**
 * A whole clone brought in step ({@link mirror}), its record kept when
 * anything moved; a package manifest or lockfile among what changed
 * installs again ({@link installInside}). The paths it changed.
 */
const step = async (boundary: WorkspaceRef, kept: Kept): Promise<string[]> => {
  const { changed, kept: now } = await mirror(boundary, kept);
  if (
    now.head !== kept.head ||
    now.mirrored.join("\0") !== kept.mirrored.join("\0")
  ) {
    await keep(boundary.id, now);
  }
  if (manifests(changed).length > 0) {
    await installInside(boundary);
  }
  return changed;
};

/**
 * Cuts place `place`'s stage clone at `path` from the checkout at `repo`
 * (both real paths): `git init`, the checkout's HEAD fetched and checked out
 * ({@link atHead}), its uncommitted changes mirrored, its own secret files
 * copied (workspace.ts `copyOwnSecrets`), its boundary started and its
 * dependencies installed inside it ({@link installInside}). A cut that fails
 * is cut again whole at the next use, and says why.
 */
const cut = async (
  boundary: WorkspaceRef,
  repo: string,
  place: WorkspaceRef
): Promise<Kept> => {
  const state = workspaceStateDir(boundary.id);
  // A cut that never finished, or one of another repository: nothing of it runs on.
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
    const { head } = await statusOf(repo);
    if (head === "(initial)" || !head) {
      throw new Error(
        `${repo} has no commit yet, and a sheet's stage runs in a clone cut from its HEAD: commit, then call again.`
      );
    }
    await atHead(boundary.path, repo);
    const { kept } = await mirror(boundary, { repo, head, mirrored: [] });
    await copyOwnSecrets(repo, boundary.path, git);
    await ensureBoundary(boundary);
    await installInside(boundary);
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

/**
 * Place `place`'s stage clone, cut when it has none whole (or one of another
 * repository), and brought in step with the checkout: where its stage runs.
 */
export const stageCloneOf = (place: WorkspaceRef): Promise<StageClone> => {
  const id = stageCloneId(place.id);
  return inCloneTurn(id, async () => {
    const repo = await repoOf(place.path);
    const sub = relative(repo, await realpath(place.path));
    const kept = await keptOf(id);
    const recorded = await readRecord<{ path?: string }>(
      join(workspaceStateDir(id), "create.json")
    ).catch(() => undefined);
    const path =
      recorded?.path ??
      expandHome(`~/.worktrees/${basename(repo)}-stage-${id.slice(0, 8)}`);
    const boundary: WorkspaceRef = { id, path };
    const whole =
      kept?.repo === repo &&
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
    return { boundary, folder: sub ? join(path, sub) : path };
  });
};

/**
 * Brings place `place`'s stage clone in step with its checkout, when it has
 * one whole: its stage's every {@link MIRROR_MS}. The paths it changed.
 */
export const syncStageClone = (place: WorkspaceRef): Promise<string[]> => {
  const id = stageCloneId(place.id);
  return inCloneTurn(id, async () => {
    const kept = await keptOf(id);
    const recorded = await readRecord<{ path?: string }>(
      join(workspaceStateDir(id), "create.json")
    ).catch(() => undefined);
    if (!(kept && recorded?.path)) {
      return [];
    }
    return step({ id, path: recorded.path }, kept);
  });
};

/**
 * A sheet's write, made by the stage in the clone at `written` (absolute),
 * copied to the same path in place `place`'s checkout: read without
 * following a link, a regular file of the clone's own, and written there as
 * the person's own file is. In `id`'s turn, after the write itself.
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
