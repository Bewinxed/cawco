/**
 * The agent's object pools (core object-pool.ts): one bare repository per
 * origin under `~/.cawco/object-pools/`, whose objects every workspace clone
 * of that origin borrows (clone.ts `prepareClone`), and every stage clone and
 * pin cut from a checkout of it (stage-clone.ts `cut`), so a clone stores only
 * the objects it makes itself. A clone cut whole copied the source's store
 * apart from it (1.5 to 2.5 GB a cockpit clone on ext4, 31.5 GB across 38
 * clones on 2026-11-20); a clone that borrows from a pool holds a few
 * megabytes, and nothing it can write shares an inode with anything outside
 * it. It is the pattern GitHub (a fork's `network.git`) and GitLab (object
 * pools) run, with GitLab's one rule: "Do not run `git prune` or `git gc` in
 * object pool repositories".
 *
 * What keeps every borrower whole is that nothing in a pool is ever removed:
 * git in a borrower takes an object it finds in the pool as its own and
 * stores no copy, so an object pruned from the pool is gone from every clone
 * that reached it (git-clone(1) `--shared`: the cloned repository "will
 * become corrupt"). So a pool:
 *
 * - is written by this agent alone, on the host, and only by `git fetch`
 *   ({@link readyPool}): seeded once, as it is made, from the person's own
 *   repository's `refs/remotes/origin/*`, never from a workspace's clone,
 *   whose refs a sandbox writes; then at every workspace's cut, the remote's
 *   default branch fetched from the remote ({@link readyPool}). A stage
 *   clone's cut fetches nothing into it ({@link standingPool}). A fetch names
 *   every object by its content, so a pool takes in no file as it lies;
 * - never runs `gc`, `prune` or a `repack -a -d` without `-k`: its config
 *   turns automatic maintenance off and keeps unreachable objects for ever
 *   ({@link POOL_CONFIG}), every git here runs with maintenance off on top
 *   ({@link poolGitEnv}), and past {@link MANY_PACKS} packs it is repacked
 *   geometrically, which rolls whole packs into one ({@link repackWhenMany});
 * - is read only inside every boundary (core workspace-policy.ts
 *   `borrowedObjects`), so a sandbox's git, which freshens a borrowed
 *   object's timestamp where it can, writes its own copy instead;
 * - goes only when no record names it and its newest pack is
 *   {@link RECLAIM_AFTER_MS} old ({@link reclaimPools}): a pool no clone
 *   borrows is only a cache for the next cut.
 *
 * And a clone cut before pools is converted in place, with nothing running
 * in it ({@link borrowFromPool}).
 */
import {
  lstat,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  rmdir,
  stat,
} from "node:fs/promises";
import { join } from "node:path";
import { lockBy, openLockFile, tryLock, unlock } from "@cawco/core/flock";
import { folderBytes } from "@cawco/core/folder-bytes";
import { makeFolder } from "@cawco/core/folders";
import {
  alternatesText,
  type CreateRecord,
  createRecordOf,
  isPoolPath,
  poolAt,
} from "@cawco/core/object-pool";
import {
  objectPoolsDir,
  workspaceCreateFile,
  workspacesDir,
} from "@cawco/core/paths/workspace";
import { repositoryConfigProblem } from "@cawco/core/safe-git";
import { hostEnvironment } from "@cawco/core/session-env";
import { writeStateFile } from "@cawco/core/state-file";
import { DAY_MS } from "@cawco/core/time";
import type { WorkspaceRef } from "@cawco/core/workspace/controls";
import { workspaceIdKindOf } from "@cawco/core/workspace-id";
import { fetchDefaultBranch, type Git, gitUntil } from "./git/run";
import { configEnv } from "./git-credential";

/**
 * A pool's own config, written as it is made: no automatic gc or maintenance
 * after a fetch (the trap Buildkite's mirrors fell into: a mirror's fetch ran
 * auto-maintenance and removed objects a checkout needed), unreachable
 * objects never expired, and every fetch kept as the pack it came in, so the
 * file count stays small.
 */
const POOL_CONFIG: readonly [string, string][] = [
  ["gc.auto", "0"],
  ["maintenance.auto", "false"],
  ["gc.pruneExpire", "never"],
  ["fetch.unpackLimit", "1"],
];

/** What every git run in a pool carries, whatever its config says: no automatic maintenance. */
const NO_MAINTENANCE: [string, string][] = [
  ["maintenance.auto", "false"],
  ["gc.auto", "0"],
];

