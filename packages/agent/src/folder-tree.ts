/**
 * A folder's bytes from one place to another, proven: the machinery under
 * Move files (folder-move.ts) and the carry of conversations between
 * machines (folder-carry.ts). One walk lists every entry; one stream carries
 * them, each file's SHA-256 taken as it is read; the side that writes them
 * reads every file back and holds the result to the list. The stream is the
 * same bytes whether its two sides are in this process (a copy to another
 * disk here) or on two machines with the hub relaying between them
 * (folder-relay.ts), so a copy on one machine runs the code a copy between
 * two does.
 *
 * Frames: one byte of kind, four of length (big-endian), the payload. The
 * stream opens with its counts (`head`), then each entry (`entry`, JSON),
 * a file's bytes after its entry (`data`) and their hash (`sum`), and closes
 * with what the source said at its end (`end`), or with why it stopped
 * (`fail`). Each JSON payload is parsed by its schema where it arrives.
 */
import { createHash } from "node:crypto";
import { constants as fsConstants, type Stats } from "node:fs";
import {
  access,
  chmod,
  type FileHandle,
  link,
  lstat,
  lutimes,
  open,
  readdir,
  readlink,
  symlink,
  utimes,
} from "node:fs/promises";
import { join, sep } from "node:path";
import { errnoCode } from "@cawco/core/absent";
import { LOOK_MS } from "@cawco/core/effect/poll";
import type { FolderMoveBlock, FolderWalk } from "@cawco/core/folder-move";
import { makeFolder } from "@cawco/core/folders";
import { runCaptured } from "@cawco/core/run-captured";
import { GIT_LOCALE } from "@cawco/core/safe-git";
import { shortSha } from "@cawco/core/short-id";
import { folderStepWords } from "@cawco/core/words/folder-move";
import { Schema } from "effect";
import type { z } from "zod";
import {
  TreeEndSchema,
  TreeEntrySchema,
  TreeFailSchema,
  TreeHeadSchema,
  TreeSumSchema,
} from "./stored-shapes";

/** One entry of a tree, by its path under the tree's top (`/` between names). */
export interface TreeEntry {
  /** `other`: a socket or a pipe, which holds no bytes and is never copied. */
  kind: "dir" | "file" | "link" | "other";
  /** Another entry this file is a hard link of, by its path: one copy, linked again. */
  linkOf?: string;
  mode: number;
  mtimeMs: number;
  path: string;
  /** A file's SHA-256, hex, once it was read. */
  sha256?: string;
  size: number;
  /** A link's target, as it reads. */
  target?: string;
}

/** What a tree's top is: a folder whose entries go (`name` empty), or a file or folder that goes as `name`. */
export interface TreeTop {
  /** Absolute. */
  from: string;
  /** Where it goes under the receiving side's root; empty: `from`'s entries go at the root itself. */
  name: string;
}

/** What git says of a repository at a tree's top, as both sides must agree on it. */
export interface GitFacts {
  head: string | null;
  /** Every ref and what it points at. */
  refs: string;
  stashes: number;
  /** `git status --porcelain`, the work not committed. */
  status: string;
}

/** A stream's opening frame: what it carries. */
export interface TreeHead {
  bytes: number;
  entries: number;
  files: number;
}

/** A file's hash, after its bytes. */
export interface TreeSum {
  sha256: string;
}

/** Why the sending side stopped, in its words. */
export interface TreeFail {
  words: string;
}

/** What a stream's source said at its end. */
export interface TreeEnd {
  bytes: number;
  /** Entries that changed in the source while it was copied, by path: the copy fails on them. */
  changed: string[];
  dirs: number;
  files: number;
  /** A repository's state at the top, for the receiving side to match; null when none. */
  git: GitFacts | null;
  links: number;
}

/** How far a side is: files and bytes so far, of all. */
export interface TreeProgress {
  bytes: number;
  bytesTotal: number;
  files: number;
  filesTotal: number;
  phase: "copy" | "check";
}

