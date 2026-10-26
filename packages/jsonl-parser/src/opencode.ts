/**
 * OpenCode adapter. Subpath export: `@cawco/jsonl-parser/opencode`.
 *
 * OpenCode 2.0 keeps sessions in SQLite (`<data>/opencode/opencode.db`, one
 * database per server): `session_message` rows with a JSON `data` column (a
 * user message's `text`; an assistant message's `content` of text,
 * reasoning and tool items, each tool's answer in its `state`) and
 * `session_v2` with each session's directory.
 * No JSONL is involved — this adapter reads the db and emits the same
 * normalized TranscriptDoc shape the Claude Code parser produces, so both
 * harnesses feed one index.
 *
 * Incremental: rows carry `time_updated`, so a high-water mark timestamp
 * plays the role the byte-offset checkpoint plays for JSONL files.
 */

import { Database } from "bun:sqlite";
import { section } from "./section.ts";
import { type DocAuthor, TOOL_OUTPUT_CHARS, type TranscriptDoc, userAuthor } from "./text.ts";

/** What a tool block answered, as 2.0 keeps it: its content's text parts, or its error. */
interface ToolState {
  content?: { type?: string; text?: string }[];
  error?: { message?: string };
  status?: string;
}

interface MessageData {
  time?: { created?: number; completed?: number };
  text?: string;
  model?: { id?: string };
  content?: { type?: string; text?: string; name?: string; state?: ToolState }[];
}

/** A settled tool block's words: its content's text, or its error's message, cut to `cap`. */
function toolOutputOf(state: ToolState | undefined, cap: number): string {
  if (cap <= 0 || !state) {
    return "";
  }
  const words =
    state.status === "error"
      ? (state.error?.message ?? "")
      : (state.content ?? [])
          .flatMap((part) => (part.type === "text" && typeof part.text === "string" ? [part.text] : []))
          .join("\n");
  return words.trim().slice(0, cap);
}

export interface ReadOpenCodeOptions {
  /** Only rows with time_updated strictly greater than this (epoch ms). */
  since?: number;
  /** Include reasoning (default true). */
  reasoning?: boolean;
  /** How much of each tool's answer is kept, characters (default text.ts `TOOL_OUTPUT_CHARS`). */
  toolOutputChars?: number;
}

export interface OpenCodeReadResult {
  docs: TranscriptDoc[];
  /** Pass back as `since` on the next call. */
  watermark: number;
}

interface Row {
  data: string;
  directory: string;
  id: string;
  session_id: string;
  time_created: number;
  time_updated: number;
  type: "user" | "assistant";
}

/** A message's words, its reasoning, the tools it called and what they answered; null for one with none, or an answer still streaming. */
function wordsOf(
  row: Row,
  message: MessageData,
  reasoning: boolean,
  outputCap: number,
): { author: DocAuthor; output: string; text: string; thinking: string; tools: string[] } | null {
  if (row.type === "user") {
    if (typeof message.text !== "string") {
      return null;
    }
    const said = userAuthor(message.text);
    return said?.text ? { ...said, thinking: "", tools: [], output: "" } : null;
  }
  if (message.time?.completed === undefined) {
    return null;
  }
  const texts: string[] = [];
  const thoughts: string[] = [];
  const tools: string[] = [];
  const outputs: string[] = [];
  for (const item of message.content ?? []) {
    if (typeof item.text === "string" && item.type === "text") {
      texts.push(item.text);
    } else if (typeof item.text === "string" && item.type === "reasoning" && reasoning) {
      thoughts.push(item.text);
    } else if (item.type === "tool" && typeof item.name === "string") {
      tools.push(item.name);
      const output = toolOutputOf(item.state, outputCap);
      if (output) {
        outputs.push(output);
      }
    }
  }
  return texts.length > 0 || thoughts.length > 0 || tools.length > 0
    ? {
        author: "agent",
        text: texts.join("\n"),
        thinking: thoughts.join("\n"),
        tools,
        output: outputs.join("\n"),
      }
    : null;
}

/**
 * How many rowids one statement of a scan covers. OpenCode keeps no index on
 * `time_updated`, so a scan for what moved reads every message; one
 * statement over the whole table held its reader's thread as long as the
 * table took to read (an agent's, every sync). Ranges of this many rowids
 * read in a few milliseconds each, and the thread takes a turn between
 * them. Our own call.
 */
const SCAN_RANGE = 2000;

/**
 * Every row `sql` answers over `table`, a rowid range at a time, handed to
 * `each` in rowid order, with a turn of the event loop between ranges. `sql`
 * takes the range as `?1` (exclusive) and `?2` (inclusive) on its own
 * `rowid` term, and `since` as `?3`. The whole scan is one read
 * transaction, so it reads one state of the database however long it takes:
 * a watermark it answers misses nothing written after it.
 */
export async function scanRanges<R>(
  db: Database,
  table: string,
  sql: string,
  since: number,
  each: (row: R) => void,
): Promise<void> {
  db.exec("BEGIN");
  try {
    const top =
      (db.query(`SELECT max(rowid) AS top FROM ${table}`).get() as { top: number | null } | null)
        ?.top ?? 0;
    const read = db.query<R, [number, number, number]>(sql);
    for (let from = 0; from < top; from += SCAN_RANGE) {
      section(`${table} read, a range at a time`, () => {
        for (const row of read.all(from, from + SCAN_RANGE, since)) {
          each(row);
        }
      });
      await new Promise((resolve) => setImmediate(resolve));
    }
  } finally {
    db.exec("COMMIT");
  }
}

/**
 * Every user and assistant message in one OpenCode database updated after
 * `options.since`, as documents, in id order, and the newest `time_updated`
 * seen: the next watermark. Read a rowid range at a time ({@link scanRanges}).
 */
export async function readOpenCodeDocs(
  dbPath: string,
  options: ReadOpenCodeOptions = {},
): Promise<OpenCodeReadResult> {
  const db = new Database(dbPath, { readonly: true });
  try {
    const since = options.since ?? 0;
    if (
      !db
        .query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'session_v2'")
        .get()
    ) {
      return { docs: [], watermark: since };
    }
    const docs: TranscriptDoc[] = [];
    let watermark = since;
    await scanRanges<Row>(
      db,
      "session_message",
      `SELECT m.id, m.session_id, m.type, m.time_created, m.time_updated, m.data, s.directory
       FROM session_message m JOIN session_v2 s ON s.id = m.session_id
       WHERE m.rowid > ?1 AND m.rowid <= ?2
         AND m.time_updated > ?3 AND m.type IN ('user', 'assistant')`,
      since,
      (row) => {
        watermark = Math.max(watermark, row.time_updated);
        let message: MessageData;
        try {
          message = JSON.parse(row.data) as MessageData;
        } catch {
          return;
        }
        const words = wordsOf(
          row,
          message,
          options.reasoning !== false,
          options.toolOutputChars ?? TOOL_OUTPUT_CHARS,
        );
        if (!words) {
          return;
        }
        docs.push({
          harness: "opencode",
          sessionId: row.session_id,
          id: row.id,
          role: row.type,
          author: words.author,
          timestamp: new Date(message.time?.created ?? row.time_created).toISOString(),
          text: words.text,
          ...(words.thinking ? { thinking: words.thinking } : {}),
          tools: words.tools.length > 0 ? words.tools.join(" ") : undefined,
          ...(words.output ? { output: words.output } : {}),
          cwd: row.directory,
          model: message.model?.id,
        });
      },
    );
    docs.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return { docs, watermark };
  } finally {
    db.close();
  }
}
