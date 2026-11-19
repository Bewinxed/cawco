/**
 * The machine's index of its stored transcripts: for each transcript file a
 * listing read, its modification time and size and what the listing read of
 * it (core `NeutralSessionInfo`: its session id, folder, harness, who
 * started it, its title's sources, its dates). A listing stats every file
 * and reads again only a file whose mtime or size moved since the index
 * took it; every other one answers from the index. The index is kept in
 * the agent's data dir (core `catalogIndexPath`), so a restart reads
 * nothing it has read before.
 *
 * Owner (2026-11-11): "don't u think that the machine's list that is
 * outside of cawco rarely changes? esp old ones?" Before this, every ask of
 * a machine's catalog read the two ends of each of its thousands of
 * transcripts again.
 */
import { type FSWatcher, watch } from "node:fs";
import { stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { catalogIndexPath } from "@cawco/core/paths/cawco";
import type { NeutralSessionInfo } from "@cawco/core/session-messages";
import { readRecord, writeStateFile } from "@cawco/core/state-file";
import { NeutralSessionInfoSchema } from "@cawco/core/stored-shapes";
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
 * How many transcripts a listing stats at once. A stat holds nothing past
 * its answer, so the reads' memory bound is not its: at
 * {@link LISTING_READS}, obelisk's 4,083 transcripts took about 510 rounds
 * of the agent's loop to stat (2026-11-19), each round behind whatever else
 * the loop had queued (a restart's transcript reads), and the listing ran
 * past its 10 s. Ours.
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

/** The writes of the index, one after another: the last listing's stands. */
let saving: Promise<void> = Promise.resolve();

const saveIndex = (index: Map<string, Indexed>): void => {
  const text = JSON.stringify(Object.fromEntries(index));
  saving = saving
    .then(() => writeStateFile(catalogIndexPath(), text))
    .catch((error: unknown) => {
      console.warn(`[catalog] the index could not be kept: ${error}`);
    });
};

/** What one listing found: the sessions, and how many files it read again. */
export interface IndexedListing {
  infos: NeutralSessionInfo[];
  /** The files read because the index had none, or their mtime or size moved. */
  read: number;
}

/**
 * The sessions in `files` (each a transcript `file` of one `harness`), each
 * read by `read` only when the index has no reading of it at its current
 * mtime and size. A file no longer there leaves the index with this
 * listing; the files of another harness keep their place in it.
 */
export async function indexedListing<T extends { file: string }>(
  harness: string,
  files: readonly T[],
  read: (item: T) => Promise<NeutralSessionInfo | undefined>
): Promise<IndexedListing> {
  const index = await loadIndex();
  const stats = await listingRead(
    files,
    (item) =>
      stat(item.file).then(
        (one) => ({ mtimeMs: one.mtimeMs, size: one.size }),
        () => null
      ),
    LISTING_STATS
  );
  const stale: { item: T; mtimeMs: number; size: number }[] = [];
  const listed = new Set<string>();
  for (const [at, item] of files.entries()) {
    const now = stats[at];
    if (!now) {
      continue;
    }
    listed.add(item.file);
    const kept = index.get(item.file);
    if (!(kept && kept.mtimeMs === now.mtimeMs && kept.size === now.size)) {
      stale.push({ item, ...now });
    }
  }
  const fresh = await listingRead(stale, async ({ item, mtimeMs, size }) => ({
    file: item.file,
    entry: { harness, info: (await read(item)) ?? null, mtimeMs, size },
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

/** The folders watched for transcripts moving, by path. */
const watched = new Map<string, FSWatcher>();
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
 * Watches `dir` (a harness's folder of per-project transcript folders) for
 * a transcript written, added or removed, once per folder for the agent's
 * life: so a session run outside CawCo is told to the hub as it moves,
 * never found only by the next full ask. A folder not there yet is watched
 * by a later listing that finds it. `reader` reads a moved transcript as
 * the listing does ({@link readMoved}).
 */
export function watchCatalogDir(dir: string, reader: FolderReader): void {
  if (watched.has(dir)) {
    return;
  }
  let watcher: FSWatcher;
  try {
    watcher = watch(dir, { recursive: true }, (_event, name) => {
      const sessionId = name ? TRANSCRIPT_NAME.exec(name)?.[1] : undefined;
      if (!(name && sessionId)) {
        return;
      }
      const moved = { file: join(dir, name), reader, sessionId };
      for (const listener of listeners) {
        listener(moved);
      }
    });
  } catch {
    // Not there yet: a later listing that finds it watches it.
    return;
  }
  watcher.on("error", (error) => {
    console.warn(`[catalog] stopped watching ${basename(dir)}: ${error}`);
    watcher.close();
    watched.delete(dir);
  });
  watcher.unref();
  watched.set(dir, watcher);
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
