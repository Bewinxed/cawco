/**
 * Move files on this machine (core folder-move.ts; the hub's job is
 * folder-moves.ts): the read of the folder and its destination, the rename
 * on one disk, the copy to another disk or machine (folder-tree.ts), the
 * copy put in place, the old folder removed by the copy's list, and a
 * called-off move's partial copy dropped.
 *
 * Each job keeps a record here, in CawCo's data dir, never in the person's
 * folder (`folder-moves/<job>/`): the folder's identity on disk before a
 * rename and the copy's before it is put in place, so a step run again after
 * a restart can tell done from not yet; and the list of every entry the
 * copy took, which is all the removal ever goes by. Nothing here removes the
 * old folder as a whole.
 */
import { dlopen, FFIType, ptr, read } from "bun:ffi";
import { readdirSync, readFileSync, readlinkSync } from "node:fs";
import {
  appendFile,
  lstat,
  readdir,
  readFile,
  realpath,
  rename,
  rmdir,
  statfs,
  unlink,
} from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, normalize } from "node:path";
import { errnoCode } from "@cawco/core/absent";
import type {
  FolderMoveBlock,
  FolderMoveCopied,
  FolderMoveCopyAsk,
  FolderMoveDestinationReading,
  FolderMoveDropAsk,
  FolderMoveLeft,
  FolderMovePlaceAsk,
  FolderMoveProgressFrame,
  FolderMoveReadAsk,
  FolderMoveReading,
  FolderMoveRemoveAsk,
  FolderMoveRemoved,
  FolderMoveRenameAsk,
  FolderMoveRenamed,
  FolderMoveSourceReading,
} from "@cawco/core/folder-move";
import { folderMoveStaging } from "@cawco/core/folder-move";
import { makeFolder } from "@cawco/core/folders";
import { cawcoDataDir } from "@cawco/core/paths/roots";
import { runCaptured } from "@cawco/core/run-captured";
import { GIT_LOCALE } from "@cawco/core/safe-git";
import { writeStateFile } from "@cawco/core/state-file";
import { blockWords, folderStepWords } from "@cawco/core/words/folder-move";
import { dropCarried } from "./folder-carry";
import { relayStream, relayTaken } from "./folder-relay";
import {
  copyBlockOf,
  gitFacts,
  noneFound,
  sendTree,
  type TreeEntry,
  type TreeProgress,
  TreeRefused,
  takeTree,
  walkTree,
} from "./folder-tree";
import { forgetMade, moveMade, recordMade } from "./made-folders";
import { machineFloor, within } from "./remove-folder";
import { removeTree } from "./remove-tree";
import { TreeEntrySchema } from "./stored-shapes";

/** How often the removal says how far it is. */
const SAY_EVERY_MS = 250;
/** How long a read walks a folder before it answers with what it counted. */
const READ_WALK_MS = 15_000;

/** The copies running here, by job: a Drop stops its job's. */
const running = new Map<string, AbortController>();

// ── A job's record on this machine ─────────────────────────────────────────