/** The kinds of frame, by their first byte. */
const FRAME = {
  head: 1,
  entry: 2,
  data: 3,
  sum: 4,
  end: 5,
  fail: 6,
} as const;
type FrameKind = (typeof FRAME)[keyof typeof FRAME];

/** The most one data frame holds. */
const CHUNK = 1024 * 1024;
const HEADER = 5;
/** A mode's permission bits, set-id and sticky bits with them: below the file type's. */
const MODE_BITS = 0o1_0000;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const frameOf = (kind: FrameKind, payload: Uint8Array): Uint8Array => {
  const out = new Uint8Array(HEADER + payload.byteLength);
  out[0] = kind;
  new DataView(out.buffer).setUint32(1, payload.byteLength);
  out.set(payload, HEADER);
  return out;
};

const jsonFrame = (kind: FrameKind, value: unknown): Uint8Array =>
  frameOf(kind, encoder.encode(JSON.stringify(value)));

/** A frame's JSON payload, as its schema reads it. */
const parsed = <S extends z.ZodType>(
  schema: S,
  payload: Uint8Array
): z.output<S> => schema.parse(JSON.parse(decoder.decode(payload)));

/** A failure the copy names in words a stage line can quote. */
export class TreeRefused extends Schema.TaggedError<TreeRefused>()(
  "TreeRefused",
  { message: Schema.String }
) {
  constructor(words: string) {
    super({ message: words });
  }
}

const refuse = (words: string): never => {
  throw new TreeRefused(words);
};

/** An entry's path under its top as the stream names it: `/` between names. */
const joined = (top: string, name: string): string =>
  top ? `${top}/${name}` : name;

/** An entry's place on disk under `root`. */
const onDisk = (root: string, path: string): string =>
  path ? join(root, ...path.split("/")) : root;

// ── Reading a tree ─────────────────────────────────────────────────────────

/** What one walk found besides its entries. */
export interface WalkFound {
  /** Device files, which hold no bytes to copy. */
  devices: string[];
  /** Links whose target is under the walked folder's own absolute path. */
  inward: number;
  /** Folders on another device, or mount points: named, never entered. */
  mounts: string[];
  /** Names that differ from another only by case. */
  namesByCase: string[];
  unreadable: string[];
  walk: FolderWalk;
}

/** A walk's tally, empty. */
export const noneFound = (): WalkFound => ({
  devices: [],
  inward: 0,
  mounts: [],
  namesByCase: [],
  unreadable: [],
  walk: { files: 0, bytes: 0, dirs: 0, links: 0, whole: true },
});

const kindOf = (info: Stats): TreeEntry["kind"] | "device" => {
  if (info.isDirectory()) {
    return "dir";
  }
  if (info.isFile()) {
    return "file";
  }
  if (info.isSymbolicLink()) {
    return "link";
  }
  return info.isBlockDevice() || info.isCharacterDevice() ? "device" : "other";
};

const entryOf = (
  path: string,
  info: Stats,
  kind: TreeEntry["kind"],
  target?: string
): TreeEntry => ({
  path,
  kind,
  mode: info.mode % MODE_BITS,
  mtimeMs: info.mtimeMs,
  size: kind === "file" ? info.size : 0,
  ...(target === undefined ? {} : { target }),
});

/** A file, link or other entry as a walk lists it; a device is named and not listed. */
const readEntry = async (
  abs: string,
  path: string,
  info: Stats,
  found: WalkFound
): Promise<TreeEntry | undefined> => {
  const kind = kindOf(info);
  switch (kind) {
    case "device":
      found.devices.push(abs);
      return;
    case "link":
      found.walk.links += 1;
      return entryOf(path, info, kind, await readlink(abs));
    case "file": {
      found.walk.files += 1;
      found.walk.bytes += info.size;
      const readable = await access(abs, fsConstants.R_OK).then(
        () => true,
        () => false
      );
      if (!readable) {
        found.unreadable.push(abs);
      }
      return entryOf(path, info, kind);
    }
    case "dir":
    case "other":
      return entryOf(path, info, kind);
  }
};

