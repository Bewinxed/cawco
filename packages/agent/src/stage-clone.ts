/**
 * A place's stage clone: where the sheet stage or a preview's server of a
 * session with no workspace of its own runs (stage.ts), cut from the checkout
 * the session works in, or copied from its folder when that is in no
 * repository ({@link copyCut}).
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
 * - cut ({@link cut}) at the checkout's HEAD (fetched from the checkout, its
 *   `origin`) with its uncommitted changes and its own secret files, under a
 *   workspace id of its own (core `stageCloneId`), never a place's: its
 *   `node_modules` are its own to write. It borrows every object of the
 *   checkout's own origin from that origin's object pool, as a workspace's
 *   clone does (object-pool.ts), so its `.git` holds only what the pool
 *   lacks: 1.5 MB for cockpit cut at a commit past its pool, where a clone
 *   of its own store took 84 MB (2026-11-22);
 * - installed by the project's own package manager inside its boundary
 *   ({@link installStage}, stage-install.ts, every stage's one install
 *   path), where its bun links from the workspaces' cache (boundary/package-managers.ts
 *   `writeBunConfig`);
 * - kept in step with the checkout ({@link step}): a new HEAD fetched and
 *   checked out, then every path the checkout's `git status` names, and
 *   every one it named the time before, made in the clone as it is in the
 *   checkout. Before each use of the stage, and while it serves on each
 *   change a watch of the checkout hears ({@link followCheckout}), so the
 *   session's edits reach an open sheet through its HMR, as a delegate's own
 *   edits do;
 * - a sheet's write, made by the stage in the clone, copied to the
 *   checkout's story file ({@link copyBack}), in the same turn as the
 *   mirror, so neither undoes the other;
 * - filed with the hub as a workspace of the stage kind on each use
 *   ({@link AgentPorts.stageClone}), so the hub's retire sweep settles it like
 *   any workspace once its stage sleeps: what it holds that the checkout
 *   lacks keeps it ({@link sameAsCheckout} names what it does not), and the
 *   next sheet cuts it again.
 *
 * A folder in no repository has no HEAD to cut at and no status to read, so
 * its stage clone is a copy of it ({@link copyCut}): the folder copied whole
 * but for what an install and the toolchain make again and any repository
 * inside it ({@link LEFT_OUT}), its boundary holding it as a plain folder, as
 * a design folder is (core object-pool.ts `copiedFolderSync`: `CAWCO_FOLDER`,
 * no clone denies). A folder too large is never copied ({@link copyBounded}).
 * It is kept in step by the same mirror, every file and link of the folder
 * named where a checkout's status names its changes ({@link filesIn}), or
 * while it serves only the paths its watch heard change; what ran in it
 * holds it on retirement as it wrote what the folder lacks (layer.ts
 * `changesOf`).
 *
 * The checkout is only read: its status without optional locks (git writes
 * no index there), its HEAD fetched from it. Only the story file a person's
 * sheet edit names is written back.
 */
import { constants, existsSync, type Stats } from "node:fs";
import {
  chmod,
  cp,
  lstat,
  open,
  readdir,
  readFile,
  readlink,
  realpath,
  rename,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, sep } from "node:path";
import { unlessGone } from "@cawco/core/absent";
import { cloneDenies } from "@cawco/core/clone-denies";
import { failureOf } from "@cawco/core/detach";
import { boundedRead } from "@cawco/core/effect/bounded";
import { makeFolder } from "@cawco/core/folders";
import { freeBytes } from "@cawco/core/free-bytes";
import { makeKeyedLock } from "@cawco/core/keyed-lock";
import {
  alternatesText,
  type CreateRecord,
  recordedPool,
} from "@cawco/core/object-pool";
import {
  workspaceCreateFile,
  workspaceScratchDir,
  workspaceStateDir,
  workspacesDir,
} from "@cawco/core/paths/workspace";
import { runCaptured } from "@cawco/core/run-captured";
import { SAFE_GIT_ENV, safeGitArgv } from "@cawco/core/safe-git";
import { hostEnvironment } from "@cawco/core/session-env";
import { STAGE_CLONE_GIT_MS, STAGE_COPY_LIMIT } from "@cawco/core/stage";
import { readRecord, writeStateFile } from "@cawco/core/state-file";
import type { WorkspaceRef } from "@cawco/core/workspace/controls";
import { stageCloneId } from "@cawco/core/workspace-policy";
import { type FSWatcher, watch } from "chokidar";
import { Effect, Exit, type Fiber, Scope } from "effect";
import { z } from "zod";
import type { AgentPorts } from "./agent-ports";
import { stopWorkspaceBoundary } from "./boundary/control";
import { ensureBoundary } from "./boundary/ensure";
import { closeBoundary } from "./boundary/stop";
import { poolSourceOf } from "./clone";
import { expandHome } from "./fs";
import { gitUntil } from "./git/run";
import { REMADE_IN_COPY } from "./layer";
import { formatFlag, poolGitEnv, standingPool } from "./object-pool";
import { removeTree } from "./remove-tree";
import { repoTop } from "./repo-top";
import { forgetInstalls, installProject } from "./stage-install";
import { WorkspaceNotHere } from "./stage-refusal";
import { copyOwnSecrets } from "./workspace";
import { cloneHolding } from "./workspace-records";

/**
 * What a copy of a folder leaves out, and what a stage clone's mirror and
 * watch never read: what an install and the toolchain make again (layer.ts
 * `REMADE_IN_COPY`), and any repository's store (`.git`).
 */
const LEFT_OUT: ReadonlySet<string> = new Set([...REMADE_IN_COPY, ".git"]);