/** A move's id as a path segment: a plain token, never `..`. */
const JOB_ID = /^[A-Za-z0-9-]{1,64}$/u;
/** A line of macOS's `mount`: where each disk is mounted. */
const MOUNTED_ON = / on (.+) \(/u;
/** A process's entry in `/proc`. */
const PID = /^\d+$/u;

const jobDir = (jobId: string): string => {
  if (!JOB_ID.test(jobId)) {
    throw new Error(`${jobId} is not a move's id.`);
  }
  return join(cawcoDataDir(), "folder-moves", jobId);
};
const listFile = (jobId: string): string => join(jobDir(jobId), "list.jsonl");
const identityFile = (jobId: string, of: "source" | "staging"): string =>
  join(jobDir(jobId), `${of}.json`);

interface Identity {
  dev: number;
  ino: number;
}

const identityAt = async (path: string): Promise<Identity | undefined> => {
  const info = await lstat(path).catch(() => undefined);
  return info && { dev: info.dev, ino: info.ino };
};

const keepIdentity = async (
  jobId: string,
  of: "source" | "staging",
  identity: Identity
): Promise<void> => {
  await writeStateFile(identityFile(jobId, of), JSON.stringify(identity));
};

const keptIdentity = async (
  jobId: string,
  of: "source" | "staging"
): Promise<Identity | undefined> => {
  const text = await readFile(identityFile(jobId, of), "utf8").catch(
    () => undefined
  );
  if (!text) {
    return;
  }
  const parsed: unknown = JSON.parse(text);
  return typeof parsed === "object" &&
    parsed !== null &&
    "dev" in parsed &&
    "ino" in parsed &&
    typeof parsed.dev === "number" &&
    typeof parsed.ino === "number"
    ? { dev: parsed.dev, ino: parsed.ino }
    : undefined;
};

const sameIdentity = (a: Identity | undefined, b: Identity | undefined) =>
  !!a && !!b && a.dev === b.dev && a.ino === b.ino;

/** A job's record here gone: it is over on this machine. */
const forgetJob = async (jobId: string): Promise<void> => {
  await removeTree(jobDir(jobId));
};

// ── This machine's floor and disks ─────────────────────────────────────────

/** CawCo's own folders here, which nothing moves and nothing moves into. */
const ownDirs = (): string[] => {
  const floor = machineFloor();
  return [...floor.own, join(floor.home, ".worktrees")];
};

/** Why the folder at `path` can't move from here, by what stands in the way. */
const floorBlock = (path: string): FolderMoveBlock | undefined => {
  const floor = machineFloor();
  if (within(floor.home, path)) {
    return { kind: "machine-home" };
  }
  const own = ownDirs().find((dir) => within(path, dir) || within(dir, path));
  return own ? { kind: "machine-cawco", dir: own } : undefined;
};

const OCTAL = /\\([0-7]{3})/gu;

/** Each mount on this machine: its id and where it is mounted. */
const mountTable = async (): Promise<{ id: string; at: string }[]> => {
  if (process.platform === "linux") {
    return readFileSync("/proc/self/mountinfo", "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const fields = line.split(" ");
        return {
          id: fields[0] ?? "",
          at: (fields[4] ?? "").replace(OCTAL, (_, code: string) =>
            String.fromCharCode(Number.parseInt(code, 8))
          ),
        };
      });
  }
  const ran = await runCaptured(["mount"], { env: process.env }).catch(
    () => undefined
  );
  return (ran?.stdout ?? "")
    .split("\n")
    .map((line) => MOUNTED_ON.exec(line)?.[1])
    .filter((at): at is string => !!at)
    .map((at) => ({ id: at, at }));
};

/** The mount `path` (a real path) is on: the one mounted deepest above it. */
const mountOf = (
  table: readonly { id: string; at: string }[],
  path: string
): string | undefined =>
  table
    .filter((one) => within(path, one.at))
    .sort((a, b) => b.at.length - a.at.length)[0]?.id;

/** The deepest folder at or above `path` that stands, real. */
const standingAbove = async (path: string): Promise<string> => {
  let at = path;
  for (;;) {
    const real = await realpath(at).catch(() => undefined);
    if (real) {
      return real;
    }
    const up = dirname(at);
    if (up === at) {
      return at;
    }
    at = up;
  }
};

/** Whether the disk under `path` takes two names that differ only by case as one. */
const caseBlind = async (path: string): Promise<boolean> => {
  let at = await standingAbove(path);
  while (at !== dirname(at)) {
    const name = basename(at);
    const other =
      name.toUpperCase() === name ? name.toLowerCase() : name.toUpperCase();
    if (other !== name) {
      const [a, b] = await Promise.all([
        identityAt(at),
        identityAt(join(dirname(at), other)),
      ]);
      return sameIdentity(a, b);
    }
    at = dirname(at);
  }
  return false;
};

// ── The read ───────────────────────────────────────────────────────────────