/** A folder a walk is to read: where it is, and its path under the top. */
interface Pending {
  abs: string;
  path: string;
}

/** What a walk holds while it reads: the top's device, its mount points, and the names it saw by case. */
interface Walking {
  device: number;
  found: WalkFound;
  inward: string;
  mounts: ReadonlySet<string>;
  seenByCase: Map<string, string>;
}

/** The names in `dir`, in order; a folder this user may not read is named unreadable and holds none. */
const namesIn = async (dir: Pending, found: WalkFound): Promise<string[]> => {
  try {
    return (await readdir(dir.abs)).sort();
  } catch (error) {
    if (errnoCode(error) === "EACCES" || errnoCode(error) === "EPERM") {
      found.unreadable.push(dir.abs);
      return [];
    }
    throw error;
  }
};

/** One name in a folder a walk reads: its entry, a folder to read next, or nothing (gone, a mount, a device). */
const readChild = async (
  dir: Pending,
  name: string,
  walking: Walking
): Promise<{ entry?: TreeEntry; next?: Pending }> => {
  const abs = join(dir.abs, name);
  const path = joined(dir.path, name);
  const lower = path.toLowerCase();
  const other = walking.seenByCase.get(lower);
  if (other === undefined) {
    walking.seenByCase.set(lower, path);
  } else if (other !== path) {
    walking.found.namesByCase.push(path);
  }
  const info = await lstat(abs).catch((error: unknown) => {
    if (errnoCode(error) === "ENOENT") {
      return;
    }
    throw error;
  });
  if (!info) {
    return {};
  }
  if (info.isDirectory()) {
    if (info.dev !== walking.device || walking.mounts.has(abs)) {
      walking.found.mounts.push(abs);
      return {};
    }
    walking.found.walk.dirs += 1;
    return { entry: entryOf(path, info, "dir"), next: { abs, path } };
  }
  const entry = await readEntry(abs, path, info, walking.found);
  if (entry?.kind === "link" && entry.target?.startsWith(walking.inward)) {
    walking.found.inward += 1;
  }
  return entry ? { entry } : {};
};

/**
 * Every entry under `top`, parents before their children, names in order;
 * `found` gathers what a copy cannot carry and the counts. A folder on
 * another device, or a mount point, is named and not entered. Stops at
 * `until` (ms epoch) when given, its counts then a floor.
 */
export async function* walkTree(
  top: TreeTop,
  found: WalkFound,
  options: { mounts: ReadonlySet<string>; until?: number } = {
    mounts: new Set(),
  }
): AsyncGenerator<TreeEntry> {
  const rootInfo = await lstat(top.from);
  if (!rootInfo.isDirectory()) {
    const entry = await readEntry(top.from, top.name, rootInfo, found);
    if (entry) {
      yield entry;
    }
    return;
  }
  if (top.name) {
    found.walk.dirs += 1;
    yield entryOf(top.name, rootInfo, "dir");
  }
  const walking: Walking = {
    device: rootInfo.dev,
    found,
    inward: `${top.from}${sep}`,
    mounts: options.mounts,
    seenByCase: new Map(),
  };
  const queue: Pending[] = [{ abs: top.from, path: top.name }];
  for (let dir = queue.pop(); dir; dir = queue.pop()) {
    if (options.until !== undefined && Date.now() > options.until) {
      found.walk.whole = false;
      return;
    }
    const children: Pending[] = [];
    for (const name of await namesIn(dir, found)) {
      const { entry, next } = await readChild(dir, name, walking);
      if (entry) {
        yield entry;
      }
      if (next) {
        children.push(next);
      }
    }
    // Depth first, in name order: the last pushed is read next.
    queue.push(...children.reverse());
  }
}

/** What stops a copy of what `found` read, by kind; none when it can go. */
export const copyBlockOf = (found: WalkFound): FolderMoveBlock | undefined => {
  if (found.mounts.length > 0) {
    return { kind: "mounts", paths: found.mounts };
  }
  if (found.devices.length > 0) {
    return { kind: "devices", paths: found.devices };
  }
  return found.unreadable.length > 0
    ? { kind: "unreadable", paths: found.unreadable }
    : undefined;
};