/** `env` with {@link NO_MAINTENANCE} after the git config it carries already: what a git in a pool runs with. */
export const poolGitEnv = (
  env: Record<string, string>
): Record<string, string> => ({ ...env, ...configEnv(NO_MAINTENANCE, env) });

/** The end of the name a pool is made under ({@link makePool}). */
const MAKING = /\.making$/u;

/** Past this many packs a pool is repacked ({@link repackWhenMany}). */
const MANY_PACKS = 30;

/** How old a pool's newest pack is before a pool no record names goes ({@link reclaimPools}). */
const RECLAIM_AFTER_MS = 14 * DAY_MS;

/** How long a conversion's git may take ({@link borrowFromPool}): a repack of a clone's own history, then a connectivity check. */
const CONVERT_GIT_MS = 600_000;

/** The pool a clone is cut to borrow from, and what makes it ({@link readyPool}). */
export interface PoolSource {
  /** The source's object format (`git rev-parse --show-object-format`). */
  format: string;
  /** The URL of the source's `origin`, which the pool fetches from. */
  origin: string;
  /** {@link poolAt} of the two. */
  pool: string;
  /** The person's repository the pool is seeded from as it is made; none when the source is a workspace's clone. */
  seed: string | undefined;
}

/** `git init`'s flag for `format`: none for SHA-1, the default every git understands. */
export const formatFlag = (format: string): string[] =>
  format === "sha1" ? [] : [`--object-format=${format}`];

/**
 * `work` holding pool `pool`'s lock (`flock(2)` on `<pool>.lock` beside
 * it), once whoever holds it lets it go, by `deadline`: one fetch, repack or
 * removal at a time per pool, by every process on this computer.
 */
const withPool = async <T>(
  pool: string,
  deadline: number,
  work: () => Promise<T>
): Promise<T> => {
  await makeFolder(objectPoolsDir());
  const fd = openLockFile(`${pool}.lock`, true);
  try {
    if (!(await lockBy(fd, deadline))) {
      throw new Error(
        `the object pool ${pool} was still being fetched into by another cut when this one's time ran out`
      );
    }
    return await work();
  } finally {
    unlock(fd);
  }
};

/**
 * Pool `source.pool` brought up to date for a cut, made first when it is not
 * there ({@link makePool}): its `origin` set to the source's, the remote's
 * default branch fetched into it from the remote ({@link fetchDefaultBranch},
 * `known` passed on), and repacked when it holds many packs. Answers that
 * branch and the commit it is at: the cut's base. `run` is git in the pool,
 * with the remote's credential when it is the hub's and {@link poolGitEnv}.
 */
export const readyPool = (
  source: PoolSource,
  run: Git,
  known: string | undefined,
  deadline: number
): Promise<{ base: string; tip: string }> =>
  withPool(source.pool, deadline, async () => {
    if (!(await lstat(source.pool).catch(() => undefined))) {
      await makePool(source, run);
    }
    await run(source.pool, "config", "remote.origin.url", source.origin);
    const base = await fetchDefaultBranch(source.pool, run, known);
    await repackWhenMany(source.pool, run);
    const tip = await run(
      source.pool,
      "rev-parse",
      "--verify",
      `refs/remotes/origin/${base}^{commit}`
    );
    return { base, tip };
  });

/**
 * Pool `source.pool` as it stands, for a cut that starts from a checkout's
 * own HEAD rather than the remote's default branch (stage-clone.ts `cut`):
 * made first when it is not there ({@link makePool}, seeded from the
 * person's repository), and nothing fetched from the remote, so such a cut
 * reaches no network. Answers whether it holds any ref: a pool made with no
 * seed (from a workspace's clone, or a shallow or partial repository) holds
 * nothing to lend until a workspace's cut fetches into it. `run` is git in
 * the pool, with {@link poolGitEnv}.
 */
export const standingPool = (
  source: PoolSource,
  run: Git,
  deadline: number
): Promise<boolean> =>
  withPool(source.pool, deadline, async () => {
    if (!(await lstat(source.pool).catch(() => undefined))) {
      await makePool(source, run);
    }
    const ref = await run(
      source.pool,
      "for-each-ref",
      "--count=1",
      "--format=%(refname)"
    );
    return ref !== "";
  });

/**
 * A new pool, made beside its path and renamed into it once whole, so a pool
 * is never there half made: a bare repository with no template (no hooks,
 * nothing a borrower reads but objects), {@link POOL_CONFIG}, and seeded
 * from the person's repository when the source is one ({@link seedPool}).
 */