const readSource = async (
  path: string,
  walk: boolean,
  mounts: ReadonlySet<string>
): Promise<FolderMoveSourceReading> => {
  const info = await lstat(path).catch(() => undefined);
  const plain = { path, head: null, links: 0, namesByCase: [] };
  if (!info) {
    return { ...plain, block: { kind: "source-gone" } };
  }
  if (!info.isDirectory()) {
    return { ...plain, block: { kind: "source-not-folder" } };
  }
  const block = floorBlock(path);
  if (block) {
    return { ...plain, block };
  }
  const head = (await gitFacts(path))?.head ?? null;
  if (!walk) {
    return { ...plain, head };
  }
  const found = noneFound();
  for await (const _ of walkTree({ from: path, name: "" }, found, {
    mounts,
    until: Date.now() + READ_WALK_MS,
  })) {
    // The walk counts as it goes.
  }
  const copyBlock = copyBlockOf(found);
  return {
    path,
    head,
    links: found.inward,
    namesByCase: found.namesByCase.slice(0, 20),
    walk: found.walk,
    ...(copyBlock ? { copyBlock } : {}),
  };
};

const readDestination = async (
  path: string,
  source: string | undefined
): Promise<FolderMoveDestinationReading> => {
  const above = await standingAbove(path);
  const room = await statfs(above).then(
    (fs) => fs.bavail * fs.bsize,
    () => null
  );
  const reading = { path, room, caseBlind: await caseBlind(path) };
  if (source && within(path, source)) {
    return { ...reading, block: { kind: "into-itself" } };
  }
  const own = ownDirs().find((dir) => within(path, dir));
  if (own) {
    return { ...reading, block: { kind: "destination-cawco", dir: own } };
  }
  const info = await lstat(path).catch(() => undefined);
  if (!info) {
    return reading;
  }
  if (!info.isDirectory()) {
    return { ...reading, block: { kind: "destination-not-folder" } };
  }
  const inside = await readdir(path).catch(() => ["?"]);
  return inside.length > 0
    ? { ...reading, block: { kind: "destination-holds" } }
    : reading;
};

/**
 * What the folder and the destination are, before anything runs: what
 * stands in the way, whether one rename moves it, and for a copy what it
 * holds and what a copy cannot carry. Changes nothing.
 */
export const folderMoveRead = async (
  ask: FolderMoveReadAsk
): Promise<FolderMoveReading> => {
  const table = await mountTable();
  const mounts = new Set(table.map((one) => one.at));
  const source = ask.source ? normalize(ask.source) : undefined;
  const destination = ask.destination ? normalize(ask.destination) : undefined;
  for (const path of [source, destination]) {
    if (path !== undefined && !isAbsolute(path)) {
      throw new Error(`${path} is not a full path.`);
    }
  }
  const [sourceReading, destinationReading] = await Promise.all([
    source ? readSource(source, ask.walk, mounts) : undefined,
    destination ? readDestination(destination, source) : undefined,
  ]);
  let sameDisk: boolean | undefined;
  if (source && destination) {
    const [from, to] = await Promise.all([
      realpath(source).catch(() => source),
      standingAbove(dirname(destination)),
    ]);
    sameDisk = mountOf(table, from) === mountOf(table, to);
  }
  return {
    home: homedir(),
    ...(sourceReading ? { source: sourceReading } : {}),
    ...(destinationReading ? { destination: destinationReading } : {}),
    ...(sameDisk === undefined ? {} : { sameDisk }),
  };
};

// ── A rename that never replaces ───────────────────────────────────────────

/** `renameat2`'s and `renamex_np`'s flag: fail with EEXIST where something stands. */
const RENAME_NOREPLACE = 1;
const RENAME_EXCL = 4;
const AT_FDCWD = -100;

const openLinux = () =>
  dlopen("libc.so.6", {
    renameat2: {
      args: [
        FFIType.i32,
        FFIType.ptr,
        FFIType.i32,
        FFIType.ptr,
        FFIType.u32,
      ] as const,
      returns: FFIType.i32,
    },
    __errno_location: { args: [] as const, returns: FFIType.ptr },
  });
const openDarwin = () =>
  dlopen("libSystem.B.dylib", {
    renamex_np: {
      args: [FFIType.ptr, FFIType.ptr, FFIType.u32] as const,
      returns: FFIType.i32,
    },
    __error: { args: [] as const, returns: FFIType.ptr },
  });
let linux: ReturnType<typeof openLinux> | undefined;
let darwin: ReturnType<typeof openDarwin> | undefined;