// ── A repository's state, for the second witness ───────────────────────────

const git = async (dir: string, args: string[]): Promise<string | null> => {
  const ran = await runCaptured(
    ["git", "--no-optional-locks", "-C", dir, ...args],
    { env: { ...process.env, ...GIT_LOCALE } }
  ).catch(() => undefined);
  return ran?.code === 0 ? ran.stdout.trim() : null;
};

/** A repository's state at `dir` (its own `.git`), or null when `dir` holds none. */
export const gitFacts = async (dir: string): Promise<GitFacts | null> => {
  const own = await lstat(join(dir, ".git")).catch(() => undefined);
  if (!own) {
    return null;
  }
  const [head, refs, stash, status] = await Promise.all([
    git(dir, ["rev-parse", "--verify", "-q", "HEAD"]),
    git(dir, ["for-each-ref", "--format=%(objectname) %(refname)"]),
    git(dir, ["stash", "list", "--format=%H"]),
    git(dir, ["status", "--porcelain", "--untracked-files=all"]),
  ]);
  if (refs === null || status === null) {
    return null;
  }
  return {
    head,
    refs,
    stashes: stash ? stash.split("\n").filter(Boolean).length : 0,
    status,
  };
};

/** Where two repositories' states differ, in git's terms; none when they agree. */
const gitDiffers = (a: GitFacts, b: GitFacts): string | undefined => {
  if (a.head !== b.head) {
    return `HEAD ${a.head ? shortSha(a.head) : "unborn"} against ${b.head ? shortSha(b.head) : "unborn"}`;
  }
  if (a.refs !== b.refs) {
    return "its branches and tags";
  }
  if (a.stashes !== b.stashes) {
    return `${a.stashes} stashes against ${b.stashes}`;
  }
  return a.status === b.status ? undefined : "its uncommitted work";
};

// ── The sending side ───────────────────────────────────────────────────────

/** What stops a copy before its first byte, by kind: its sender words it ({@link SendOptions.blocked}). */
class TreeBlocked extends Schema.TaggedError<TreeBlocked>()("TreeBlocked", {
  message: Schema.String,
}) {
  readonly block: FolderMoveBlock;
  constructor(block: FolderMoveBlock, words: string) {
    super({ message: words });
    this.block = block;
  }
}

/** What the sending side does beyond streaming its tops. */
export interface SendOptions {
  /** What stops the copy, in the words its stage line says. */
  blocked: (block: FolderMoveBlock) => string;
  /** Each entry as listed, in order: the list a removal goes by. */
  listed?: (entry: TreeEntry) => Promise<void>;
  /** Mount points on this machine: a walk never enters one. */
  mounts: ReadonlySet<string>;
  /** Walk the tops again at the end and name what changed meanwhile. */
  recheck: boolean;
  signal?: AbortSignal;
}

/**
 * The stream of `tops`: every entry listed first, so its counts lead it;
 * then each one, a file's bytes read once and hashed as they go; then, with
 * `recheck`, every top walked again and held to the list. A file whose size
 * or time moved since it was listed is named as changed, as is an entry
 * added or gone. A mount, a device or an unreadable entry stops it before
 * the first byte. A reader that stops early cancels it, and the file it was
 * reading is closed.
 */
export const sendTree = (
  tops: readonly TreeTop[],
  options: SendOptions
): ReadableStream<Uint8Array> => {
  const frames = sendFrames(tops, options);
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await frames.next();
        if (next.done) {
          controller.close();
        } else {
          controller.enqueue(next.value);
        }
      } catch (error) {
        controller.enqueue(
          jsonFrame(FRAME.fail, {
            words: error instanceof Error ? error.message : String(error),
          } satisfies TreeFail)
        );
        controller.close();
        throw error;
      }
    },
    async cancel() {
      await frames.return(undefined);
    },
  });
};

