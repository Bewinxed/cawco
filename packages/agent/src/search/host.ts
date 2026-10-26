/**
 * The agent's search process: the transcript search index, its SQLite file
 * and every read of OpenCode's databases it takes documents from, in a
 * process of its own, which the agent (search/process.ts) asks over IPC and
 * kills when a question passes its limit or its asker lets it go.
 *
 * A process, not a thread: a query inside `sqlite3_step()` stops for
 * nothing a JavaScript thread can send it. bun:sqlite has no
 * `Database.interrupt()` (oven-sh/bun#31014, its PR #31078 still open), and
 * a Worker's `terminate()` waits for the thread to come back to JavaScript:
 * a recursive CTE went on burning 2,011 ms of CPU in the 2 s after
 * `terminate()`, and the worker never closed (bun 1.4.4, 2026-10-25). A
 * process's SIGKILL ends it wherever it is. The index is a rollback-journal
 * database at `synchronous = FULL` (jsonl-parser fts5.ts `#open`), so a
 * write cut short there leaves a hot journal, which the next process to open
 * it rolls back.
 *
 * It opens the index as it starts and says `ready`; it beats every
 * {@link BEAT_MS} while its thread is free, which is how the agent bounds a
 * sync's steps; it ends when the agent's channel closes.
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
/** How often the process says it is there while its thread is free, ms. */
const BEAT_MS = 1000;

/** How an op says how far it has come, before it answers. */
type Tell = (value: unknown) => void;

/** Everything the agent asks of the index, by name: each op takes one argument, and answers once. */
const searchOps = (
  index: TranscriptIndex,
  watermarks: Map<string, number>
) => ({
  /**
   * One sync: every OpenCode database's messages since its watermark and
   * every Claude transcript's new lines, committed as fts5.ts `sync` commits
   * them, the watermarks written only when they moved. `tell` hears how far
   * a long catch-up has come.
   */
  sync: async (startedAt: number, tell: Tell): Promise<void> => {
    const docs: TranscriptDoc[] = [];
    const meta: Record<string, string> = {};
    const moved = new Map<string, number>();
    for (const dbPath of opencodeDatabases()) {
      const key = `${WATERMARK}${dbPath}`;
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
    await index.sync(
      claudeFiles.map((f) => f.path),
      {
        docs,
        meta,
        ended: { [INDEXED_THROUGH]: String(startedAt) },
        progress: tell,
      }
    );
    for (const [key, watermark] of moved) {
      watermarks.set(key, watermark);
    }
  },
  /** A deleted transcript's documents forgotten; how many. */
  forget: (sessionId: string) =>
    Promise.resolve(index.forgetSession(sessionId)),
  turns: (options: TurnsOptions) => Promise.resolve(index.turns(options)),
  listed: (options: ListOptions) => Promise.resolve(index.listed(options)),
  search: (args: { query: string; options: SearchOptions }) =>
    Promise.resolve(index.search(args.query, args.options)),
});

export type SearchOps = ReturnType<typeof searchOps>;
export type SearchOp = keyof SearchOps;
export type SearchArg<K extends SearchOp> = Parameters<SearchOps[K]>[0];
export type SearchAnswer<K extends SearchOp> = Awaited<
  ReturnType<SearchOps[K]>
>;

/** What the agent sends: one op and its argument, under an id its answer carries. */
export interface SearchAsk {
  arg: unknown;
  id: number;
  op: SearchOp;
}

/** What the process sends: it opened (or why not), it is there, how far an op has come, its answer, or why it failed. */
export type SearchSaid =
  | { kind: "ready"; through: number }
  | { kind: "unopened"; message: string }
  | { kind: "beat" }
  | { id: number; kind: "told"; value: unknown }
  | { id: number; kind: "answer"; value: unknown }
  | { code?: string; id: number; kind: "failed"; message: string };

const say = (said: SearchSaid): void => {
  process.send?.(said);
};

const failure = (error: unknown): { code?: string; message: string } => {
  const { code } = error as { code?: unknown };
  return {
    message: error instanceof Error ? error.message : String(error),
    ...(typeof code === "string" ? { code } : {}),
  };
};

/** The index opened, every watermark it keeps read, and each ask answered as it comes. */
const serve = async (): Promise<void> => {
  const path = transcriptIndexPath();
  await mkdir(dirname(path), { recursive: true });
  const index = new TranscriptIndex(path);
  const watermarks = new Map<string, number>();
  const rows = index.db
    .query("SELECT key, value FROM meta WHERE key LIKE ?")
    .all(`${WATERMARK}%`) as { key: string; value: string }[];
  for (const row of rows) {
    watermarks.set(row.key, Number(row.value));
  }
  const ops = searchOps(index, watermarks);
  process.on("message", async (ask: SearchAsk) => {
    const run = ops[ask.op] as (arg: unknown, tell: Tell) => Promise<unknown>;
    try {
      const value = await run(ask.arg, (told) =>
        say({ id: ask.id, kind: "told", value: told })
      );
      say({ id: ask.id, kind: "answer", value });
    } catch (error) {
      say({ id: ask.id, kind: "failed", ...failure(error) });
    }
  });
  say({ kind: "ready", through: Number(index.meta(INDEXED_THROUGH) ?? 0) });
};

// The agent's channel closed (it ended, or let this process go): nothing is
// left to answer.
process.on("disconnect", () => process.exit(0));
setInterval(() => say({ kind: "beat" }), BEAT_MS);
serve().catch((error: unknown) => {
  say({ kind: "unopened", ...failure(error) });
  // Ended once the line has gone out; the agent fails what waits with it.
  setTimeout(() => process.exit(1), BEAT_MS);
});