const ERRNO: Record<number, string> = {
  1: "EPERM",
  2: "ENOENT",
  13: "EACCES",
  16: "EBUSY",
  17: "EEXIST",
  18: "EXDEV",
  22: "EINVAL",
  38: "ENOSYS",
  39: "ENOTEMPTY",
  45: "ENOTSUP",
  66: "ENOTEMPTY",
  78: "ENOSYS",
  95: "ENOTSUP",
};

/** One rename(2) that fails rather than replace what stands at `to`: the errno's name when it fails. */
const renameExclusive = (from: string, to: string): string | undefined => {
  const a = Buffer.from(`${from}\0`);
  const b = Buffer.from(`${to}\0`);
  let code: number;
  let errno: number;
  if (process.platform === "darwin") {
    darwin ??= openDarwin();
    code = darwin.symbols.renamex_np(ptr(a), ptr(b), RENAME_EXCL);
    errno = code === 0 ? 0 : read.i32(darwin.symbols.__error() ?? 0, 0);
  } else {
    linux ??= openLinux();
    code = linux.symbols.renameat2(
      AT_FDCWD,
      ptr(a),
      AT_FDCWD,
      ptr(b),
      RENAME_NOREPLACE
    );
    errno = code === 0 ? 0 : read.i32(linux.symbols.__errno_location() ?? 0, 0);
  }
  return code === 0 ? undefined : (ERRNO[errno] ?? `errno ${errno}`);
};

/**
 * `from` renamed to `to` in one step, never over anything standing there
 * (an empty folder standing there goes first, as the person's own empty
 * destination). Answers false when `to` is on another disk (EXDEV) and
 * nothing moved. A disk whose rename takes no such flag gets a plain rename
 * once nothing stands at `to`.
 */
const renameOnto = async (from: string, to: string): Promise<boolean> => {
  await makeFolder(dirname(to));
  const stood = await lstat(to).catch(() => undefined);
  if (stood?.isDirectory()) {
    await rmdir(to).catch((error: unknown) => {
      throw new TreeRefused(
        `${folderStepWords.destinationTaken(to)} (${errnoCode(error) ?? String(error)})`
      );
    });
  }
  const failed = renameExclusive(from, to);
  switch (failed) {
    case undefined:
      return true;
    case "EXDEV":
      if (stood?.isDirectory()) {
        await makeFolder(to);
      }
      return false;
    case "EEXIST":
    case "ENOTEMPTY":
      throw new TreeRefused(folderStepWords.destinationTaken(to));
    case "EINVAL":
    case "ENOSYS":
    case "ENOTSUP":
      if (await lstat(to).catch(() => undefined)) {
        throw new TreeRefused(folderStepWords.destinationTaken(to));
      }
      try {
        await rename(from, to);
        return true;
      } catch (error) {
        if (errnoCode(error) === "EXDEV") {
          return false;
        }
        throw error;
      }
    default:
      throw new Error(`Renaming ${from} to ${to} failed (${failed}).`);
  }
};

/** A repository's linked worktrees pointed at it again, as git's own fix for a main worktree moved by hand. */
const repairWorktrees = async (dir: string): Promise<void> => {
  const linked = await readdir(join(dir, ".git", "worktrees")).catch(() => []);
  if (linked.length === 0) {
    return;
  }
  const ran = await runCaptured(["git", "-C", dir, "worktree", "repair"], {
    env: { ...process.env, ...GIT_LOCALE },
  });
  if (ran.code !== 0) {
    console.warn(
      `[folder-move] git worktree repair in ${dir} failed: ${ran.stderr.trim()}`
    );
  }
};

/**
 * One disk: the folder renamed to the destination. Its identity is kept
 * first, so a rename run again after a restart that finds the folder gone
 * and its identity at the destination answers it done.
 */