/**
 * Every entry under `tops`, listed: a top named under folders
 * (`<session>/claude/projects/…`) is preceded by those folders, once each,
 * so the taking side writes it into them.
 */
const listTree = async (
  tops: readonly TreeTop[],
  mounts: ReadonlySet<string>,
  listed?: (entry: TreeEntry) => Promise<void>
): Promise<{ entries: TreeEntry[]; found: WalkFound }> => {
  const found = noneFound();
  const entries: TreeEntry[] = [];
  const keep = async (entry: TreeEntry): Promise<void> => {
    entries.push(entry);
    await listed?.(entry);
  };
  const named = new Set<string>();
  for (const top of tops) {
    const parts = top.name.split("/").slice(0, -1);
    for (let at = 1; at <= parts.length; at += 1) {
      const path = parts.slice(0, at).join("/");
      if (!named.has(path)) {
        named.add(path);
        await keep({
          path,
          kind: "dir",
          mode: 0o700,
          mtimeMs: Date.now(),
          size: 0,
        });
      }
    }
    for await (const entry of walkTree(top, found, { mounts })) {
      await keep(entry);
    }
  }
  return { entries, found };
};

async function* sendFrames(
  tops: readonly TreeTop[],
  options: SendOptions
): AsyncGenerator<Uint8Array> {
  const { entries, found } = await listTree(
    tops,
    options.mounts,
    options.listed
  );
  const block = copyBlockOf(found);
  if (block) {
    throw new TreeBlocked(block, options.blocked(block));
  }
  yield jsonFrame(FRAME.head, {
    files: found.walk.files,
    bytes: found.walk.bytes,
    entries: entries.length,
  } satisfies TreeHead);
  const absOf = topsByName(tops);
  const firstOfInode = new Map<string, string>();
  const changed: string[] = [];
  for (const entry of entries) {
    options.signal?.throwIfAborted();
    if (entry.kind === "other") {
      continue;
    }
    if (entry.kind !== "file") {
      yield jsonFrame(FRAME.entry, entry);
      continue;
    }
    const abs = absOf(entry.path);
    const info = await lstat(abs).catch(() => undefined);
    if (
      !info?.isFile() ||
      info.size !== entry.size ||
      info.mtimeMs !== entry.mtimeMs
    ) {
      changed.push(entry.path);
      continue;
    }
    const key = `${info.dev}:${info.ino}`;
    const first = info.nlink > 1 ? firstOfInode.get(key) : undefined;
    if (first !== undefined) {
      yield jsonFrame(FRAME.entry, { ...entry, linkOf: first });
      continue;
    }
    if (info.nlink > 1) {
      firstOfInode.set(key, entry.path);
    }
    yield jsonFrame(FRAME.entry, entry);
    yield* fileFrames(abs, entry, options.blocked);
  }
  if (options.recheck) {
    changed.push(...(await changedSince(tops, entries, options.mounts)));
  }
  const only = tops.length === 1 && tops[0]?.name === "" ? tops[0] : undefined;
  yield jsonFrame(FRAME.end, {
    files: found.walk.files,
    bytes: found.walk.bytes,
    dirs: found.walk.dirs,
    links: found.walk.links,
    changed: [...new Set(changed)],
    git: only ? await gitFacts(only.from) : null,
  } satisfies TreeEnd);
}

/** A file's bytes as data frames, then their hash; one that moved while read stops the copy. */
async function* fileFrames(
  abs: string,
  entry: TreeEntry,
  blocked: SendOptions["blocked"]
): AsyncGenerator<Uint8Array> {
  const hash = createHash("sha256");
  const handle = await open(abs, "r").catch((error: unknown) => {
    const block: FolderMoveBlock = {
      kind: "unreadable",
      paths: [`${abs} (${errnoCode(error) ?? String(error)})`],
    };
    throw new TreeBlocked(block, blocked(block));
  });
  let read = 0;
  try {
    const buffer = new Uint8Array(CHUNK);
    for (;;) {
      const { bytesRead } = await handle.read(buffer, 0, CHUNK, null);
      if (bytesRead === 0) {
        break;
      }
      const chunk = buffer.slice(0, bytesRead);
      hash.update(chunk);
      read += bytesRead;
      yield frameOf(FRAME.data, chunk);
    }
  } finally {
    await handle.close();
  }
  if (read !== entry.size) {
    refuse(folderStepWords.sourceChanged([entry.path]));
  }
  yield jsonFrame(FRAME.sum, { sha256: hash.digest("hex") } satisfies TreeSum);
}

