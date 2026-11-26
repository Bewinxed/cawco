/**
 * The machine's index of its stored transcripts: for each transcript file a
 * listing read, its modification time and size and what the listing read of
 * it (core `NeutralSessionInfo`: its session id, folder, harness, who
 * started it, its title's sources, its dates). A listing stats every file
 * and reads again only a file whose mtime or size moved since the index
 * took it; every other one answers from the index. The index is kept in
 * the agent's data dir (core `catalogIndexPath`), written a minute after a
 * change ({@link SAVE_AFTER_MS}), so a restart reads again only what moved
 * in the minute before it.
 *
 * Owner (2026-11-11): "don't u think that the machine's list that is
 * outside of cawco rarely changes? esp old ones?" Before this, every ask of
 * a machine's catalog read the two ends of each of its thousands of
 * transcripts again.
 */
import { type Dirent, type FSWatcher, watch } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { isGone } from "@cawco/core/absent";
import { detach } from "@cawco/core/detach";
import { catalogIndexPath } from "@cawco/core/paths/cawco";
import type { NeutralSessionInfo } from "@cawco/core/session-messages";
import { readRecord, writeStateFile } from "@cawco/core/state-file";
import { NeutralSessionInfoSchema } from "@cawco/core/stored-shapes";
import { Effect, type Fiber } from "effect";
import { z } from "zod";

/** One file as the index holds it: what it was when read, and what was read of it (null: nothing to list). */
interface Indexed {
  /** The harness whose listing took it: a listing drops only its own files gone. */
  harness: string;
  info: NeutralSessionInfo | null;
  mtimeMs: number;
  size: number;
}

const IndexShape = z.record(
  z.string(),
  z.object({
    harness: z.string(),
    info: NeutralSessionInfoSchema.nullable(),
    mtimeMs: z.number(),
    size: z.number(),
  })
);

/**
 * How many transcripts a listing reads at once. Each read holds a
 * transcript's two 64 KiB ends as bytes, as text and as parsed lines; read
 * all at once, one listing of 1,500 transcripts took the agent to 977 MB RSS,
 * and it kept 932 MB after (measured on a rig at obelisk's scale).
 */
const LISTING_READS = 8;

/**
 * How many transcripts {@link storedTranscripts} stats at once, on the
 * stores thread. A stat holds nothing past its answer, so the reads' memory
 * bound ({@link LISTING_READS}) is not its: at that width, obelisk's 4,083
 * transcripts took about 510 rounds to stat (2026-11-19). Ours.
 */
const LISTING_STATS = 64;

/** `read` over every item, at most `width` ({@link LISTING_READS}) at a time; results in order. */
export const listingRead = async <T, R>(
  items: readonly T[],
  read: (item: T) => Promise<R>,
  width = LISTING_READS
): Promise<R[]> => {
  const results = new Array<R>(items.length);
  let next = 0;
  const reader = async (): Promise<void> => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await read(items[index]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(width, items.length) }, reader)
  );
  return results;
};

/** The index as kept, by file path; read from disk once per agent run. */
let held: Promise<Map<string, Indexed>> | undefined;

const loadIndex = (): Promise<Map<string, Indexed>> => {
  held ??= readRecord(catalogIndexPath(), IndexShape)
    .then((kept) => new Map(Object.entries(kept ?? {})))
    .catch((error: unknown) => {
      // A damaged index is read again from the transcripts, and rewritten.
      console.warn(`[catalog] the index could not be read: ${error}`);
      return new Map<string, Indexed>();
    });
  return held;
};

/**
 * How long a change to the index waits before the index is written, with
 * every change made meanwhile. Ours: the index only spares reads, and a
 * change lost with the process is a file read again by the next listing, by
 * its mtime and size. Written at each change, the whole index (every
 * transcript of the machine: 4,083 on obelisk) was serialised and flushed
 * every few seconds while any session wrote its transcript
 * ({@link readMoved}).
 */
const SAVE_AFTER_MS = 60_000;

/** The index's next write, while one waits. */
let saving: Fiber.Fiber<void> | undefined;