export const folderMoveRename = async (
  ask: FolderMoveRenameAsk
): Promise<FolderMoveRenamed> => {
  const source = normalize(ask.source);
  const destination = normalize(ask.destination);
  const now = await identityAt(source);
  const kept = await keptIdentity(ask.jobId, "source");
  if (!now) {
    if (kept && sameIdentity(kept, await identityAt(destination))) {
      return { renamed: true };
    }
    throw new TreeRefused(`${source} isn't there, so nothing was moved.`);
  }
  await keepIdentity(ask.jobId, "source", now);
  if (!(await renameOnto(source, destination))) {
    await forgetJob(ask.jobId);
    return { renamed: false };
  }
  console.info(
    `[folder-move] ${ask.jobId}: ${source} renamed to ${destination}`
  );
  await repairWorktrees(destination);
  if (ask.made) {
    await moveMade(source, destination);
  }
  await forgetJob(ask.jobId);
  return { renamed: true };
};

// ── The copy ───────────────────────────────────────────────────────────────

/** What a read of a process's entry in `/proc` meets when it is gone, or another user's. */
const GONE_OR_THEIRS = new Set(["ENOENT", "ESRCH", "EACCES", "EPERM"]);

/** `read()`, or `otherwise` when what it reads is gone or another user's; any other failure stands. */
const readOr = <T>(look: () => T, otherwise: T): T => {
  try {
    return look();
  } catch (error) {
    if (GONE_OR_THEIRS.has(errnoCode(error) ?? "")) {
      return otherwise;
    }
    throw error;
  }
};

/** Whether process `pid` works in `root`: its folder or an open file is there. */
const worksIn = (pid: string, root: string): boolean => {
  const inside = (link: string): boolean =>
    readOr(() => within(readlinkSync(link), root), false);
  return (
    inside(`/proc/${pid}/cwd`) ||
    readOr(() => readdirSync(`/proc/${pid}/fd`), []).some((fd) =>
      inside(`/proc/${pid}/fd/${fd}`)
    )
  );
};

/** Programs other than this agent with their folder or an open file under `root`, by name and pid (Linux). */
const programsIn = (root: string): string[] => {
  if (process.platform !== "linux") {
    return [];
  }
  const own = String(process.pid);
  return readdirSync("/proc")
    .filter((pid) => PID.test(pid) && pid !== own && worksIn(pid, root))
    .map((pid) =>
      readOr(
        () => `${readFileSync(`/proc/${pid}/comm`, "utf8").trim()} (${pid})`,
        pid
      )
    );
};

/** The staging folder beside `destination`, the job's own. */
const stagingOf = (destination: string, jobId: string): string =>
  join(dirname(destination), folderMoveStaging(jobId));

/** A block's words on this machine, for a copy's stage line. */
const blockSaid =
  (folder: string, destination: string) =>
  (block: FolderMoveBlock): string => {
    const words = blockWords(block, {
      folder,
      destination,
      machine: "this computer",
    });
    return `${words.why} ${words.todo}`;
  };

/** One entry of the list, as it is kept on disk. */
const listLine = (entry: TreeEntry): string => `${JSON.stringify(entry)}\n`;

/** The sending side: the folder listed (the list kept here), then streamed. */
const sendSide = async (
  jobId: string,
  source: string,
  destination: string,
  signal: AbortSignal
): Promise<ReadableStream<Uint8Array>> => {
  const busy = programsIn(source);
  if (busy.length > 0) {
    throw new TreeRefused(folderStepWords.programs(busy));
  }
  await makeFolder(jobDir(jobId));
  await writeStateFile(listFile(jobId), "");
  const mounts = new Set((await mountTable()).map((one) => one.at));
  return sendTree([{ from: source, name: "" }], {
    recheck: true,
    mounts,
    signal,
    blocked: blockSaid(source, destination),
    listed: (entry) => appendFile(listFile(jobId), listLine(entry)),
  });
};

/** The taking side: the staging folder made new, the stream written into it and proven. */
const takeSide = async (
  jobId: string,
  destination: string,
  stream: ReadableStream<Uint8Array>,
  progress: (frame: FolderMoveProgressFrame) => void,
  signal: AbortSignal
): Promise<FolderMoveCopied> => {
  const staging = stagingOf(destination, jobId);
  await removeTree(staging);
  await makeFolder(dirname(destination));
  await makeFolder(staging, { exclusive: true, mode: 0o700 });
  try {
    const taken = await takeTree(
      stream,
      staging,
      (now: TreeProgress) =>
        progress({ kind: "folder_move_progress", jobId, ...now }),
      signal
    );
    return {
      files: taken.files,
      bytes: taken.bytes,
      dirs: taken.dirs,
      links: taken.links,
      head: taken.git?.head ?? null,
    };
  } catch (error) {
    // A partial copy is CawCo's own, and goes on any failure: the folder is untouched.
    await removeTree(staging);
    throw error;
  }
};

