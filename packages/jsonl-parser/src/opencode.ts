/**
 * OpenCode adapter. Subpath export: `@cawco/jsonl-parser/opencode`.
 *
 * OpenCode 2.0 keeps sessions in SQLite (`<data>/opencode/opencode.db`, one
 * database per server): `session_message` rows with a JSON `data` column (a
 * user message's `text`; an assistant message's `content` of text,
 * reasoning and tool items) and `session_v2` with each session's directory.
 * No JSONL is involved — this adapter reads the db and emits the same
 * normalized TranscriptDoc shape the Claude Code parser produces, so both
 * harnesses feed one index.
 *
 * Incremental: rows carry `time_updated`, so a high-water mark timestamp
 * plays the role the byte-offset checkpoint plays for JSONL files.
 */

import { Database } from "bun:sqlite";
import type { TranscriptDoc } from "./text.ts";

interface MessageData {
  time?: { created?: number; completed?: number };
  text?: string;
  model?: { id?: string };
  content?: { type?: string; text?: string; name?: string }[];
}

export interface ReadOpenCodeOptions {
  /** Only rows with time_updated strictly greater than this (epoch ms). */
  since?: number;
  /** Include reasoning (default true). */
  reasoning?: boolean;
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

/** A message's words and the tools it called; null for one with neither, or an answer still streaming. */
function wordsOf(
  row: Row,
  message: MessageData,
  reasoning: boolean,
): { text: string; tools: string[] } | null {
  if (row.type === "user") {
    return typeof message.text === "string" && message.text
      ? { text: message.text, tools: [] }
      : null;
  }
  if (message.time?.completed === undefined) {
    return null;
  }
  const texts: string[] = [];
  const tools: string[] = [];
  for (const item of message.content ?? []) {
    if (
      typeof item.text === "string" &&
      (item.type === "text" || (item.type === "reasoning" && reasoning))
    ) {
      texts.push(item.text);
    } else if (item.type === "tool" && typeof item.name === "string") {
      tools.push(item.name);
    }
  }
  return texts.length > 0 || tools.length > 0
    ? { text: texts.join("\n"), tools }
    : null;
}

/**
 * Read user and settled assistant messages from an OpenCode database into
 * normalized transcript documents. An answer still streaming is left for the
 * read after it completes, which updates it. A 1.x database 2.0 has not
 * converted yet (no `session_v2`) holds no 2.0 rows: it is read once it is.
 */
export function readOpenCodeDocs(
  dbPath: string,
  options: ReadOpenCodeOptions = {},
): OpenCodeReadResult {
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
    const rows = db
      .prepare(
        `SELECT m.id, m.session_id, m.type, m.time_created, m.time_updated, m.data, s.directory
         FROM session_message m JOIN session_v2 s ON s.id = m.session_id
         WHERE m.time_updated > ? AND m.type IN ('user', 'assistant') ORDER BY m.id`,
      )
      .all(since) as Row[];
    const docs: TranscriptDoc[] = [];
    let watermark = since;
    for (const row of rows) {
      watermark = Math.max(watermark, row.time_updated);
      let message: MessageData;
      try {
        message = JSON.parse(row.data) as MessageData;
      } catch {
        continue;
      }
      const words = wordsOf(row, message, options.reasoning !== false);
      if (!words) {
        continue;
      }
      docs.push({
        harness: "opencode",
        sessionId: row.session_id,
        id: row.id,
        role: row.type,
        timestamp: new Date(message.time?.created ?? row.time_created).toISOString(),
        text: words.text,
        tools: words.tools.length > 0 ? words.tools.join(" ") : undefined,
        cwd: row.directory,
        model: message.model?.id,
      });
    }
    return { docs, watermark };
  } finally {
    db.close();
  }
}