/** Writes `index` as it stands {@link SAVE_AFTER_MS} on, once for every change until then. */
const saveIndex = (index: Map<string, Indexed>): void => {
  if (saving) {
    return;
  }
  saving = Effect.runFork(
    Effect.sleep(SAVE_AFTER_MS).pipe(
      Effect.andThen(
        Effect.tryPromise({
          try: () =>
            writeStateFile(
              catalogIndexPath(),
              JSON.stringify(Object.fromEntries(index))
            ),
          catch: (error) => error,
        })
      ),
      Effect.catch((error) =>
        Effect.sync(() =>
          console.warn(`[catalog] the index could not be kept: ${error}`)
        )
      ),
      Effect.ensuring(
        Effect.sync(() => {
          saving = undefined;
        })
      )
    )
  );
};

/** What one listing found: the sessions, and how many files it read again. */
export interface IndexedListing {
  infos: NeutralSessionInfo[];
  /** The files read because the index had none, or their mtime or size moved. */
  read: number;
}

/** A transcript as {@link storedTranscripts} found it: its file, its session, and its mtime and size then. */
export interface StoredTranscript {
  file: string;
  mtimeMs: number;
  sessionId: string;
  size: number;
}

/** The names of the entries directly inside `dir` that `keep` keeps; none when it does not exist. */
const entriesOf = async (
  dir: string,
  keep: (entry: Dirent) => boolean
): Promise<string[]> => {
  try {
    return (await readdir(dir, { withFileTypes: true }))
      .filter(keep)
      .map((entry) => entry.name);
  } catch (error) {
    if (isGone(error)) {
      return [];
    }
    throw error;
  }
};

/**
 * Every transcript in `roots` (each a harness's folder of per-project
 * transcript folders, a transcript `<session>.jsonl` one folder down), or
 * only in each root's folder `only`, with its mtime and size. Run on the
 * stores thread (stores/ops.ts `catalog.transcripts`): the agent's own
 * profile of a start on obelisk (2026-11-19) had this walk on the loop, its
 * listing of every project folder 3.1 s of the loop's own time and the
 * listing 8.9 s in all.
 */
export async function storedTranscripts(read: {
  only: string | null;
  roots: readonly string[];
}): Promise<StoredTranscript[]> {
  const found: { file: string; sessionId: string }[] = [];
  for (const root of read.roots) {
    const folders = read.only
      ? [read.only]
      : await entriesOf(root, (entry) => entry.isDirectory());
    const named = await listingRead(
      folders,
      (folder) =>
        entriesOf(
          join(root, folder),
          (entry) => entry.isFile() && entry.name.endsWith(".jsonl")
        ).then((names) => names.map((name) => join(root, folder, name))),
      LISTING_STATS
    );
    for (const file of named.flat()) {
      found.push({ file, sessionId: basename(file, ".jsonl") });
    }
  }
  const stats = await listingRead(
    found,
    ({ file }) =>
      stat(file).then(
        (one) => ({ mtimeMs: one.mtimeMs, size: one.size }),
        () => null
      ),
    LISTING_STATS
  );
  return found.flatMap((one, at) => {
    const now = stats[at];
    return now ? [{ ...one, ...now }] : [];
  });
}

/**
 * The sessions in `files` (each a transcript of one `harness`, as
 * {@link storedTranscripts} found it), each read by `read` only when the
 * index has no reading of it at its mtime and size. A file no longer there
 * leaves the index with this listing; the files of another harness keep
 * their place in it.
 */
export async function indexedListing(
  harness: string,
  files: readonly StoredTranscript[],
  read: (item: StoredTranscript) => Promise<NeutralSessionInfo | undefined>
): Promise<IndexedListing> {
  const index = await loadIndex();
  const stale: StoredTranscript[] = [];
  const listed = new Set<string>();
  for (const item of files) {
    listed.add(item.file);
    const kept = index.get(item.file);
    if (!(kept && kept.mtimeMs === item.mtimeMs && kept.size === item.size)) {
      stale.push(item);
    }
  }
  const fresh = await listingRead(stale, async (item) => ({
    file: item.file,
    entry: {
      harness,
      info: (await read(item)) ?? null,
      mtimeMs: item.mtimeMs,
      size: item.size,
    },
  }));
  let moved = fresh.length > 0;
  for (const { file, entry } of fresh) {
    index.set(file, entry);
  }
  for (const [file, kept] of index) {
    if (kept.harness === harness && !listed.has(file)) {
      index.delete(file);
      moved = true;
    }
  }
  if (moved) {
    saveIndex(index);
  }
  const infos: NeutralSessionInfo[] = [];
  for (const file of listed) {
    const info = index.get(file)?.info;
    if (info) {
      infos.push(info);
    }
  }
  console.info(
    `[catalog] ${harness}: ${listed.size} transcripts listed, ${fresh.length} read again`
  );
  return { infos, read: fresh.length };
}