const makePool = async (
  { format, pool, seed }: PoolSource,
  run: Git
): Promise<void> => {
  const making = `${pool}.making`;
  await rm(making, { recursive: true, force: true });
  await run(
    objectPoolsDir(),
    "init",
    "--quiet",
    "--bare",
    "--template=",
    ...formatFlag(format),
    making
  );
  for (const [key, value] of POOL_CONFIG) {
    await run(making, "config", key, value);
  }
  if (seed) {
    await seedPool(making, seed, run);
  }
  await rename(making, pool);
  console.info(
    `[workspace] an object pool is made at ${pool}${seed ? `, seeded from ${seed}` : ""}`
  );
};

/**
 * What the person's repository `repo` already fetched from its `origin`,
 * fetched into the new pool at `refs/cawco/seed/*`: the next fetch from the
 * remote then downloads only what is past it. Best effort, and only from a
 * repository that holds every object it names: a shallow one, or a partial
 * clone, whose missing objects git would go to its remote for, seeds
 * nothing, and the remote's fetch does the whole of it.
 */
const seedPool = async (pool: string, repo: string, run: Git) => {
  const shallow = await run(repo, "rev-parse", "--is-shallow-repository").catch(
    () => "true"
  );
  const partial = await run(
    repo,
    "config",
    "--get",
    "extensions.partialclone"
  ).catch(() => "");
  if (shallow !== "false" || partial) {
    console.info(
      `[workspace] the object pool ${pool} is not seeded from ${repo}: it is ${partial ? "a partial clone" : "shallow"}, so the remote's fetch brings everything`
    );
    return;
  }
  await run(
    pool,
    "fetch",
    "--quiet",
    "--no-tags",
    "--no-write-fetch-head",
    repo,
    "+refs/remotes/origin/*:refs/cawco/seed/*"
  ).catch((error: Error) =>
    console.warn(
      `[workspace] the object pool ${pool} could not be seeded from ${repo}, so the remote's fetch brings everything: ${error.message}`
    )
  );
};

/** The packs in the pack dir `dir`, by name. */
const packsIn = async (dir: string): Promise<string[]> =>
  (await readdir(dir).catch(() => [])).filter((name) => name.endsWith(".pack"));

/** git's version as `[major, minor]`, asked once. */
let gitVersion: Promise<[number, number]> | undefined;

const GIT_VERSION = /(\d+)\.(\d+)/u;

/**
 * Whether this host's git repacks geometrically (`--geometric`, git 2.32):
 * the packs too small for the progression are rolled into one, every object
 * in them kept (`pack-objects --stdin-packs`), the rest left as they are.
 */
const geometric = async (run: Git): Promise<boolean> => {
  gitVersion ??= run(objectPoolsDir(), "version").then((out) => {
    const [, major = "0", minor = "0"] = GIT_VERSION.exec(out) ?? [];
    return [Number(major), Number(minor)];
  });
  const [major, minor] = await gitVersion;
  return major > 2 || (major === 2 && minor >= 32);
};

/**
 * Pool `pool` repacked once a fetch leaves more than {@link MANY_PACKS} packs
 * in it, every object kept: geometrically where git can, else every pack
 * into one with every unreachable object appended to it (`-a -d -k`).
 */
const repackWhenMany = async (pool: string, run: Git): Promise<void> => {
  const packs = await packsIn(join(pool, "objects", "pack"));
  if (packs.length <= MANY_PACKS) {
    return;
  }
  await run(
    pool,
    "repack",
    "-q",
    "-d",
    ...((await geometric(run)) ? ["--geometric=2"] : ["-a", "-k"])
  );
};

/**
 * The pool every workspace's `create.json` names, or nothing when one could
 * not be read: a pool is removed only when no record could name it.
 */
const namedPools = async (): Promise<Set<string> | undefined> => {
  const named = new Set<string>();
  for (const id of await readdir(workspacesDir()).catch(() => [])) {
    let record: CreateRecord | undefined;
    try {
      record = await createRecordOf(id);
    } catch (error) {
      console.warn(
        `[workspace] no object pool is reclaimed: workspace ${id}'s record could not be read: ${error instanceof Error ? error.message : String(error)}`
      );
      return;
    }
    if (record?.pool) {
      named.add(record.pool);
    }
  }
  return named;
};

/** When `pool` last took in objects: its newest pack's time, or the pool's own with none. */
const lastFetched = async (pool: string): Promise<number> => {
  const dir = join(pool, "objects", "pack");
  const times = await Promise.all(
    (await packsIn(dir)).map(
      async (name) => (await stat(join(dir, name))).mtimeMs
    )
  );
  return Math.max((await stat(pool)).mtimeMs, ...times);
};

