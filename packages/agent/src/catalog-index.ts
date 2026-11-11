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
import { basename } from "node:path";
import type { NeutralSessionInfo } from "@cawco/core/harness";
import { catalogIndexPath } from "@cawco/core/paths";
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

/** `read` over every item, at most {@link LISTING_READS} at a time; results in order. */
export const listingRead = async <T, R>(
  items: readonly T[],
  read: (item: T) => Promise<R>
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
    Array.from({ length: Math.min(LISTING_READS, items.length) }, reader)
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
  const stats = await listingRead(files, (item) =>
    stat(item.file).then(
      (one) => ({ mtimeMs: one.mtimeMs, size: one.size }),
      () => null
    )
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

/** The folders watched for transcripts moving, by path. */
const watched = new Map<string, FSWatcher>();
/** Who hears of a transcript moving: the session supervisor's report to the hub. */
const listeners = new Set<(sessions: string[]) => void>();

/** `listener` hears the session ids of the transcripts that moved in a watched folder. */
export function onCatalogMoved(
  listener: (sessions: string[]) => void
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Watches `dir` (a harness's folder of per-project transcript folders) for
 * a transcript written, added or removed, once per folder for the agent's
 * life: so a session run outside CawCo is told to the hub as it moves,
 * never found only by the next full ask. A folder not there yet is watched
 * by a later listing that finds it.
 */
export function watchCatalogDir(dir: string): void {
  if (watched.has(dir)) {
    return;
  }
  let watcher: FSWatcher;
  try {
    watcher = watch(dir, { recursive: true }, (_event, name) => {
      const sessionId = name ? TRANSCRIPT_NAME.exec(name)?.[1] : undefined;
      if (!sessionId) {
        return;
      }
      for (const listener of listeners) {
        listener([sessionId]);
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