/** Where an entry of the stream is on the sending side's disk. */
const topsByName =
  (tops: readonly TreeTop[]) =>
  (path: string): string => {
    for (const top of tops) {
      if (top.name === "") {
        return onDisk(top.from, path);
      }
      if (path === top.name || path.startsWith(`${top.name}/`)) {
        return onDisk(top.from, path.slice(top.name.length + 1));
      }
    }
    return refuse(`No top holds ${path}.`);
  };

/** Whether an entry as it stands now differs from how it was listed. */
const differsFrom = (was: TreeEntry | undefined, now: TreeEntry): boolean =>
  !was ||
  was.kind !== now.kind ||
  was.target !== now.target ||
  (now.kind === "file" &&
    (was.size !== now.size || was.mtimeMs !== now.mtimeMs));

/** The entries that differ between the list and the tops as they stand now: changed, added or gone. */
const changedSince = async (
  tops: readonly TreeTop[],
  listed: readonly TreeEntry[],
  mounts: ReadonlySet<string>
): Promise<string[]> => {
  const before = new Map(listed.map((entry) => [entry.path, entry]));
  const changed: string[] = [];
  const found = noneFound();
  for (const top of tops) {
    for await (const now of walkTree(top, found, { mounts })) {
      if (differsFrom(before.get(now.path), now)) {
        changed.push(now.path);
      }
      before.delete(now.path);
    }
  }
  changed.push(...before.keys());
  return changed;
};

// ── The receiving side ─────────────────────────────────────────────────────