/**
 * The copy, or one side of it: on one machine both sides here, the stream
 * passed within this process; across machines the folder's machine sends
 * (`relay.side` `send`) and the destination's takes (`take`), the hub
 * relaying the stream between them and keeping none of it.
 */
export const folderMoveCopy = async (
  ask: FolderMoveCopyAsk,
  progress: (frame: FolderMoveProgressFrame) => void
): Promise<FolderMoveCopied> => {
  running.get(ask.jobId)?.abort();
  const stop = new AbortController();
  running.set(ask.jobId, stop);
  const source = ask.source ? normalize(ask.source) : undefined;
  const destination = ask.destination ? normalize(ask.destination) : undefined;
  try {
    if (!ask.relay) {
      if (!(source && destination)) {
        throw new Error(
          "A copy on one machine names its folder and its destination."
        );
      }
      const stream = await sendSide(
        ask.jobId,
        source,
        destination,
        stop.signal
      );
      return await takeSide(
        ask.jobId,
        destination,
        stream,
        progress,
        stop.signal
      );
    }
    if (ask.relay.side === "send") {
      if (!source) {
        throw new Error("The sending side of a copy names its folder.");
      }
      const stream = await sendSide(ask.jobId, source, "", stop.signal);
      await relayStream(ask.relay.token, stream, stop.signal);
      return { files: 0, bytes: 0, dirs: 0, links: 0, head: null };
    }
    if (!destination) {
      throw new Error("The taking side of a copy names its destination.");
    }
    const taken = await relayTaken(ask.relay.token, stop.signal);
    return await takeSide(ask.jobId, destination, taken, progress, stop.signal);
  } finally {
    if (running.get(ask.jobId) === stop) {
      running.delete(ask.jobId);
    }
  }
};

/**
 * The checked copy renamed to the destination, whole or not at all. Its
 * identity is kept first, so a step run again after a restart that finds
 * the copy gone and its identity at the destination answers it done.
 */
export const folderMovePlace = async (
  ask: FolderMovePlaceAsk
): Promise<{ placed: true }> => {
  const destination = normalize(ask.destination);
  const staging = stagingOf(destination, ask.jobId);
  const now = await identityAt(staging);
  if (!now) {
    if (
      sameIdentity(
        await keptIdentity(ask.jobId, "staging"),
        await identityAt(destination)
      )
    ) {
      return { placed: true };
    }
    throw new TreeRefused(folderStepWords.stagingGone(destination));
  }
  await keepIdentity(ask.jobId, "staging", now);
  if (!(await renameOnto(staging, destination))) {
    throw new Error(`${staging} and ${destination} are on two disks.`);
  }
  await repairWorktrees(destination);
  if (ask.made) {
    await recordMade(destination);
  }
  console.info(
    `[folder-move] ${ask.jobId}: the checked copy is at ${destination}`
  );
  return { placed: true };
};

// ── The removal ────────────────────────────────────────────────────────────

/** The list the copy kept, in its order: parents before their children. */
const readList = async (jobId: string): Promise<TreeEntry[] | undefined> => {
  const text = await readFile(listFile(jobId), "utf8").catch(() => undefined);
  return text
    ?.split("\n")
    .filter(Boolean)
    .map((line) => TreeEntrySchema.parse(JSON.parse(line)));
};

