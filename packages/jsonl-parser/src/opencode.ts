/**
 * OpenCode adapter. Subpath export: `@cawco/jsonl-parser/opencode`.
 *
 * Modern OpenCode stores sessions in SQLite (~/.local/share/opencode/
 * opencode.db): `message` and `part` tables with JSON `data` columns
 * (MessageV2.Info / MessageV2.Part shapes). No JSONL is involved — this
 * adapter reads the db and emits the same normalized TranscriptDoc shape
 * the Claude Code parser produces, so both harnesses feed one index.
 *
 * Incremental: rows carry `time_updated`, so a high-water mark timestamp
 * plays the role the byte-offset checkpoint plays for JSONL files.
 */

import { Database } from "bun:sqlite";
import type { TranscriptDoc } from "./text.ts";

interface MessageData {
  role?: "user" | "assistant";
  time?: { created?: number };
  modelID?: string;
  providerID?: string;
  path?: { cwd?: string };
  [key: string]: unknown;
}

interface PartData {
  type?: string;
  text?: string;
  tool?: string;
  synthetic?: boolean;
  [key: string]: unknown;
}

export interface ReadOpenCodeOptions {
  /** Only rows with time_updated strictly greater than this (epoch ms). */
  since?: number;
  /** Include reasoning parts (default true). */
  reasoning?: boolean;
}

export interface OpenCodeReadResult {
  docs: TranscriptDoc[];
  /** Pass back as `since` on the next call. */
  watermark: number;
}

/** Default OpenCode database location. */
export function defaultOpenCodePath(): string {
  const home = process.env.HOME ?? "";
  const dataHome = process.env.XDG_DATA_HOME ?? `${home}/.local/share`;
  return `${dataHome}/opencode/opencode.db`;
}

/**
 * Read messages (with their text/reasoning parts) from an OpenCode database
 * into normalized transcript documents.
 */
export function readOpenCodeDocs(
  dbPath: string,
  options: ReadOpenCodeOptions = {},
): OpenCodeReadResult {
  const db = new Database(dbPath, { readonly: true });
  try {
    const since = options.since ?? 0;
    const messages = db
      .prepare(
        `SELECT id, session_id, time_created, time_updated, data
         FROM message WHERE time_updated > ? ORDER BY id`,
      )
      .all(since) as {
      id: string;
      session_id: string;
      time_created: number;
      time_updated: number;
      data: string;
    }[];
    const partsStmt = db.prepare("SELECT data FROM part WHERE message_id = ? ORDER BY id");
    const docs: TranscriptDoc[] = [];
    let watermark = since;
    for (const row of messages) {
      if (row.time_updated > watermark) {
        watermark = row.time_updated;
      }
      let message: MessageData;
      try {
        message = JSON.parse(row.data) as MessageData;
      } catch {
        continue;
      }
      const role = message.role;
      if (role !== "user" && role !== "assistant") {
        continue;
      }
      const parts = partsStmt.all(row.id) as { data: string }[];
      const texts: string[] = [];
      const tools: string[] = [];
      for (const part of parts) {
        let data: PartData;
        try {
          data = JSON.parse(part.data) as PartData;
        } catch {
          continue;
        }
        if (data.type === "text" && typeof data.text === "string" && data.synthetic !== true) {
          texts.push(data.text);
        } else if (
          data.type === "reasoning" &&
          typeof data.text === "string" &&
          options.reasoning !== false
        ) {
          texts.push(data.text);
        } else if (data.type === "tool" && typeof data.tool === "string") {
          tools.push(data.tool);
        }
      }
      if (texts.length === 0 && tools.length === 0) {
        continue;
      }
      docs.push({
        harness: "opencode",
        sessionId: row.session_id,
        id: row.id,
        role,
        timestamp: new Date(message.time?.created ?? row.time_created).toISOString(),
        text: texts.join("\n"),
        tools: tools.length > 0 ? tools.join(" ") : undefined,
        cwd: message.path?.cwd,
        model: message.modelID,
      });
    }
    return { docs, watermark };
  } finally {
    db.close();
  }
}