/** Where a place's stage runs: its clone's boundary, and the place's folder as it stands in the clone. */
export interface StageClone {
  readonly boundary: WorkspaceRef;
  /** The place's folder in the clone: what the session's paths resolve against. */
  readonly folder: string;
}

/** The form of the clone this build cuts: one of an earlier form (no `origin`, or a store of its own where its origin's pool could lend) is cut again. */
const FORM = 3;

/** What the agent keeps of a stage clone beside its `create.json`, written once its cut is whole. */
const KeptSchema = z.union([
  z.object({
    /** A copy of a folder in no repository ({@link copyCut}). */
    kind: z.literal("copy"),
    form: z.number(),
    /** The folder it copies, as a real path. */
    folder: z.string(),
    /** Every file and link of the folder at the last mirror, from its root ({@link filesIn}). */
    mirrored: z.array(z.string()),
  }),
  z.object({
    /** A clone of a repository's checkout ({@link cut}): a record cut before copies names no kind. */
    kind: z.literal("clone").default("clone"),
    form: z.number().optional(),
    /** The checkout's HEAD the clone is at. */
    head: z.string(),
    /** The paths the checkout's status named at the last mirror, from the repository's root. */
    mirrored: z.array(z.string()),
    /** The checkout's repository root it was cut from, as a real path. */
    repo: z.string(),
  }),
]);
type Kept = z.infer<typeof KeptSchema>;

/** The folder a stage clone's paths are read from in step: its checkout's repository root, or the folder it copies. */
const sourceOf = (kept: Kept): string =>
  kept.kind === "copy" ? kept.folder : kept.repo;

const KEPT = "stage-clone.json";

/** Whether workspace `id` is a place's stage clone this machine cut. */
export const isStageClone = (id: string): boolean =>
  existsSync(join(workspaceStateDir(id), KEPT));

/** Each clone's cut, mirror or write-back under way: one at a time per clone. */
const turns = makeKeyedLock<string>();

/** `work` on stage clone `id`, after whatever it is doing now. */
export const inCloneTurn = <T>(
  id: string,
  work: () => Promise<T>
): Promise<T> => turns.run(id, work);

/** Each source file's size and change time when it was last made in the clone, by clone and path: one unchanged since is not read again. */
const copied = new Map<string, Map<string, string>>();

/**
 * git on this host, as safe-git.ts says, within {@link STAGE_CLONE_GIT_MS}:
 * its whole stdout, or git's stderr thrown. Never takes optional locks, so a
 * status in a person's checkout writes nothing there.
 */
