import { Database } from "bun:sqlite";
import { readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import type { RawOpenCodeMessage, UsageTokens } from "@cawco/core";
import { costForUsage, totalTokens } from "@cawco/core";
import { opencodeDataDir } from "@cawco/core/usage/opencode-go";
import type { ScannedRecord } from "./types";

/**
 * opencode scanner (USAGE-SPEC.md §2.3, §5.2). Reads the live SQLite database
 * **read-only** — the running opencode process owns it (573 MB, WAL mode), so
 * this must never write, open read-write, or checkpoint it. The database is
 * in OpenCode's data dir, `$XDG_DATA_HOME/opencode` else
 * `~/.local/share/opencode` ({@link opencodeDataDir}).
 */

/** `opencode.db` else the first `opencode-*.db`; null when neither exists. */
export const openDbPath = async (): Promise<string | null> => {
  const dir = opencodeDataDir();
  const primary = join(dir, "opencode.db");
  if (await Bun.file(primary).exists()) {
    return primary;
  }

  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return null;
  }
  const rotated = entries
    .filter((n) => n.startsWith("opencode-") && n.endsWith(".db"))
    .sort();
  return rotated.length > 0 ? join(dir, rotated[0]) : null;
};

interface MessageRow {
  data: string;
  id: string;
  session_id: string;
  time_created: number;
}

export interface OpencodeScanResult {
  kept: number;
  /** Highest `time_created` seen, for the next incremental watermark. */
  maxTimeCreated: number;
  parsed: number;
  records: ScannedRecord[];
}

const projectOf = (
  data: RawOpenCodeMessage
): { project: string; projectPath: string | null } => {
  const root = data.path?.root ?? null;
  const cwd = data.path?.cwd ?? null;
  const fromRoot = root ? basename(root) : "";
  const project = fromRoot || (cwd ? basename(cwd) : "") || "opencode";
  return { project, projectPath: root };
};

/**
 * Reads every assistant message with `time_created > maxTimeCreated`, in
 * read-only mode. Rows whose `role !== 'assistant'` or whose every token field
 * is zero are skipped. `data.cost` is authoritative; computed pricing is only
 * the fallback when cost is absent/zero and tokens are non-zero.
 */
export const scanOpencode = (
  dbPath: string,
  maxTimeCreated: number
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one pass filtering the four ways a row can be skipped, then shaping the record
): OpencodeScanResult => {
  const db = new Database(dbPath, { readonly: true });
  try {
    const rows = db
      .query<MessageRow, [number]>(
        "SELECT id, session_id, time_created, data FROM message WHERE time_created > ?1"
      )
      .all(maxTimeCreated);

    const records: ScannedRecord[] = [];
    let nextMax = maxTimeCreated;

    for (const row of rows) {
      if (row.time_created > nextMax) {
        nextMax = row.time_created;
      }

      let data: RawOpenCodeMessage;
      try {
        data = JSON.parse(row.data) as RawOpenCodeMessage;
      } catch {
        continue;
      }
      if (data.role !== "assistant") {
        continue;
      }

      const t = data.tokens ?? {};
      const input = t.input ?? 0;
      const output = t.output ?? 0;
      const reasoning = t.reasoning ?? 0;
      const cacheRead = t.cache?.read ?? 0;
      const cacheWrite = t.cache?.write ?? 0;
      if (
        input === 0 &&
        output === 0 &&
        reasoning === 0 &&
        cacheRead === 0 &&
        cacheWrite === 0
      ) {
        continue;
      }

      const model = data.modelID ?? "";
      if (!model) {
        continue;
      }
      const { id, session_id: sessionId } = row;
      if (!(id && sessionId)) {
        continue;
      }

      const provider = data.providerID ?? null;
      const tokens: UsageTokens = {
        input,
        output,
        cacheCreation: cacheWrite,
        cacheRead,
        reasoning,
      };

      let cost =
        typeof data.cost === "number" && !Number.isNaN(data.cost)
          ? data.cost
          : 0;
      if ((data.cost === undefined || cost === 0) && totalTokens(tokens) > 0) {
        cost = costForUsage(provider ? `${provider}/${model}` : model, tokens);
      }

      const { project, projectPath } = projectOf(data);
      records.push({
        harness: "opencode",
        ts: data.time?.created ?? row.time_created,
        sessionId,
        project,
        projectPath,
        model,
        provider,
        tokens,
        costUsd: cost,
        messageId: id,
        requestId: null,
        isSidechain: false,
      });
    }

    return {
      records,
      maxTimeCreated: nextMax,
      parsed: rows.length,
      kept: records.length,
    };
  } finally {
    db.close();
  }
};
