/**
 * The agent's search processes: the transcript search index, its SQLite
 * file and every read of OpenCode's databases it takes documents from, in
 * processes of their own, which the agent (search/process.ts) asks over IPC.
 * Each runs in one of two roles, its last argument:
 *
 * - `write`: the index's one writer. It syncs the index and forgets what a
 *   purge deleted; it is never stopped for a search, so a sync runs to its
 *   end whoever lets a search go. It opens the index first, bringing its
 *   layout up to date.
 * - `read`: answers searches, listings and a conversation's turns from the
 *   index opened read-only, beside the writer: what it holds as of the
 *   writer's last commit. The agent kills it (SIGKILL) when a question
 *   passes its limit or its asker lets it go, and starts another.
 *
 * Processes, not threads: a query inside `sqlite3_step()` stops for
 * nothing a JavaScript thread can send it. bun:sqlite has no
 * `Database.interrupt()` (oven-sh/bun#31014, its PR #31078 still open), and
 * a Worker's `terminate()` waits for the thread to come back to JavaScript:
 * a recursive CTE went on burning 2,011 ms of CPU in the 2 s after
 * `terminate()`, and the worker never closed (bun 1.4.4, 2026-10-25). A
 * process's SIGKILL ends it wherever it is. The index is a WAL database
 * (jsonl-parser fts5.ts `#open`): a reader reads the last commit beside the
 * writer and writes nothing, and a write cut short (the writer killed for
 * its silence) never committed, so no reader sees it.
 *
 * Each opens the index as it starts and says `ready`; each beats every
 * {@link BEAT_MS} while its thread is free, which is how the agent bounds a
 * sync's steps; each ends when the agent's channel closes.
 *
 * Each OpenCode database's watermark (its newest `time_updated` indexed) is
 * kept in the index's `meta`, under {@link WATERMARK} and its path, and
 * in the writer, written only by a sync that committed.
 */
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { transcriptIndexPath } from "@cawco/core/paths/cawco";
import { listClaudeFiles, listPiFiles } from "@cawco/core/paths/claude";
import { opencodeDatabases } from "@cawco/core/paths/harnesses";
import type { TranscriptDoc, TranscriptFile } from "@cawco/jsonl-parser";
import {
  type ListOptions,
  type PlacesOptions,
  type SearchOptions,
  TranscriptIndex,
  type TurnsOptions,
} from "@cawco/jsonl-parser/fts5";
import { readOpenCodeDocs } from "../harnesses/opencode-docs";

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

/** What the writer is asked, by name: each op takes one argument, and answers once. */
const writeOps = (index: TranscriptIndex, watermarks: Map<string, number>) => ({
  /**
   * One sync: every OpenCode database's messages since its watermark and
   * every Claude and pi transcript's new lines, committed as fts5.ts `sync`
   * commits them, the watermarks written only when they moved. `tell` hears
   * how far a long catch-up has come.
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
    const files: TranscriptFile[] = [
      ...(await listClaudeFiles()).map(({ path }) => ({
        harness: "claude-code" as const,
        path,
      })),
      ...(await listPiFiles()).map((path) => ({
        harness: "pi" as const,
        path,
      })),
    ];
    await index.sync(files, {
      docs,
      meta,
      ended: { [INDEXED_THROUGH]: String(startedAt) },
      progress: tell,
    });
    for (const [key, watermark] of moved) {
      watermarks.set(key, watermark);
    }
  },
  /** A deleted transcript's documents forgotten; how many. */
  forget: (sessionId: string) =>
    Promise.resolve(index.forgetSession(sessionId)),
});

/** What the reader is asked, by name: each op takes one argument, and answers once. */
const readOps = (index: TranscriptIndex) => ({
  turns: (options: TurnsOptions) => Promise.resolve(index.turns(options)),
  places: (options: PlacesOptions) => Promise.resolve(index.places(options)),
  listed: (options: ListOptions) => Promise.resolve(index.listed(options)),
  search: (args: { query: string; options: SearchOptions }) =>
    Promise.resolve(index.search(args.query, args.options)),
});

/** A search process's role: the index's one writer, or a reader beside it. */
export type SearchRole = "read" | "write";

type WriteOps = ReturnType<typeof writeOps>;
type ReadOps = ReturnType<typeof readOps>;
export type SearchOps = WriteOps & ReadOps;
/** What each role is asked. */
export type RoleOp<R extends SearchRole> = R extends "write"
  ? keyof WriteOps
  : keyof ReadOps;
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
  const code =
    error instanceof Error && "code" in error ? error.code : undefined;
  return {
    message: error instanceof Error ? error.message : String(error),
    ...(typeof code === "string" ? { code } : {}),
  };
};

/** This process's role, its last argument (search/process.ts `HOST`). */
const role = process.argv.at(-1);

/** The index opened for `role`, and each ask answered as it comes. */
const serve = async (): Promise<void> => {
  if (role !== "read" && role !== "write") {
    throw new Error(
      `a search process is started as read or write, not ${role}`
    );
  }
  const path = transcriptIndexPath();
  let ops: Record<string, (arg: never, tell: Tell) => Promise<unknown>>;
  let index: TranscriptIndex;
  if (role === "write") {
    await mkdir(dirname(path), { recursive: true });
    index = new TranscriptIndex(path);
    const watermarks = new Map<string, number>();
    const rows = index.db
      .query<{ key: string; value: string }, [string]>(
        "SELECT key, value FROM meta WHERE key LIKE ?"
      )
      .all(`${WATERMARK}%`);
    for (const row of rows) {
      watermarks.set(row.key, Number(row.value));
    }
    ops = writeOps(index, watermarks);
  } else {
    index = new TranscriptIndex(path, { readonly: true });
    ops = readOps(index);
  }
  process.on("message", async (ask: SearchAsk) => {
    const run = ops[ask.op] as
      ((arg: unknown, tell: Tell) => Promise<unknown>) | undefined;
    try {
      if (!run) {
        throw new Error(`the ${role} search process is not asked ${ask.op}`);
      }
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
