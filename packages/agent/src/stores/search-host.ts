/**
 * The transcript search index, held on the stores' thread (stores/worker.ts):
 * every read and write of its SQLite file, and every read of OpenCode's
 * databases it takes documents from, run here, never on the agent's loop.
 *
 * The index is a rollback-journal database at `synchronous = FULL`
 * (jsonl-parser fts5.ts `#open`): each commit and each merge step syncs the
 * disk, and its `busy_timeout` waits out an outside reader's lock. On the
 * loop each of those waits was the loop's: obelisk's agent was held 1253 ms
 * in one merge step on 2026-10-25 with the host at load 140–194 from
 * delegates' builds. Here they hold this thread alone; the loop's search
 * service (search/index.ts) asks.
 *
 * Each OpenCode database's watermark (its newest `time_updated` indexed) is
 * kept in the index's `meta`, under {@link WATERMARK} and its path, and
 * here, written only by a sync that committed.
 */
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import {
  listClaudeFiles,
  opencodeDatabases,
  transcriptIndexPath,
} from "@cawco/core/paths";
import type { TranscriptDoc } from "@cawco/jsonl-parser";
import {
  type ListOptions,
  type SearchOptions,
  TranscriptIndex,
  type TurnsOptions,
} from "@cawco/jsonl-parser/fts5";
import { readOpenCodeDocs } from "@cawco/jsonl-parser/opencode";

/** The `meta` key prefix of each OpenCode database's watermark, followed by its path. */
const WATERMARK = "opencode_watermark:";
/**
 * The `meta` key of when the index's last finished sync began, ms epoch:
 * written with that sync's commit, so a restart knows the index is whole up
 * to then, not catching up. A sync that wrote nothing writes none (fts5.ts
 * `SyncOptions.ended`), so it may name an older sync than the last.
 */
const INDEXED_THROUGH = "indexed_through";

let index: TranscriptIndex | undefined;
const watermarks = new Map<string, number>();

/** The index, opened on first use, with every watermark it keeps. */
const opened = async (): Promise<TranscriptIndex> => {
  if (index) {
    return index;
  }
  const path = transcriptIndexPath();
  await mkdir(dirname(path), { recursive: true });
  const made = new TranscriptIndex(path);
  const rows = made.db
    .query("SELECT key, value FROM meta WHERE key LIKE ?")
    .all(`${WATERMARK}%`) as { key: string; value: string }[];
  for (const row of rows) {
    watermarks.set(row.key, Number(row.value));
  }
  index = made;
  return made;
};

export const searchHost = {
  /** When the index's last finished sync began (ms epoch), 0 for an index never whole. */
  open: async (): Promise<number> =>
    Number((await opened()).meta(INDEXED_THROUGH) ?? 0),

  /**
   * One sync: every OpenCode database's messages since its watermark and
   * every Claude transcript's new lines, committed as fts5.ts `sync` commits
   * them, the watermarks written only when they moved. `progress` hears how
   * far a long catch-up has come.
   */
  sync: async (
    startedAt: number,
    progress: (through: number) => void
  ): Promise<void> => {
    const held = await opened();
    const docs: TranscriptDoc[] = [];
    const meta: Record<string, string> = {};
    const moved = new Map<string, number>();
    for (const dbPath of opencodeDatabases()) {
      const key = `${WATERMARK}${dbPath}`;
      // biome-ignore lint/performance/noAwaitInLoops: one database at a time, each a rowid range at a time
      const read = await readOpenCodeDocs(dbPath, {
        since: watermarks.get(key) ?? 0,
      });
      for (const doc of read.docs) {
        docs.push(doc);
      }
      meta[key] = String(read.watermark);
      moved.set(key, read.watermark);
    }
    const claudeFiles = await listClaudeFiles();
    await held.sync(
      claudeFiles.map((f) => f.path),
      {
        docs,
        meta,
        ended: { [INDEXED_THROUGH]: String(startedAt) },
        progress,
      }
    );
    for (const [key, watermark] of moved) {
      watermarks.set(key, watermark);
    }
  },

  /** A deleted transcript's documents forgotten; how many. */
  forget: async (sessionId: string): Promise<number> =>
    (await opened()).forgetSession(sessionId),

  turns: async (options: TurnsOptions) => (await opened()).turns(options),

  listed: async (options: ListOptions) => (await opened()).listed(options),

  search: async (query: string, options: SearchOptions) =>
    (await opened()).search(query, options),

  count: async (): Promise<number> => (await opened()).count(),

  close: (): void => {
    index?.close();
    index = undefined;
    watermarks.clear();
  },
};