/** A transcript's file name: its session id, then `.jsonl`, one folder down. */
const TRANSCRIPT_NAME = /^[^/\\]+[/\\]([^/\\]+)\.jsonl$/u;

/** How a watched folder's transcripts are read: the harness whose they are, and the listing's own read of one. */
interface FolderReader {
  harness: string;
  read: (
    file: string,
    sessionId: string
  ) => Promise<NeutralSessionInfo | undefined>;
}

/** A transcript that moved in a watched folder: its file, its session, and how its folder is read. */
export interface MovedTranscript {
  file: string;
  reader: FolderReader;
  sessionId: string;
}

/** A watched harness folder: its own watch, and on Linux one per project folder in it ({@link WATCH_PER_FOLDER}), by name. */
interface WatchedDir {
  folders: Map<string, FSWatcher>;
  root: FSWatcher;
}

/** The folders watched for transcripts moving, by path. */
const watched = new Map<string, WatchedDir>();
/** Who hears of a transcript moving: the session supervisor's report to the hub. */
const listeners = new Set<(moved: MovedTranscript) => void>();

/** `listener` hears each transcript that moved in a watched folder. */
export function onCatalogMoved(
  listener: (moved: MovedTranscript) => void
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Whether a harness folder is watched one project folder at a time rather
 * than by one recursive watch. On Linux, Bun's recursive watch walks the
 * whole tree on the loop as it starts and adds an inotify watch per folder
 * (oven-sh/bun `path_watcher.zig` `walk_and_add`, no thread): every
 * session's own folders and their `subagents` and `tool-results`, none of
 * which holds a transcript the listing reads. It was 5,355 ms of the loop at
 * obelisk's start (the agent's profile, 2026-11-19). A watch of one folder
 * is one `inotify_add_watch` (about 18 µs, measured). On macOS a watch is a
 * path in the process's one FSEventStream, recursive by nature with no
 * walk, and the stream is built anew on each watch added or closed
 * (transcript-tail.ts): there the one recursive watch stays.
 */
const WATCH_PER_FOLDER = process.platform === "linux";

/** How many project folders are watched before the loop takes its next turn. Ours. */
const FOLDER_WATCHES_AT_ONCE = 64;

/** A transcript at `name` (from `dir`) moved: told to every listener when it is one. */
const told = (dir: string, name: string, reader: FolderReader): void => {
  const sessionId = TRANSCRIPT_NAME.exec(name)?.[1];
  if (!sessionId) {
    return;
  }
  const moved = { file: join(dir, name), reader, sessionId };
  for (const listener of listeners) {
    listener(moved);
  }
};

/** Watches project folder `folder` of `dir` for its transcripts moving; false when it is already watched or cannot be. */
const watchFolder = (
  dir: string,
  folder: string,
  reader: FolderReader,
  folders: Map<string, FSWatcher>
): boolean => {
  if (folders.has(folder)) {
    return false;
  }
  let one: FSWatcher;
  try {
    one = watch(join(dir, folder), (_event, name) => {
      if (name) {
        told(dir, `${folder}/${name}`, reader);
      }
    });
  } catch {
    // Gone since it was named: the root's watch hears it again if it comes back.
    return false;
  }
  one.on("error", () => {
    one.close();
    folders.delete(folder);
  });
  one.unref();
  folders.set(folder, one);
  return true;
};

/**
 * Project folder `folder` of `dir` was made, renamed or removed: watched
 * when it is there, with each transcript it already holds told, since they
 * were written before its watch began; its watch closed when it is gone.
 */
