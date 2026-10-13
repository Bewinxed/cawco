import { Database } from "bun:sqlite";
import { basename } from "node:path";
import type { UsageTokens } from "@cawco/core";
import { clockFactor, costForUsage, totalTokens } from "@cawco/core";
import type { ScannedRecord } from "./types";

/**
 * opencode scanner (USAGE-SPEC.md §2.3, §5.2). Reads one OpenCode 2.0
 * database **read-only**: a running OpenCode server owns it (WAL mode), so
 * this never writes, opens read-write, or checkpoints it. The machine has one
 * per OpenCode server: the machine's and each account's
 * ({@link opencodeDatabases}).
 *
 * What a request cost is on its message (`session_message.data`): an
 * assistant message's `model`, `cost` and `tokens`, filled when it completes
 * (`time.completed`); a compaction's, once it ended (`completed` or
 * `failed`), its model its own when it names one, else its session's. A 1.x
 * database is converted into these rows the first time 2.0 opens it, every
 * message with its id, times, tokens and cost.
 */

interface MessageRow {
  data: string;
  directory: string;
  id: string;
  session_id: string;
  session_model: string | null;
  time_created: number;
  time_updated: number;
  type: "assistant" | "compaction";
  worktree: string | null;
}

interface ModelRef {
  id?: string;
  providerID?: string;
}

/** The part of a message's `data` the scan reads. */
interface MessageData {
  cost?: number;
  model?: ModelRef;
  status?: string;
  time?: { created?: number; completed?: number };
  tokens?: {
    input?: number;
    output?: number;
    reasoning?: number;
    cache?: { read?: number; write?: number };
  };
}

const parse = <T>(text: string | null): T | undefined => {
  if (!text) {
    return undefined;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
};

/** A message whose cost is final: an answer that completed, a compaction that ended. */
const settled = (row: MessageRow, data: MessageData): boolean =>
  row.type === "assistant"
    ? data.time?.completed !== undefined
    : data.status === "completed" || data.status === "failed";

/** The session's project: its git worktree, else the dir it runs in (OpenCode's global project is `/`). */
const projectOf = (
  row: MessageRow
): { project: string; projectPath: string } => {
  const root =
    row.worktree && row.worktree !== "/" ? row.worktree : row.directory;
  return { project: basename(root) || "opencode", projectPath: root };
};

/** What one settled message spent, as a record; undefined when it spent nothing. */
const recordOf = (
  row: MessageRow,
  data: MessageData
): ScannedRecord | undefined => {
  const t = data.tokens ?? {};
  const tokens: UsageTokens = {
    input: t.input ?? 0,
    output: t.output ?? 0,
    cacheCreation: t.cache?.write ?? 0,
    cacheRead: t.cache?.read ?? 0,
    reasoning: t.reasoning ?? 0,
  };
  const own =
    typeof data.cost === "number" && !Number.isNaN(data.cost) ? data.cost : 0;
  if (totalTokens(tokens) === 0 && own === 0) {
    return undefined;
  }
  const model = data.model ?? parse<ModelRef>(row.session_model);
  if (!model?.id) {
    return undefined;
  }
  const provider = model.providerID ?? null;
  const ts = data.time?.created ?? row.time_created;
  const priced = provider ? `${provider}/${model.id}` : model.id;
  // OpenCode prices a message at its catalog's rates (models.dev's, the
  // off-peak ones for DeepSeek), so the provider's clock is applied to it.
  const costUsd =
    own === 0
      ? costForUsage(priced, tokens, ts)
      : own * clockFactor(priced, ts);
  return {
    harness: "opencode",
    ts,
    sessionId: row.session_id,
    ...projectOf(row),
    model: model.id,
    provider,
    tokens,
    costUsd,
    messageId: row.id,
    requestId: null,
    isSidechain: false,
  };
};

/**
 * Hands `onRecord` every settled assistant message and compaction updated
 * after `since`, a row at a time, and answers the highest `time_updated`
 * seen: the next watermark. A message still streaming is read again once it
 * completes, since completing updates it. A 1.x database 2.0 has not
 * converted yet (no `session_v2`) holds no 2.0 rows: it is read once it is.
 */
export const scanOpencode = (
  dbPath: string,
  since: number,
  onRecord: (record: ScannedRecord) => void
): number => {
  const db = new Database(dbPath, { readonly: true });
  try {
    if (
      !db
        .query(
          "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'session_v2'"
        )
        .get()
    ) {
      return since;
    }
    const rows = db
      .query<MessageRow, [number]>(
        `SELECT m.id, m.session_id, m.type, m.time_created, m.time_updated, m.data,
                s.directory, s.model AS session_model, p.worktree
         FROM session_message m
         JOIN session_v2 s ON s.id = m.session_id
         LEFT JOIN project p ON p.id = s.project_id
         WHERE m.time_updated > ?1 AND m.type IN ('assistant', 'compaction')`
      )
      .iterate(since);
    let next = since;
    for (const row of rows) {
      next = Math.max(next, row.time_updated);
      const data = parse<MessageData>(row.data);
      const record =
        data && settled(row, data) ? recordOf(row, data) : undefined;
      if (record) {
        onRecord(record);
      }
    }
    return next;
  } finally {
    db.close();
  }
};