/** A stream read frame by frame; a reader that stops early cancels it, so its sending side ends. */
async function* framesOf(
  stream: ReadableStream<Uint8Array>
): AsyncGenerator<{ kind: number; payload: Uint8Array }> {
  let held = new Uint8Array(0);
  const reader = stream.getReader();
  try {
    for (;;) {
      while (held.byteLength >= HEADER) {
        const length = new DataView(
          held.buffer,
          held.byteOffset,
          held.byteLength
        ).getUint32(1);
        if (held.byteLength < HEADER + length) {
          break;
        }
        yield {
          kind: held[0] ?? 0,
          payload: held.subarray(HEADER, HEADER + length),
        };
        held = held.subarray(HEADER + length);
      }
      const { done, value } = await reader.read();
      if (done) {
        if (held.byteLength > 0) {
          refuse(folderStepWords.noFrame);
        }
        return;
      }
      const grown = new Uint8Array(held.byteLength + value.byteLength);
      grown.set(held, 0);
      grown.set(value, held.byteLength);
      held = grown;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

/** What a receiving side proved of what it wrote. */
export interface TreeTaken {
  bytes: number;
  dirs: number;
  /** Every entry written, as the stream named it, with its hash. */
  entries: TreeEntry[];
  files: number;
  git: GitFacts | null;
  links: number;
}

/** A file being written: its entry, its open handle, and its bytes' hash so far. */
interface Writing {
  entry: TreeEntry;
  handle: FileHandle;
  hash: ReturnType<typeof createHash>;
  wrote: number;
}

/** The writing of one stream into a root: each entry as it arrives, and how far it is. */
class TreeWriter {
  readonly entries: TreeEntry[] = [];
  end: TreeEnd | undefined;
  readonly #byPath = new Map<string, TreeEntry>();
  readonly #dirs: TreeEntry[] = [];
  readonly #root: string;
  readonly #progress: (now: TreeProgress) => void;
  #writing: Writing | undefined;
  #totals: TreeHead = { files: 0, bytes: 0, entries: 0 };
  #files = 0;
  #bytes = 0;
  #saidAt = 0;

  constructor(root: string, progress: (now: TreeProgress) => void) {
    this.#root = root;
    this.#progress = progress;
  }

  #say(force = false): void {
    if (force || Date.now() - this.#saidAt > LOOK_MS) {
      this.#saidAt = Date.now();
      this.#progress({
        phase: "copy",
        files: this.#files,
        filesTotal: this.#totals.files,
        bytes: this.#bytes,
        bytesTotal: this.#totals.bytes,
      });
    }
  }

  /** One frame written. */
  async frame(kind: number, payload: Uint8Array): Promise<void> {
    switch (kind) {
      case FRAME.head:
        this.#totals = parsed(TreeHeadSchema, payload);
        this.#say(true);
        return;
      case FRAME.entry:
        return await this.#entry(parsed(TreeEntrySchema, payload));
      case FRAME.data:
        return await this.#data(payload);
      case FRAME.sum:
        return await this.#sum(parsed(TreeSumSchema, payload).sha256);
      case FRAME.end:
        this.end = parsed(TreeEndSchema, payload);
        return;
      case FRAME.fail:
        return refuse(parsed(TreeFailSchema, payload).words);
      default:
        return refuse(folderStepWords.noFrame);
    }
  }

  async #entry(entry: TreeEntry): Promise<void> {
    const at = onDisk(this.#root, entry.path);
    this.entries.push(entry);
    this.#byPath.set(entry.path, entry);
    if (entry.kind === "dir") {
      await makeFolder(at, { exclusive: true, mode: 0o700 });
      this.#dirs.push(entry);
      return;
    }
    if (entry.kind === "link") {
      await symlink(entry.target ?? "", at);
      await lutimes(at, entry.mtimeMs / 1000, entry.mtimeMs / 1000).catch(
        () => undefined
      );
      return;
    }
    if (entry.linkOf === undefined) {
      this.#writing = {
        entry,
        handle: await open(at, "wx", 0o600),
        hash: createHash("sha256"),
        wrote: 0,
      };
      return;
    }
    await link(onDisk(this.#root, entry.linkOf), at);
    // One file under two names: read back to the one hash.
    const first = this.#byPath.get(entry.linkOf)?.sha256;
    if (first !== undefined) {
      entry.sha256 = first;
    }
    this.#files += 1;
    this.#bytes += entry.size;
  }

  async #data(payload: Uint8Array): Promise<void> {
    const writing = this.#writing ?? refuse(folderStepWords.noFrame);
    writing.hash.update(payload);
    await writing.handle.write(payload);
    writing.wrote += payload.byteLength;
    this.#bytes += payload.byteLength;
    this.#say();
  }

  async #sum(sha256: string): Promise<void> {
    const done = this.#writing ?? refuse(folderStepWords.noFrame);
    this.#writing = undefined;
    try {
      await done.handle.chmod(done.entry.mode);
    } finally {
      await done.handle.close();
    }
    if (done.hash.digest("hex") !== sha256 || done.wrote !== done.entry.size) {
      refuse(folderStepWords.copyDiffers([done.entry.path]));
    }
    done.entry.sha256 = sha256;
    const at = onDisk(this.#root, done.entry.path);
    await utimes(at, done.entry.mtimeMs / 1000, done.entry.mtimeMs / 1000);
    this.#files += 1;
  }

  /** A file a stop or a failure left open, closed: never left to the collector. */
  async close(): Promise<void> {
    await this.#writing?.handle.close().catch(() => undefined);
    this.#writing = undefined;
  }

  /** Each folder's own mode and time, deepest first, once nothing more is written in it. */
  async settleFolders(): Promise<void> {
    for (const dir of [...this.#dirs].reverse()) {
      const at = onDisk(this.#root, dir.path);
      await utimes(at, dir.mtimeMs / 1000, dir.mtimeMs / 1000);
      await chmod(at, dir.mode);
    }
  }
}

/**
 * Writes `stream` into `root` (a folder that stands, empty), then proves
 * it: every entry there as the stream named it, each file read back to the
 * hash the sending side took, nothing extra, and a repository at its top in
 * the state the source's was. Folders are written open to this user and
 * given their own modes and times last. A stream that names changed entries
 * at its end, or stops, fails it in those words.
 */
export const takeTree = async (
  stream: ReadableStream<Uint8Array>,
  root: string,
  progress: (now: TreeProgress) => void,
  signal?: AbortSignal
): Promise<TreeTaken> => {
  const writer = new TreeWriter(root, progress);
  try {
    for await (const frame of framesOf(stream)) {
      signal?.throwIfAborted();
      await writer.frame(frame.kind, frame.payload);
    }
  } finally {
    await writer.close();
  }
  const end = writer.end ?? refuse(folderStepWords.noFrame);
  if (end.changed.length > 0) {
    refuse(folderStepWords.sourceChanged(end.changed));
  }
  await writer.settleFolders();
  await checkTree(root, writer.entries, progress, signal);
  const taken = await gitFacts(root);
  if (end.git && !taken) {
    refuse(folderStepWords.gitDiffers("no repository in the copy"));
  }
  const differs = end.git && taken ? gitDiffers(end.git, taken) : undefined;
  if (differs) {
    refuse(folderStepWords.gitDiffers(differs));
  }
  return {
    files: end.files,
    bytes: end.bytes,
    dirs: end.dirs,
    links: end.links,
    entries: writer.entries,
    git: taken,
  };
};

/** Whether an entry written differs, by what a walk reads, from how it was sent. */
const writtenDiffers = (was: TreeEntry, now: TreeEntry): boolean =>
  was.kind !== now.kind ||
  was.size !== now.size ||
  was.mode !== now.mode ||
  was.target !== now.target;

/**
 * The second look: `root` walked again and held to `entries`: each there,
 * of its kind, size, mode and target, each file read back to its hash, and
 * nothing that was not sent.
 */
const checkTree = async (
  root: string,
  entries: readonly TreeEntry[],
  progress: (now: TreeProgress) => void,
  signal?: AbortSignal
): Promise<void> => {
  const sent = new Map(entries.map((entry) => [entry.path, entry]));
  const filesTotal = entries.filter((one) => one.kind === "file").length;
  const bytesTotal = entries.reduce(
    (sum, one) => sum + (one.kind === "file" ? one.size : 0),
    0
  );
  const differs: string[] = [];
  const extra: string[] = [];
  let files = 0;
  let bytes = 0;
  let saidAt = 0;
  const say = () =>
    progress({ phase: "check", files, filesTotal, bytes, bytesTotal });
  for await (const now of walkTree({ from: root, name: "" }, noneFound())) {
    signal?.throwIfAborted();
    const was = sent.get(now.path);
    sent.delete(now.path);
    if (!was) {
      extra.push(now.path);
    } else if (writtenDiffers(was, now)) {
      differs.push(now.path);
    } else if (now.kind === "file") {
      if ((await hashOf(onDisk(root, now.path))) !== was.sha256) {
        differs.push(now.path);
      }
      files += 1;
      bytes += now.size;
      if (Date.now() - saidAt > LOOK_MS) {
        saidAt = Date.now();
        say();
      }
    }
  }
  say();
  if (extra.length > 0) {
    refuse(folderStepWords.extra(extra));
  }
  if (differs.length > 0) {
    refuse(folderStepWords.copyDiffers(differs));
  }
  const missing = [...sent.keys()];
  if (missing.length > 0) {
    refuse(folderStepWords.missing(missing));
  }
};

/** A file's SHA-256 as it reads now. */
const hashOf = async (path: string): Promise<string> => {
  const hash = createHash("sha256");
  const handle = await open(path, "r");
  try {
    const buffer = new Uint8Array(CHUNK);
    for (;;) {
      const { bytesRead } = await handle.read(buffer, 0, CHUNK, null);
      if (bytesRead === 0) {
        break;
      }
      hash.update(buffer.subarray(0, bytesRead));
    }
  } finally {
    await handle.close();
  }
  return hash.digest("hex");
};