/**
 * At the agent's start, before any cut is served: each pool no workspace's
 * record names, whose newest pack is {@link RECLAIM_AFTER_MS} old, is
 * removed, and so is a pool its making left half made. None when any record
 * could not be read. A pool another process holds is left. Never throws.
 */
export const reclaimPools = async (): Promise<void> => {
  try {
    const named = await namedPools();
    if (!named) {
      return;
    }
    const pools = objectPoolsDir();
    for (const name of await readdir(pools).catch(() => [])) {
      const pool = join(pools, name.replace(MAKING, ""));
      if (!isPoolPath(pool) || named.has(pool)) {
        continue;
      }
      const making = name.endsWith(".making");
      if (
        !making &&
        Date.now() - (await lastFetched(pool)) < RECLAIM_AFTER_MS
      ) {
        continue;
      }
      const fd = openLockFile(`${pool}.lock`, true);
      try {
        if (!tryLock(fd)) {
          continue;
        }
        await rm(join(pools, name), { recursive: true, force: true });
        if (!making) {
          // Held: no cut opens it meanwhile, and the next makes it again.
          await rm(`${pool}.lock`, { force: true });
        }
      } finally {
        unlock(fd);
      }
      console.info(
        making
          ? `[workspace] ${join(pools, name)}, an object pool left half made, is removed`
          : `[workspace] the object pool ${pool}, which no workspace borrows from and which took in nothing for 14 days, is removed`
      );
    }
  } catch (error) {
    console.warn(
      `[workspace] the object pools no workspace borrows from could not all be looked at: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

/** A clone's object store, each dir of it its own (no link): what a conversion moves files in. */
interface Store {
  alternates: string;
  /** Where a conversion keeps the packs it replaces until the clone is checked, `objects/pack.cawco-old`: there, a conversion was cut short. */
  aside: string;
  dotGit: string;
  info: string;
  pack: string;
}

/**
 * The store of the clone at `path`, when it and every dir a conversion
 * writes in is a folder of the clone's own, never a link a command in it
 * made to lead elsewhere; nothing otherwise.
 */
const storeOf = async (path: string): Promise<Store | undefined> => {
  const dotGit = join(path, ".git");
  const objects = join(dotGit, "objects");
  const info = join(objects, "info");
  const pack = join(objects, "pack");
  for (const dir of [path, dotGit, objects, info, pack]) {
    if (!(await lstat(dir).catch(() => undefined))?.isDirectory()) {
      return;
    }
  }
  return {
    aside: join(objects, "pack.cawco-old"),
    alternates: join(info, "alternates"),
    dotGit,
    info,
    pack,
  };
};

/**
 * The files of every pack in `dir` but one kept by a `.keep` file (which a
 * repack leaves out of what it packs): `pack-<hash>.pack` and each file
 * named for it beside it (`.idx`, `.rev`, `.bitmap`, `.mtimes`).
 */
const packFiles = async (dir: string): Promise<string[]> => {
  const names = await readdir(dir);
  const kept = new Set(
    names
      .filter((name) => name.endsWith(".keep"))
      .map((name) => name.slice(0, -".keep".length))
  );
  const stems = names
    .filter((name) => name.startsWith("pack-") && name.endsWith(".pack"))
    .map((name) => name.slice(0, -".pack".length))
    .filter((stem) => !kept.has(stem));
  return names.filter((name) =>
    stems.some((stem) => name.startsWith(`${stem}.`))
  );
};

/** Every file in `from` moved into `to`, by name. */
const moveAll = async (from: string, to: string): Promise<void> => {
  for (const name of await readdir(from)) {
    await rename(join(from, name), join(to, name));
  }
};

/**
 * What git keeps beside a store's packs that names objects of the packs a
 * conversion replaces: the commit-graph, whose commits the conversion drops
 * leave `git fsck` failing ("failed to parse commit … for commit-graph"),
 * and a multi-pack index. git reads the store without them, and writes them
 * again when it is asked.
 */
const dropIndexes = async ({ info, pack }: Store): Promise<void> => {
  await rm(join(info, "commit-graph"), { force: true });
  await rm(join(info, "commit-graphs"), { recursive: true, force: true });
  for (const name of await readdir(pack)) {
    if (name.startsWith("multi-pack-index")) {
      await rm(join(pack, name), { force: true });
    }
  }
};

/** Each workspace's conversions, queued: the last of its queue ({@link borrowFromPool}). */
const converting = new Map<string, Promise<void>>();

/** The workspaces whose conversion failed in this agent's life: tried again at its next start, never at every boundary start. */
const unconverted = new Set<string>();

/**
 * Workspace `ref`'s clone, cut before pools with a whole store of its own,
 * made to borrow from its origin's pool and keep only what it alone holds,
 * in place, its every commit, stash entry and index kept (GitLab's step for
 * joining a pool, `git repack -a -l`, proven on a copy of a cockpit clone
 * with an unlanded commit and a stash: 1.5 GB to 7.0 MB in 3.9 s):
 *
 * 1. `pool` written into its `create.json`, before anything borrows;
 * 2. its alternates file written as that pool's one line;
 * 3. one new pack of what its refs, reflogs and index reach that the pool
 *    does not hold (`git repack -a -l`, {@link packOwn});
 * 4. the packs it had moved to `objects/pack.cawco-old`, and the indexes
 *    naming them dropped ({@link dropIndexes});
 * 5. `git fsck --connectivity-only`: passed, the old packs go; failed, every
 *    step is undone in reverse, and the log says why.
 *
 * The folder of old packs is made first: one found there means a conversion
 * was cut short, whose packs go back before it runs again. Only a clone with
 * an `origin` in its record and no `pool` yet (or one cut short), whose
 * dirs are its own ({@link storeOf}), whose config host git runs under, and
 * whose origin's pool is already there (the first cut of that origin makes
 * it): no network is touched.
 *
 * Nothing may run in the clone meanwhile. A boundary's cold start converts
 * it before its sandbox starts (boundary/ensure.ts); the agent's start-up
 * pass passes `idle`, asked in this workspace's turn, which names what runs
 * there and leaves the clone as it is if anything does. One at a time per
 * workspace, in the order asked. Never throws.
 */
export const borrowFromPool = (
  ref: WorkspaceRef,
  idle?: () => Promise<string | undefined>
): Promise<void> => {
  const next = (converting.get(ref.id) ?? Promise.resolve())
    .then(() => convert(ref, idle))
    .catch((error: unknown) => {
      unconverted.add(ref.id);
      console.warn(
        `[workspace] ${ref.id}: its clone ${ref.path} could not be made to borrow from its object pool, and keeps its whole store: ${error instanceof Error ? error.message : String(error)}`
      );
    });
  converting.set(ref.id, next);
  next.finally(() => {
    if (converting.get(ref.id) === next) {
      converting.delete(ref.id);
    }
  });
  return next;
};

/** Workspace `id`'s conversion under way ({@link borrowFromPool}), if any: what an archive waits for. */
export const conversionOf = (id: string): Promise<void> | undefined =>
  converting.get(id);

/** {@link borrowFromPool}'s one conversion. */
const convert = async (
  ref: WorkspaceRef,
  idle: (() => Promise<string | undefined>) | undefined
): Promise<void> => {
  // Only a clone (core workspace-id.ts) is a repository CawCo cut and may convert.
  if (workspaceIdKindOf(ref.id) !== "clone" || unconverted.has(ref.id)) {
    return;
  }
  const record = await createRecordOf(ref.id);
  const origin = record?.origin;
  const store = await storeOf(ref.path);
  if (!(
    record?.path &&
    origin &&
    store &&
    (await realOf(record.path)) === (await realOf(ref.path))
  )) {
    return;
  }
  const aside = await lstat(store.aside).catch(() => undefined);
  if (aside && !aside.isDirectory()) {
    throw new Error(`${store.aside} is no folder of the clone's own`);
  }
  if (record.pool && !aside) {
    await keepBorrowing(ref, store, record.pool, idle);
    return;
  }
  const git = gitUntil(
    Date.now() + CONVERT_GIT_MS,
    poolGitEnv(hostEnvironment())
  );
  const pool = poolAt(
    await git(ref.path, "rev-parse", "--show-object-format"),
    origin
  );
  if (!(await lstat(pool).catch(() => undefined))?.isDirectory()) {
    return;
  }
  const busy = await idle?.();
  if (busy) {
    console.info(
      `[workspace] ${ref.id}: its clone is left with its whole store for now, as ${busy}`
    );
    return;
  }
  const problem = await repositoryConfigProblem(
    store.dotGit,
    record.pool && isPoolPath(record.pool) ? record.pool : undefined
  );
  if (problem) {
    throw new Error(problem);
  }
  if (aside) {
    await moveAll(store.aside, store.pack);
  } else {
    await makeFolder(store.aside, { exclusive: true });
  }
  const before = await folderBytes([store.dotGit]);
  const started = Date.now();
  const was: Was = {
    alternates: await readFile(store.alternates, "utf8").catch(() => ""),
    record,
  };
  try {
    await writeStateFile(
      workspaceCreateFile(ref.id),
      JSON.stringify({ ...record, pool } satisfies CreateRecord)
    );
    await writeStateFile(store.alternates, alternatesText(pool), {
      inPlace: true,
    });
    const listed = await packFiles(store.pack);
    const own = await packOwn(git, ref.path, store.pack);
    const replaced = listed.filter((name) => !name.startsWith(`${own}.`));
    for (const name of replaced) {
      await rename(join(store.pack, name), join(store.aside, name));
    }
    await dropIndexes(store);
    await git(
      ref.path,
      "fsck",
      "--connectivity-only",
      "--no-dangling",
      "--no-progress"
    );
  } catch (error) {
    await undo(ref, store, was);
    throw error;
  }
  await rm(store.aside, { recursive: true, force: true });
  console.info(
    `[workspace] ${ref.id}: its clone ${ref.path} borrows from the object pool ${pool} and keeps only its own objects: its .git went from ${megabytes(before)} to ${megabytes(await folderBytes([store.dotGit]))} in ${Date.now() - started} ms`
  );
};

/**
 * The alternates line of a clone that borrows `pool`, written again when its
 * file is gone or empty, with nothing running in it: the clone's own store
 * holds none of what the pool lends, so without the line git there finds
 * none of it. A file naming anything else is left for host git to refuse
 * (safe-git.ts `repositoryConfigProblem`).
 */
const keepBorrowing = async (
  ref: WorkspaceRef,
  store: Store,
  pool: string,
  idle: (() => Promise<string | undefined>) | undefined
): Promise<void> => {
  const listed = await readFile(store.alternates, "utf8").catch(() => "");
  if (!isPoolPath(pool) || listed.trim() || (await idle?.())) {
    return;
  }
  await writeStateFile(store.alternates, alternatesText(pool), {
    inPlace: true,
  });
  console.warn(
    `[workspace] ${ref.id}: its clone ${ref.path} borrows from the object pool ${pool}, and its alternates file named nothing: the pool's line is written again`
  );
};

/** What a conversion found before it wrote anything ({@link undo}): the alternates file's text and the record. */
interface Was {
  alternates: string;
  record: CreateRecord;
}

/**
 * A conversion's steps undone, last first, so the clone's objects are
 * whole at every point: its old packs back, its alternates file and its
 * record as the conversion found them (borrowing nothing, or for a
 * conversion cut short whatever it had reached), and the folder of old
 * packs, empty now, gone last (the mark that a conversion is under way).
 */
const undo = async (
  ref: WorkspaceRef,
  store: Store,
  was: Was
): Promise<void> => {
  await moveAll(store.aside, store.pack);
  await writeStateFile(store.alternates, was.alternates, { inPlace: true });
  await writeStateFile(
    workspaceCreateFile(ref.id),
    JSON.stringify(was.record satisfies CreateRecord)
  );
  await rmdir(store.aside);
};

/**
 * One new pack in the clone at `path` of every object its refs, reflogs,
 * HEAD and index reach that is not borrowed (`--local`): what `git repack -a
 * -l` packs (GitLab's step for joining a pool), run as `pack-objects`
 * itself so the new pack's name is known. A pack's name is the hash of
 * what it holds, so the new one can bear the name of a pack already there
 * (a conversion cut short and run again finds the same objects to pack),
 * and that one is the clone's to keep. Answers its `pack-<hash>` stem, or
 * nothing when every object it reaches is borrowed.
 */
const packOwn = async (
  git: Git,
  path: string,
  pack: string
): Promise<string> => {
  const hash = await git(
    path,
    "pack-objects",
    "-q",
    "--keep-true-parents",
    "--honor-pack-keep",
    "--non-empty",
    "--all",
    "--reflog",
    "--indexed-objects",
    "--local",
    "--delta-base-offset",
    join(pack, "pack")
  );
  return hash ? `pack-${hash}` : "";
};

/** `path` at its real path, links followed; as given when it does not exist. */
const realOf = (path: string): Promise<string> =>
  realpath(path).catch(() => path);

const megabytes = (bytes: number): string =>
  `${(bytes / 1024 / 1024).toFixed(1)} MB`;