const gitRaw = (dir: string, args: readonly string[]): Promise<string> =>
  // The promise edge of git's bounded run.
  Effect.runPromise(
    boundedRead(
      STAGE_CLONE_GIT_MS,
      Effect.tryPromise({
        try: async (signal) => {
          const { code, stdout, stderr } = await runCaptured(
            safeGitArgv(["--no-optional-locks", "-C", dir, ...args]),
            {
              env: { ...hostEnvironment(), ...SAFE_GIT_ENV },
              signal,
              killSignal: "SIGKILL",
            }
          );
          if (code !== 0) {
            throw new Error(
              `git ${args[0]} failed in ${dir}: ${stderr.trim() || `exit ${code}`}`
            );
          }
          return stdout;
        },
        catch: (error) =>
          error instanceof Error ? error : new Error(String(error)),
      })
    ).pipe(
      Effect.catchTag("Unanswered", () =>
        Effect.fail(
          new Error(
            `git ${args[0]} in ${dir} did not finish within ${STAGE_CLONE_GIT_MS / 1000}s`
          )
        )
      )
    )
  );

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
    const found = await lstat(at).catch(() => undefined);
    if (!found) {
      await makeFolder(at, { exclusive: true });
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

/**
 * rsync's quick check: files of the same size, mode and modification time
 * (to the millisecond) are the same file. A copy's files keep the folder's
 * times ({@link copyTree}), so a copy's first mirror reads none of them.
 */
const quickSame = (source: Stats, there: Stats): boolean =>
  source.isFile() &&
  there.isFile() &&
  source.size === there.size &&
  permissions(source.mode) === permissions(there.mode) &&
  Math.trunc(source.mtimeMs) === Math.trunc(there.mtimeMs);

/** Whether the clone's entry `there` stands as `source` is: its stamp unchanged since it was last made (`stamped`), or by the {@link quickSame} check. */
const asMirrored = (
  source: Stats,
  there: Stats | undefined,
  stamped: boolean
): boolean => there !== undefined && (stamped || quickSame(source, there));

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
  if (asMirrored(source, there, seen.get(path) === stamp)) {
    seen.set(path, stamp);
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
  await readRecord(join(workspaceStateDir(id), KEPT), KeptSchema).catch(
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
 * The checkout's HEAD fetched into the clone and checked out, detached, from
 * the checkout, which is the clone's `origin`. Its tracked files then stand
 * as at that commit, and the mirror lays the uncommitted changes on top.
 *
 * A clone that borrows from a pool ({@link lendingPool}, its record names
 * it) fetches HEAD whole, with the commits the pool's refs and its own last
 * HEAD name as what it has (`--negotiation-tip`), so the checkout sends only
 * the objects past them: its own commits and no more. Named here, since git
 * offers no alternate's refs where CawCo runs it (safe-git.ts
 * `core.alternateRefsCommand=`), and a whole fetch that offers none copies
 * the checkout's every object: 781 MB of `.git` for cockpit. One that
 * borrows none fetches one commit (`--depth=1`), whose tree is still whole:
 * 84 MB for cockpit.
 */
const atHead = async (clone: WorkspaceRef): Promise<void> => {
  const git = gitUntil(Date.now() + STAGE_CLONE_GIT_MS);
  const pool = await recordedPool(clone.id);
  const tips = pool
    ? new Set(
        (await git(pool, "for-each-ref", "--format=%(objectname)"))
          .split("\n")
          .filter(Boolean)
      )
    : new Set<string>();
  const has =
    tips.size > 0
      ? [
          "--negotiation-tip=refs/remotes/origin/*",
          ...[...tips].map((tip) => `--negotiation-tip=${tip}`),
        ]
      : ["--depth=1"];
  await git(
    clone.path,
    "fetch",
    "--quiet",
    ...has,
    "--no-tags",
    "origin",
    `+HEAD:${STAGE_REF}`
  );
  await git(
    clone.path,
    "checkout",
    "--quiet",
    "--force",
    "--detach",
    STAGE_REF
  );
};

/** The pool a clone cut from a checkout borrows from, and the object format it is in. */
interface Lending {
  format: string;
  pool: string;
}

/**
 * The object pool a clone cut from the checkout at `repo` borrows from, as a
 * workspace's clone does (object-pool.ts): for a workspace's own clone (a
 * pin cut from it) the pool its record names; for a person's repository its
 * origin's pool, made when it is not there, seeded from the repository
 * ({@link standingPool}). Nothing is fetched into it from the remote: the
 * clone starts from the checkout's HEAD, never the remote's default branch,
 * so a cut reaches no network. Nothing when no pool can lend: `repo` has no
 * `origin` (a pool is one origin's), a workspace's clone cut before pools
 * borrows none, or the pool holds nothing yet.
 */
const lendingPool = async (
  repo: string,
  deadline: number
): Promise<Lending | undefined> => {
  const git = gitUntil(deadline);
  const format = await git(repo, "rev-parse", "--show-object-format");
  const holder = await cloneHolding(repo);
  if (holder) {
    const pool = await recordedPool(holder.id);
    return pool ? { format, pool } : undefined;
  }
  const origin = await git(repo, "remote", "get-url", "origin").catch(
    () => undefined
  );
  if (!origin) {
    return;
  }
  const source = await poolSourceOf(repo, git, false);
  const lends = await standingPool(
    source,
    gitUntil(deadline, poolGitEnv(hostEnvironment())),
    deadline
  );
  return lends ? { format: source.format, pool: source.pool } : undefined;
};

/**
 * Every file and link in the folder at `root`, from its root, down every
 * folder but what a copy leaves out ({@link LEFT_OUT}), links never
 * followed, in order: what a copy's mirror names where a checkout's status
 * names its changes. A folder this host can't read is passed over.
 */
const filesIn = async (root: string): Promise<string[]> => {
  const found: string[] = [];
  const down = async (dir: string): Promise<void> => {
    const entries = await readdir(join(root, dir), {
      withFileTypes: true,
    }).catch(() => []);
    for (const entry of entries) {
      if (LEFT_OUT.has(entry.name)) {
        continue;
      }
      const path = dir ? `${dir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await down(path);
      } else if (entry.isFile() || entry.isSymbolicLink()) {
        found.push(path);
      }
    }
  };
  await down("");
  return found.sort();
};

/**
 * What a mirror of the clone makes as its source is, and the record as it
 * stands after: a checkout's HEAD fetched and checked out when it moved, and
 * every path its status names now; a copied folder's every file and link
 * ({@link filesIn}). Every CawCo-held path of a clone's boundary is left
 * out ({@link mirrorable}); a copy's boundary holds none.
 */
const toMirror = async (
  boundary: WorkspaceRef,
  kept: Kept,
  seen: Map<string, string>
): Promise<{ named: string[]; now: Kept }> => {
  if (kept.kind === "copy") {
    const paths = await filesIn(kept.folder);
    return {
      named: [...new Set([...paths, ...kept.mirrored])],
      now: { ...kept, mirrored: paths },
    };
  }
  const { head, paths } = await statusOf(kept.repo);
  if (head !== kept.head) {
    await atHead(boundary);
    // The checkout moved every tracked file in the clone: none is as copied.
    seen.clear();
  }
  return {
    named: [...new Set([...paths, ...kept.mirrored])].filter((path) =>
      mirrorable(boundary.path, path)
    ),
    now: { ...kept, head, mirrored: paths },
  };
};

/**
 * Makes the clone as its source is ({@link toMirror}): every path named now
 * or at the last mirror. Answers the paths it changed and the record as it
 * stands now.
 */
const mirror = async (
  boundary: WorkspaceRef,
  kept: Kept
): Promise<{ changed: string[]; kept: Kept }> => {
  const seen = copied.get(boundary.id) ?? new Map<string, string>();
  copied.set(boundary.id, seen);
  const { named, now } = await toMirror(boundary, kept, seen);
  const from = sourceOf(kept);
  const changed: string[] = [];
  for (const path of named) {
    if (await mirrorOne(from, boundary.path, path, seen)) {
      changed.push(path);
    }
  }
  return { changed, kept: now };
};

/**
 * A whole clone brought in step ({@link mirror}), its record kept when
 * anything moved. A lockfile or package.json among what changed is the
 * stage's to install, as it looks at its project while it serves (stage.ts,
 * stage-install.ts `installMoved`). The paths it changed.
 */
const step = async (boundary: WorkspaceRef, kept: Kept): Promise<string[]> => {
  const { changed, kept: now } = await mirror(boundary, kept);
  if (!Bun.deepEquals(now, kept)) {
    await keep(boundary.id, now);
  }
  return changed;
};

/** What a cut makes: a clone of a checkout ({@link cut}) or a copy of a folder in no repository ({@link copyCut}). */
type Making = "a clone of its checkout" | "a copy of its folder";

/**
 * A stage clone cut afresh at `boundary.path`: whatever stood there
 * let go first (a cut that never finished, one of an earlier form, of
 * another repository, or of the folder as it was before it became a
 * repository or stopped being one), `create` written as its `create.json`
 * before anything is there (the boundary and every scan of this machine's
 * clones find it by this record), the tree made by `make`, its boundary
 * started and its record kept. A cut that fails keeps no record, says why,
 * and is cut again whole at the next use.
 */
const cutAfresh = async (
  boundary: WorkspaceRef,
  place: WorkspaceRef,
  cutting: { create: CreateRecord; is: Making },
  make: () => Promise<{ kept: Kept; said: string }>
): Promise<Kept> => {
  const state = workspaceStateDir(boundary.id);
  await stopWorkspaceBoundary(boundary);
  await removeTree(boundary.path);
  await makeFolder(state);
  await rm(join(state, KEPT), { force: true });
  await forgetInstalls(boundary.id);
  await writeStateFile(
    workspaceCreateFile(boundary.id),
    JSON.stringify(cutting.create)
  );
  const started = Date.now();
  try {
    const { kept, said } = await make();
    await ensureBoundary(boundary);
    await keep(boundary.id, kept);
    console.info(
      `[stage] ${place.id}: its stage clone ${boundary.path} ${said}, in ${((Date.now() - started) / 1000).toFixed(1)}s`
    );
    return kept;
  } catch (error) {
    await rm(join(state, KEPT), { force: true });
    throw new Error(
      `The stage for ${place.path} runs in ${cutting.is}, and that could not be made: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    );
  }
};

/**
 * Cuts place `place`'s stage clone at `boundary.path` from the checkout at
 * `repo` (a real path), afresh ({@link cutAfresh}): `git init`, its
 * alternates file as the one line of the pool it borrows
 * ({@link lendingPool}, named in its record first), the checkout as its
 * `origin`, its HEAD fetched and checked out ({@link atHead}), its
 * uncommitted changes mirrored, its own secret files copied (workspace.ts
 * `copyOwnSecrets`). Its projects install as its stage first needs them
 * ({@link installStage}).
 */
const cut = (
  boundary: WorkspaceRef,
  repo: string,
  place: WorkspaceRef
): Promise<Kept> =>
  cutAfresh(
    boundary,
    place,
    { create: { path: boundary.path }, is: "a clone of its checkout" },
    async () => {
      const deadline = Date.now() + STAGE_CLONE_GIT_MS;
      const git = gitUntil(deadline);
      const { head } = await statusOf(repo);
      if (head === "(initial)" || !head) {
        throw new Error(
          `${repo} has no commit yet, and a sheet's stage runs in a clone cut from its HEAD: commit, then call again.`
        );
      }
      const lending = await lendingPool(repo, deadline);
      if (lending) {
        // Before anything borrows: its boundary's read grant, host git's check
        // of its alternates file and the pools' reclaim read the pool here.
        await writeStateFile(
          workspaceCreateFile(boundary.id),
          JSON.stringify({
            path: boundary.path,
            pool: lending.pool,
          } satisfies CreateRecord)
        );
      }
      await makeFolder(dirname(boundary.path));
      await git(
        dirname(boundary.path),
        "init",
        "--quiet",
        ...(lending ? formatFlag(lending.format) : []),
        boundary.path
      );
      if (lending) {
        await writeStateFile(
          join(boundary.path, ".git", "objects", "info", "alternates"),
          alternatesText(lending.pool),
          { inPlace: true }
        );
      }
      await git(boundary.path, "remote", "add", "origin", `file://${repo}`);
      await atHead(boundary);
      const { kept } = await mirror(boundary, {
        kind: "clone",
        form: FORM,
        repo,
        head,
        mirrored: [],
      });
      await copyOwnSecrets(repo, boundary.path, git);
      return {
        kept,
        said: `cut from ${repo} at ${head.slice(0, 9)} with ${kept.mirrored.length} uncommitted path(s), ${lending ? `borrowing from the object pool ${lending.pool}` : "with a store of its own"}`,
      };
    }
  );

/**
 * The repository root of the checkout `folder` (a real path) is in, as a
 * real path; nothing when it is in no repository (repo-top.ts `repoTop`,
 * which refuses in words a repository git does not read as a checkout, and
 * a read that did not finish).
 */
const checkoutOf = async (folder: string): Promise<string | undefined> => {
  const top = await repoTop(folder, Date.now() + STAGE_CLONE_GIT_MS);
  return top === undefined ? undefined : await realpath(top);
};

/** What a copy of a folder would hold, as {@link measured} counts it. */
interface Measure {
  bytes: number;
  files: number;
  /** Whether the count stopped past {@link STAGE_COPY_LIMIT}: the folder holds at least this much. */
  past: boolean;
}

/**
 * What a copy of `from` leaving out every entry `left` names would hold:
 * each file's and link's size from its `lstat`, never its contents, links
 * never followed, each folder's entries read at once. The count stops as
 * soon as it is past {@link STAGE_COPY_LIMIT}, so a folder of terabytes is
 * read no further than the limit. A folder this host can't read counts
 * nothing, as the copy can't take it either. Ours, not core's `folderBytes`:
 * `du` leaves nothing out on macOS and reads the whole tree before it
 * answers.
 */
const measured = async (
  from: string,
  left: ReadonlySet<string>
): Promise<Measure> => {
  const held: Measure = { bytes: 0, files: 0, past: false };
  const folders = [from];
  for (let dir = folders.pop(); dir !== undefined; dir = folders.pop()) {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    const files: string[] = [];
    for (const entry of entries) {
      if (left.has(entry.name)) {
        continue;
      }
      (entry.isDirectory() ? folders : files).push(join(dir, entry.name));
    }
    const sizes = await Promise.all(
      files.map((file) =>
        lstat(file).then(
          (found) => found.size,
          () => 0
        )
      )
    );
    held.files += files.length;
    held.bytes += sizes.reduce((sum, size) => sum + size, 0);
    if (
      held.bytes > STAGE_COPY_LIMIT.bytes ||
      held.files > STAGE_COPY_LIMIT.files
    ) {
      held.past = true;
      return held;
    }
  }
  return held;
};

/** `bytes` in plain words, in MiB or GiB. */
const sizeSaid = (bytes: number): string =>
  bytes >= 1024 ** 3
    ? `${(bytes / 1024 ** 3).toFixed(1)} GiB`
    : `${Math.ceil(bytes / 1024 ** 2)} MiB`;

/**
 * Refuses, in words that name `from`, how much it holds and `instead` (what
 * the caller does in its place), a copy of folder `from` (a real path) to
 * `into` (a folder that stands) leaving out every entry `left` names, when
 * the copy would be too large: `from` is this user's home folder or a folder
 * above it, which is never copied; it holds past {@link STAGE_COPY_LIMIT}
 * ({@link measured}); or it would take more than half of what is free on
 * `into`'s disk (core `freeBytes`). Answers what it holds.
 */
const copyBounded = async (
  from: string,
  into: string,
  left: ReadonlySet<string>,
  instead: string
): Promise<Measure> => {
  const named = homedir();
  const home = await realpath(named).catch(() => named);
  const toHome = relative(from, home);
  if (!(toHome.startsWith("..") || isAbsolute(toHome))) {
    throw new Error(
      `${from} is ${toHome ? "a folder that holds your home folder" : "your home folder"}, and it is never copied: ${instead}.`
    );
  }
  const held = await measured(from, left);
  const atLeast = held.past ? "at least " : "";
  const counted = `${atLeast}${sizeSaid(held.bytes)} in ${atLeast}${held.files.toLocaleString("en")} files`;
  if (held.past) {
    throw new Error(
      `${from} holds ${counted}, past the ${sizeSaid(STAGE_COPY_LIMIT.bytes)} or ${STAGE_COPY_LIMIT.files.toLocaleString("en")} files a copy of a folder may hold, so it is not copied: ${instead}.`
    );
  }
  const free = await freeBytes(into);
  if (held.bytes > free / 2) {
    throw new Error(
      `${from} holds ${counted}, more than half of the ${sizeSaid(free)} free on the disk its copy goes to, so it is not copied: free space on that disk, or ${instead}.`
    );
  }
  return held;
};

/** `from` copied whole to `to` (a new folder), links as links, leaving out every entry `left` names. */
const copyTree = (
  from: string,
  to: string,
  left: ReadonlySet<string> = new Set()
): Promise<void> =>
  cp(from, to, {
    recursive: true,
    verbatimSymlinks: true,
    preserveTimestamps: true,
    filter: (source) => source === from || !left.has(basename(source)),
  });

/** What a stage of a folder in no repository does in place of a copy too large ({@link copyBounded}). */
const COPY_INSTEAD =
  "start the session in the project's own folder, or run git init and commit there, so the stage runs in a clone of what git tracks";

/**
 * Cuts `boundary.path` afresh ({@link cutAfresh}) as a copy of `from`, a
 * folder in no repository (a real path), for a place's stage clone of a
 * folder {@link cut} cannot clone: the folder copied
 * whole but for what {@link LEFT_OUT} names, its files keeping their times,
 * once {@link copyBounded} finds it small enough (nothing is cut when it
 * refuses). Its `create.json` names the folder it copies (core
 * object-pool.ts `copies`) before its boundary starts, so the boundary holds
 * it as a plain folder; its record names every file it mirrors
 * ({@link filesIn}).
 */
const copyCut = async (
  boundary: WorkspaceRef,
  from: string,
  place: WorkspaceRef
): Promise<Kept> => {
  await makeFolder(dirname(boundary.path));
  await copyBounded(from, dirname(boundary.path), LEFT_OUT, COPY_INSTEAD);
  return await cutAfresh(
    boundary,
    place,
    {
      create: { path: boundary.path, copies: from },
      is: "a copy of its folder",
    },
    async () => {
      await copyTree(from, boundary.path, LEFT_OUT);
      const kept: Kept = {
        kind: "copy",
        form: FORM,
        folder: from,
        mirrored: await filesIn(from),
      };
      return {
        kept,
        said: `copied from ${from}, which is in no repository, ${kept.mirrored.length} file(s)`,
      };
    }
  );
};

/** The clone's root as its `create.json` names it, or nothing. */
const recordedPath = async (id: string): Promise<string | undefined> =>
  (
    await readRecord(
      join(workspaceStateDir(id), "create.json"),
      z.object({ path: z.string().optional() })
    ).catch(() => undefined)
  )?.path;

/**
 * The clone at `path`'s record when it stands whole, cut by this build's
 * form from repository `repo`, or copied from folder `folder` in none;
 * nothing when it must be cut again (a folder that became a repository, or
 * stopped being one, among them).
 */
const wholeAt = async (
  path: string,
  source: { repo: string } | { folder: string },
  kept: Kept | undefined
): Promise<Kept | undefined> => {
  if (kept?.form !== FORM) {
    return;
  }
  const stands = (at: string) =>
    stat(at).then(
      (found) => found.isDirectory(),
      () => false
    );
  if ("repo" in source) {
    return kept.kind === "clone" &&
      kept.repo === source.repo &&
      (await stands(join(path, ".git")))
      ? kept
      : undefined;
  }
  return kept.kind === "copy" &&
    kept.folder === source.folder &&
    (await stands(path))
    ? kept
    : undefined;
};

/**
 * Place `place`'s stage clone, cut when it has none whole (or one of an
 * earlier form, or of another repository), and brought in step with the
 * checkout: where its stage runs. A place in no repository has a copy of its
 * folder instead ({@link copyCut}). The hub hears of it each time
 * ({@link AgentPorts.stageClone}). {@link WorkspaceNotHere} when the cut
 * or step failed because the place's folder went ({@link folderGone}): its
 * workspace archived before or during it, so its preview says it is gone.
 */
export const stageCloneOf = (
  place: WorkspaceRef,
  ports: Pick<AgentPorts, "stageClone">
): Promise<StageClone> => {
  const id = stageCloneId(place.id);
  return inCloneTurn(id, async () => {
    try {
      return await cloneNow(id, place, ports);
    } catch (error) {
      if (await folderGone(place.path)) {
        throw new WorkspaceNotHere(
          `${place.path} is not on this machine any more, so its stage has nothing to run from.`,
          { cause: error }
        );
      }
      throw error;
    }
  });
};

/**
 * Whether the folder at `path` is gone: nothing stands at it. A workspace's
 * archive moves its clone aside before it deletes any of it (layer.ts
 * `removeLayer`), so a cut whose fetch lost the checkout's objects partway
 * finds its path gone once the fetch fails, as one begun after does at its
 * first `realpath`.
 */
const folderGone = (path: string): Promise<boolean> =>
  lstat(path).then(() => false, unlessGone(true));

/** {@link stageCloneOf}'s cut or step, in the clone's turn. */
const cloneNow = async (
  id: string,
  place: WorkspaceRef,
  { stageClone }: Pick<AgentPorts, "stageClone">
): Promise<StageClone> => {
  const real = await realpath(place.path);
  const repo = await checkoutOf(real);
  const from = repo ?? real;
  const kept = await keptOf(id);
  const path =
    (await recordedPath(id)) ??
    expandHome(`~/.worktrees/${basename(from)}-stage-${id.slice(0, 8)}`);
  const boundary: WorkspaceRef = { id, path };
  const whole = await wholeAt(path, repo ? { repo } : { folder: real }, kept);
  if (whole) {
    await step(boundary, whole);
  } else {
    copied.delete(id);
    await (repo ? cut(boundary, repo, place) : copyCut(boundary, real, place));
  }
  stageClone({
    kind: "stage-clone",
    id,
    place: place.id,
    path,
    repoRoot: from,
    tmp: workspaceScratchDir(id),
  });
  const sub = relative(from, real);
  return { boundary, folder: sub ? join(path, sub) : path };
};

/**
 * The project the stage at toolchain root `root` (absolute, in the clone)
 * runs installed in place `place`'s stage clone (stage-install.ts
 * `installProject`), in the clone's turn.
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
    await installProject(
      { boundary: clone.boundary, from: root, shownAs: sourceOf(kept) },
      true
    );
  });

/** A copy's record ({@link copyCut}). */
type CopyKept = Extract<Kept, { kind: "copy" }>;

/**
 * Copy `kept` brought in step for the paths a watch heard change
 * ({@link followCheckout}), from the folder's root: each made in the copy as
 * it is in the folder ({@link mirrorOne}), with every file the record names
 * under a folder that went (`gone`), and the record kept when a file came or
 * went. The whole folder is never walked here.
 */
const stepPaths = async (
  boundary: WorkspaceRef,
  kept: CopyKept,
  named: readonly string[],
  gone: readonly string[]
): Promise<void> => {
  const seen = copied.get(boundary.id) ?? new Map<string, string>();
  copied.set(boundary.id, seen);
  const under = kept.mirrored.filter((path) =>
    gone.some((dir) => path.startsWith(`${dir}/`))
  );
  const mirrored = new Set(kept.mirrored);
  let moved = false;
  for (const path of new Set([...named, ...under])) {
    await mirrorOne(kept.folder, boundary.path, path, seen);
    const now = await lstat(join(kept.folder, path)).catch(() => undefined);
    const held = now?.isFile() || now?.isSymbolicLink() || false;
    if (held !== mirrored.has(path)) {
      moved = true;
      if (held) {
        mirrored.add(path);
      } else {
        mirrored.delete(path);
      }
    }
  }
  if (moved) {
    await keep(boundary.id, { ...kept, mirrored: [...mirrored].sort() });
  }
};

/** How long a stage clone's watch gathers what it hears before one step brings the clone in step: an editor's save or a formatter's burst is one step. Ours: well inside what a person sees as at once. */
const SETTLE_MS = 100;

/** More paths heard in one gathering than this bring a copy in step whole ({@link filesIn}) rather than path by path: a burst that large may have overflowed the kernel's queue of events. Ours. */
const WHOLE_PAST = 1000;

/** How long after its watch failed a stage clone's watch starts again (and so reconciles whole). Ours: a watch the kernel's limit refused is retried at a pace that costs nothing. */
const REWATCH_MS = 30_000;

/** A stage clone's watch of its source while live stages follow it ({@link followCheckout}). */
interface Following {
  /** Every folder heard to go since the last step, from the source's root. */
  gone: Set<string>;
  /** Every path heard to change since the last step, from the source's root. */
  named: Set<string>;
  /** The gathering of what was heard into one step, from its first hearing until its step begins ({@link heard}). */
  settle?: Fiber.Fiber<void>;
  /** The folder watched: the clone's source when its watch started. */
  source?: string;
  /** The live stages that follow it. */
  users: number;
  /**
   * The watch under way ({@link watchSource}): the scope that holds its
   * start, its watcher and its gathering, closed together when it ends
   * ({@link unwatch}).
   */
  watching?: Scope.Closeable;
  /** Whether the next step reconciles whole: the watch started, or failed, or events were lost. */
  whole: boolean;
}

const following = new Map<string, Following>();

/**
 * What a watch of `kept`'s source passes over, besides {@link LEFT_OUT}: for
 * a checkout every folder git ignores whole (`ls-files --directory`), whose
 * files no status names; nothing for a copy, which copies all but
 * {@link LEFT_OUT}.
 */
const ignoredBy = async (kept: Kept): Promise<string[]> => {
  if (kept.kind === "copy") {
    return [];
  }
  const out = await gitRaw(kept.repo, [
    "ls-files",
    "-z",
    "--others",
    "--ignored",
    "--exclude-standard",
    "--directory",
  ]);
  return out
    .split("\0")
    .filter((path) => path.endsWith("/"))
    .map((path) => join(kept.repo, path.slice(0, -1)));
};

/**
 * One step of stage clone `id` for what its watch heard, in the clone's
 * turn: whole when it must be ({@link Following.whole}, or more than
 * {@link WHOLE_PAST} paths), and always for a checkout, whose `git status`
 * is the whole read; for a copy only the paths heard ({@link stepPaths}). A
 * clone whose source is no longer the one watched (cut again from another)
 * is watched afresh instead.
 */
const settled = (id: string, follow: Following): Promise<void> =>
  inCloneTurn(id, async () => {
    follow.settle = undefined;
    const named = [...follow.named];
    const gone = [...follow.gone];
    const whole = follow.whole || named.length + gone.length > WHOLE_PAST;
    follow.named.clear();
    follow.gone.clear();
    follow.whole = false;
    const [kept, path] = await Promise.all([keptOf(id), recordedPath(id)]);
    if (!(kept && path) || following.get(id) !== follow) {
      return;
    }
    if (sourceOf(kept) !== follow.source) {
      rewatch(id, follow, 0);
      return;
    }
    const boundary = { id, path };
    if (whole || kept.kind === "clone") {
      await step(boundary, kept);
    } else {
      await stepPaths(boundary, kept, named, gone);
    }
  });

/** What stage clone `id`'s watch heard, gathered for {@link SETTLE_MS} into one step ({@link settled}), in the watch's scope; a failed step is said. */
const heard = (
  id: string,
  follow: Following,
  what: { path: string } | { gone: string } | "whole"
): void => {
  if (what === "whole") {
    follow.whole = true;
  } else if ("gone" in what) {
    follow.gone.add(what.gone);
  } else {
    follow.named.add(what.path);
  }
  const { watching } = follow;
  if (follow.settle || !watching) {
    return;
  }
  follow.settle = Effect.runSync(
    Effect.forkIn(
      Effect.sleep(SETTLE_MS).pipe(
        Effect.andThen(
          Effect.tryPromise({
            try: () => settled(id, follow),
            catch: (error) => error,
          })
        ),
        Effect.catch((error) =>
          Effect.sync(() =>
            console.warn(
              `[stage ${id.slice(0, 8)} follow] failed: ${failureOf(error)}`
            )
          )
        )
      ),
      watching
    )
  );
};

/** Stage clone `id`'s watch ended: its scope closed, which ends its start, its gathering and its watcher. */
const unwatch = (follow: Following): void => {
  const { watching } = follow;
  follow.watching = undefined;
  follow.settle = undefined;
  if (watching) {
    Effect.runFork(Scope.close(watching, Exit.void));
  }
};

/** Stage clone `id`'s watch closed and started again after `after` ms ({@link watchSource}). */
const rewatch = (id: string, follow: Following, after: number): void => {
  unwatch(follow);
  const watching = Effect.runSync(Scope.make());
  follow.watching = watching;
  Effect.runSync(
    Effect.forkIn(
      (after > 0 ? Effect.sleep(after) : Effect.void).pipe(
        Effect.andThen(watchSource(id, follow, watching)),
        Effect.catch((error) =>
          Effect.sync(() =>
            console.warn(
              `[stage ${id.slice(0, 8)} watch] failed: ${failureOf(error)}`
            )
          )
        )
      ),
      watching
    )
  );
};

/**
 * Stage clone `id`'s source (its checkout's repository root, or the
 * folder it copies) watched with chokidar, held by the watch's scope
 * `watching`: on Linux one inotify watch per folder, never one in
 * {@link LEFT_OUT} or a folder git ignores ({@link ignoredBy}); on macOS
 * one recursive FSEvents stream. Once its first scan is done it reconciles
 * whole, and each change it hears after is gathered into a step
 * ({@link heard}). Events the kernel dropped (inotify's queue overflowed:
 * Bun hands each watch a change with no name, chokidar's `raw`) bring a
 * whole reconcile; an error brings one, and the watch starts again after
 * {@link REWATCH_MS}. Its listeners come off and it closes as the scope
 * closes, so nothing an ended watch hears reaches the clone.
 */
const watchSource = Effect.fnUntraced(function* (
  id: string,
  follow: Following,
  watching: Scope.Scope
) {
  const kept = yield* Effect.tryPromise({
    try: () => keptOf(id),
    catch: (error) => error,
  });
  if (!kept || following.get(id) !== follow) {
    return;
  }
  const source = sourceOf(kept);
  const ignored = yield* Effect.promise(() =>
    ignoredBy(kept).catch((error: unknown) => {
      console.warn(
        `[stage] ${id.slice(0, 8)}: the folders git ignores in ${source} could not be read, so its watch reads them too: ${failureOf(error)}`
      );
      return [];
    })
  );
  if (following.get(id) !== follow) {
    return;
  }
  yield* Scope.provide(
    Effect.acquireRelease(
      Effect.sync(() => {
        const watcher = watch(source, {
          ignored: [
            (path: string) => path !== source && LEFT_OUT.has(basename(path)),
            ...ignored.map((path) => ({ path, recursive: true })),
          ],
          ignoreInitial: true,
          followSymlinks: false,
          atomic: false,
          ignorePermissionErrors: true,
          persistent: false,
        });
        follow.source = source;
        const from = (path: string) => relative(source, path);
        watcher
          .on("add", (path) => heard(id, follow, { path: from(path) }))
          .on("change", (path) => heard(id, follow, { path: from(path) }))
          .on("unlink", (path) => heard(id, follow, { path: from(path) }))
          .on("unlinkDir", (path) => heard(id, follow, { gone: from(path) }))
          .on("raw", (_event, path) => {
            if (!path) {
              heard(id, follow, "whole");
            }
          })
          .on("ready", () => heard(id, follow, "whole"))
          .on("error", (error) => {
            console.warn(
              `[stage] ${id.slice(0, 8)}: the watch of ${source} failed, so its clone is brought in step whole and watched again in ${REWATCH_MS / 1000}s: ${failureOf(error)}`
            );
            rewatch(id, follow, REWATCH_MS);
            heard(id, follow, "whole");
          });
        return watcher;
      }),
      (watcher: FSWatcher) =>
        Effect.sync(() => watcher.removeAllListeners()).pipe(
          Effect.andThen(
            Effect.tryPromise({
              try: () => watcher.close(),
              catch: (error) => error,
            })
          ),
          Effect.catch((error) =>
            Effect.sync(() =>
              console.warn(`[stage watch close] failed: ${failureOf(error)}`)
            )
          )
        )
    ),
    watching
  );
});

/**
 * Place `place`'s stage clone kept in step with its source while a live
 * stage of it serves: one watch per clone, however many of its stages
 * follow ({@link watchSource}), so the session's edits reach an open sheet
 * or page through its HMR. Answers what ends this stage's following; the
 * watch closes once no stage follows.
 */
export const followCheckout = (place: WorkspaceRef): (() => void) => {
  const id = stageCloneId(place.id);
  let follow = following.get(id);
  if (!follow) {
    follow = { users: 0, named: new Set(), gone: new Set(), whole: false };
    following.set(id, follow);
    rewatch(id, follow, 0);
  }
  follow.users += 1;
  const mine = follow;
  let ended = false;
  return () => {
    if (ended) {
      return;
    }
    ended = true;
    mine.users -= 1;
    if (mine.users === 0 && following.get(id) === mine) {
      following.delete(id);
      unwatch(mine);
    }
  };
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
 * record, nor for a copy of a folder, which is read against the folder
 * itself (layer.ts `changesOf`).
 */
export const sameAsCheckout = async (
  id: string,
  clone: string
): Promise<string[]> => {
  const kept = await keptOf(id);
  if (kept?.kind !== "clone") {
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
  await makeFolder(dirname(to));
  await writeFile(to, bytes);
};

/*
 * A pin: a copy of a folder preview this machine made each time its author
 * handed it up, before the hub kept a folder preview's files itself (hub
 * artifacts/folder-move.ts). Its copy stands at `folder` in the pin's state
 * dir, beside the record ({@link PIN}) written once it stood whole. No pin
 * is made any more: the hub reads each one's copy off this machine as it
 * registers, keeps the files with the artifact, and then this machine lets
 * the pin go (stage.ts `keepPins`), a tree an earlier build pinned among
 * them.
 */

/** The record a pin's state dir held once its copy stood whole. */
const PIN = "stage-pin.json";

/** Whether id `id` names a pin this machine copied whole (read synchronously), or a tree an earlier build pinned. */
const isPin = (id: string): boolean =>
  existsSync(join(workspaceStateDir(id), PIN));

/**
 * Everything of pin `pin` removed: for a tree an earlier build pinned, its
 * boundary closed with its scratch and door dirs (boundary/stop.ts
 * `closeBoundary`), as a design folder's is (stage-design.ts `dropDesign`),
 * and its tree at `path` deleted; its state dir, which holds a folder's
 * copy, deleted.
 */
const dropped = async (pin: string, path: string | undefined) => {
  if (path) {
    await closeBoundary({ id: pin, path });
    await removeTree(path);
  }
  copied.delete(pin);
  await forgetInstalls(pin);
  await removeTree(workspaceStateDir(pin));
};

/**
 * Pin `pin` removed whole, in its turn: its boundary closed, its clone or
 * copy, scratch, door and state dirs deleted. Its stages are stopped first by the
 * caller (stage.ts `unpin`). Nothing for an id no pin has.
 */
export const dropPin = (pin: string): Promise<void> =>
  inCloneTurn(pin, async () => {
    if (!isPin(pin)) {
      return;
    }
    await dropped(pin, await recordedPath(pin));
    console.info(`[stage] pin ${pin.slice(0, 8)}: let go`);
  });

/**
 * Every pin this machine holds, with when its cut stood: what the hub's
 * list of the pins it serves from is squared against (stage.ts
 * `keepPins`). One whose cut is under way now is none yet.
 */
export const pinsHeld = async (): Promise<{ at: number; pin: string }[]> => {
  const ids = await readdir(workspacesDir()).catch(() => []);
  const each = await Promise.all(
    ids.map(async (pin) => {
      const at = await stat(join(workspaceStateDir(pin), PIN)).then(
        (found) => found.mtimeMs,
        () => undefined
      );
      return at === undefined || turns.isBusy(pin) ? undefined : { at, pin };
    })
  );
  return each.filter((one) => one !== undefined);
};