const folderMoved = async (
  dir: string,
  folder: string,
  reader: FolderReader,
  folders: Map<string, FSWatcher>
): Promise<void> => {
  const path = join(dir, folder);
  const isFolder = await stat(path).then(
    (one) => one.isDirectory(),
    () => false
  );
  if (!isFolder) {
    folders.get(folder)?.close();
    folders.delete(folder);
    return;
  }
  if (!watchFolder(dir, folder, reader, folders)) {
    return;
  }
  const names = await entriesOf(
    path,
    (entry) => entry.isFile() && entry.name.endsWith(".jsonl")
  );
  for (const name of names) {
    told(dir, `${folder}/${name}`, reader);
  }
};

/** Watches every project folder of `dir`, {@link FOLDER_WATCHES_AT_ONCE} before each turn of the loop. */
const watchFolders = async (
  dir: string,
  reader: FolderReader,
  folders: Map<string, FSWatcher>
): Promise<void> => {
  const names = await entriesOf(dir, (entry) => entry.isDirectory());
  for (let at = 0; at < names.length; at += FOLDER_WATCHES_AT_ONCE) {
    for (const folder of names.slice(at, at + FOLDER_WATCHES_AT_ONCE)) {
      watchFolder(dir, folder, reader, folders);
    }
    // A turn of the event loop (the scheduler's setImmediate) between batches.
    await Effect.runPromise(Effect.yieldNow);
  }
};

/**
 * Watches `dir` (a harness's folder of per-project transcript folders) for
 * a transcript written, added or removed, once per folder for the agent's
 * life: so a session run outside CawCo is told to the hub as it moves,
 * never found only by the next full ask. A folder not there yet is watched
 * by a later listing that finds it. `reader` reads a moved transcript as
 * the listing does ({@link readMoved}). On Linux the root's own watch hears
 * project folders come and go, and each project folder has a watch of its
 * own ({@link WATCH_PER_FOLDER}).
 */
export function watchCatalogDir(dir: string, reader: FolderReader): void {
  if (watched.has(dir)) {
    return;
  }
  const folders = new Map<string, FSWatcher>();
  let root: FSWatcher;
  try {
    root = watch(dir, { recursive: !WATCH_PER_FOLDER }, (_event, name) => {
      if (!name) {
        return;
      }
      if (WATCH_PER_FOLDER) {
        detach(
          folderMoved(dir, name, reader, folders),
          "watch a moved project folder"
        );
        return;
      }
      told(dir, name, reader);
    });
  } catch {
    // Not there yet: a later listing that finds it watches it.
    return;
  }
  root.on("error", (error) => {
    console.warn(`[catalog] stopped watching ${basename(dir)}: ${error}`);
    root.close();
    for (const one of folders.values()) {
      one.close();
    }
    watched.delete(dir);
  });
  root.unref();
  watched.set(dir, { folders, root });
  if (WATCH_PER_FOLDER) {
    detach(watchFolders(dir, reader, folders), "watch the project folders");
  }
}

/** What moved transcripts read as: the sessions to list as they stand now, and the ones to list no more. */
export interface MovedRead {
  infos: NeutralSessionInfo[];
  removed: string[];
}

/**
 * The moved transcripts read now, each as the listing reads it, and kept in
 * the index at its new mtime and size, so the next listing reads none of
 * them again: one gone, or that no longer reads as a session, is to be
 * listed no more. What the hub is told of a move (core `CatalogMovedFrame`),
 * in place of a listing of the whole machine.
 */
export async function readMoved(
  moved: readonly MovedTranscript[]
): Promise<MovedRead> {
  const index = await loadIndex();
  const read = await listingRead(moved, async (one) => {
    const now = await stat(one.file).then(
      (got) => ({ mtimeMs: got.mtimeMs, size: got.size }),
      () => null
    );
    if (!now) {
      index.delete(one.file);
      return { one, info: null };
    }
    const info = (await one.reader.read(one.file, one.sessionId)) ?? null;
    index.set(one.file, { harness: one.reader.harness, info, ...now });
    return { one, info };
  });
  if (read.length > 0) {
    saveIndex(index);
  }
  const infos: NeutralSessionInfo[] = [];
  const removed: string[] = [];
  for (const { one, info } of read) {
    if (info) {
      infos.push(info);
    } else {
      removed.push(one.sessionId);
    }
  }
  return { infos, removed };
}
