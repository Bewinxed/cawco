import type { Dirent } from "node:fs";
import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { RawClaudeUsage, UsageTokens } from "@cawco/core";
import { cacheCreationCount, costForUsage } from "@cawco/core";
import type { ScannedRecord } from "./types";

/**
 * Claude Code transcript scanner (USAGE-SPEC.md §2.3, §5.2). Walks
 * `<config>/projects/**\/*.jsonl`, prefiltering every line for the literal
 * `"usage":{` before any JSON parse — that one `includes` is what keeps an
 * 828 MB corpus scannable in well under a second.
 */

/** `$CLAUDE_CONFIG_DIR` (comma-separated) else `$XDG_CONFIG_HOME/claude` and `~/.claude`. */
export const claudeConfigDirs = (): string[] => {
  const env = process.env.CLAUDE_CONFIG_DIR;
  if (env) {
    return env
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  const dirs: string[] = [];
  const xdg = process.env.XDG_CONFIG_HOME;
  if (xdg) {
    dirs.push(join(xdg, "claude"));
  }
  dirs.push(join(homedir(), ".claude"));
  return dirs;
};

export interface ClaudeFile {
  path: string;
  /** The path component immediately after `projects/`. */
  project: string;
}

/** A transcript line, as written by Claude Code. */
interface TranscriptLine {
  isSidechain?: boolean;
  message?: {
    id?: string;
    model?: string;
    usage?: RawClaudeUsage;
  };
  requestId?: string;
  sessionId?: string;
  timestamp?: string;
  type?: string;
}

async function walk(
  root: string,
  project: string | null,
  out: ClaudeFile[]
): Promise<void> {
  let entries: Dirent[];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return; // a projects dir that vanished mid-walk is not an error
  }
  for (const entry of entries) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) {
      // biome-ignore lint/performance/noAwaitInLoops: recursive walk; siblings push into the same shared `out` array in a stable, reproducible order
      await walk(full, project ?? entry.name, out);
    } else if (entry.name.endsWith(".jsonl")) {
      out.push({ path: full, project: project ?? "unknown" });
    }
  }
}

/** Every `*.jsonl` under each config dir's `projects/`, with its project name. */
export const listClaudeFiles = async (): Promise<ClaudeFile[]> => {
  const files: ClaudeFile[] = [];
  for (const dir of claudeConfigDirs()) {
    // biome-ignore lint/performance/noAwaitInLoops: each config dir walks into the same shared `files` array in a stable, reproducible order
    await walk(join(dir, "projects"), null, files);
  }
  return files;
};

const parseTs = (raw: string | undefined): number => {
  if (!raw) {
    return Number.NaN;
  }
  const ts = Date.parse(raw);
  return ts;
};

/**
 * Parses one transcript line into a {@link ScannedRecord}, or null when it
 * should be skipped: empty sessionId/requestId/message.id/message.model, no
 * `message.usage`, or an unparseable timestamp (USAGE-SPEC.md §5.2).
 */
const parseClaudeRecord = (
  raw: unknown,
  project: string
): ScannedRecord | null => {
  const line = raw as TranscriptLine;
  const { sessionId, requestId, message } = line;
  if (!(sessionId && requestId)) {
    return null;
  }
  if (!(message?.id && message.model)) {
    return null;
  }
  if (!message.usage) {
    return null;
  }

  const ts = parseTs(line.timestamp);
  if (Number.isNaN(ts)) {
    return null;
  }

  const tokens: UsageTokens = {
    input: message.usage.input_tokens,
    output: message.usage.output_tokens,
    cacheCreation: cacheCreationCount(message.usage),
    cacheRead: message.usage.cache_read_input_tokens ?? 0,
    reasoning: 0,
  };

  return {
    harness: "claude",
    ts,
    sessionId,
    project,
    projectPath: null,
    model: message.model,
    provider: null,
    tokens,
    costUsd: costForUsage(message.model, tokens),
    messageId: message.id,
    requestId,
    isSidechain: line.isSidechain === true,
  };
};

/** Parses a chunk of transcript text (lines joined by `\n`) into records. */
export const parseClaudeRecords = (
  text: string,
  project: string
): ScannedRecord[] => {
  const records: ScannedRecord[] = [];
  for (const line of text.split("\n")) {
    if (!line.includes('"usage":{')) {
      continue;
    }
    let obj: unknown;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    const rec = parseClaudeRecord(obj, project);
    if (rec) {
      records.push(rec);
    }
  }
  return records;
};