/** One listed entry of the old folder removed, or why it stays. */
const removeEntry = async (
  path: string,
  entry: TreeEntry
): Promise<FolderMoveLeft | "removed" | "gone" | "kept"> => {
  const now = await lstat(path).catch(() => undefined);
  if (!now) {
    return "gone";
  }
  if (entry.kind === "other") {
    return { path, why: "uncopied" };
  }
  if (entry.kind === "dir") {
    if (!now.isDirectory()) {
      return { path, why: "changed" };
    }
    return await rmdir(path).then(
      () => "removed" as const,
      (error: unknown) =>
        // A folder that keeps an entry stays; the entry is named.
        errnoCode(error) === "ENOTEMPTY" || errnoCode(error) === "EEXIST"
          ? ("kept" as const)
          : { path, why: "busy" as const, words: errnoCode(error) }
    );
  }
  const same =
    (entry.kind === "file" &&
      now.isFile() &&
      now.size === entry.size &&
      now.mtimeMs === entry.mtimeMs) ||
    (entry.kind === "link" && now.isSymbolicLink());
  if (!same) {
    return { path, why: "changed" };
  }
  return await unlink(path).then(
    () => "removed" as const,
    (error: unknown) => ({
      path,
      why: "busy" as const,
      words: errnoCode(error),
    })
  );
};

/** What stands in the old folder that the list never named: added after the copy, so it stays. */
const addedSince = async (
  source: string,
  listed: ReadonlySet<string>,
  left: readonly FolderMoveLeft[]
): Promise<FolderMoveLeft[]> => {
  const added: FolderMoveLeft[] = [];
  for await (const entry of walkTree({ from: source, name: "" }, noneFound())) {
    const path = join(source, ...entry.path.split("/"));
    if (!(
      listed.has(entry.path) || left.some((one) => within(path, one.path))
    )) {
      added.push({ path, why: "changed" });
    }
  }
  return added;
};

/**
 * The old folder removed by the copy's list, children before their
 * parents: a file or link only while it is as it was listed, a folder only
 * once it is empty. What stays is answered, by path and why: changed since
 * the copy, refused by the disk, or never copied (a socket, a pipe), and
 * anything added after the list. With the conversations carried to
 * another machine, their copies here go too. The list stays while anything
 * listed is left, for a removal run again.
 */
export const folderMoveRemove = async (
  ask: FolderMoveRemoveAsk,
  progress: (frame: FolderMoveProgressFrame) => void
): Promise<FolderMoveRemoved> => {
  const source = normalize(ask.source);
  const list = await readList(ask.jobId);
  if (!list) {
    if (!(await lstat(source).catch(() => undefined))) {
      // Removed by an earlier run of this step, whose answer was lost.
      return { left: [], removed: 0 };
    }
    throw new TreeRefused(folderStepWords.noList);
  }
  const left: FolderMoveLeft[] = [];
  let removed = 0;
  let saidAt = 0;
  for (const entry of [...list].reverse()) {
    if (Date.now() - saidAt > SAY_EVERY_MS) {
      saidAt = Date.now();
      progress({
        kind: "folder_move_progress",
        jobId: ask.jobId,
        phase: "remove",
        files: removed,
        filesTotal: list.length,
        bytes: 0,
        bytesTotal: 0,
      });
    }
    const outcome = await removeEntry(
      join(source, ...entry.path.split("/")),
      entry
    );
    if (outcome === "removed") {
      removed += 1;
    } else if (typeof outcome === "object") {
      left.push(outcome);
    }
  }
  if (await lstat(source).catch(() => undefined)) {
    left.push(
      ...(await addedSince(
        source,
        new Set(list.map((entry) => entry.path)),
        left
      ))
    );
    if (
      await rmdir(source).then(
        () => true,
        () => false
      )
    ) {
      removed += 1;
    }
  }
  if (ask.made) {
    await forgetMade(source);
  }
  if (ask.sessions.length > 0) {
    await dropCarried(ask.sessions);
  }
  if (left.length === 0) {
    await forgetJob(ask.jobId);
  }
  console.info(
    `[folder-move] ${ask.jobId}: ${source} removed by its list, ${removed} entries; ${left.length} left`
  );
  return { left, removed };
};

/**
 * A move called off or failed past saving: its copy running here stopped,
 * its partial copy beside the destination removed (CawCo's own, named for
 * the job), and its record here dropped. The folder is never touched.
 */
export const folderMoveDrop = async (
  ask: FolderMoveDropAsk
): Promise<{ dropped: boolean }> => {
  running.get(ask.jobId)?.abort();
  if (ask.destination) {
    await removeTree(stagingOf(normalize(ask.destination), ask.jobId));
  }
  await forgetJob(ask.jobId);
  return { dropped: true };
};
