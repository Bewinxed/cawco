import type { RawClaudeUsage, UsageTokens } from "@cawco/core";
import { cacheCreationCount, costForUsage } from "@cawco/core";
import { lineRecords } from "@cawco/jsonl-parser";
import type { ScannedRecord } from "./types";

/**
 * Claude Code transcript scanner (USAGE-SPEC.md §2.3, §5.2). Walks
 * `<config>/projects/**\/*.jsonl`, prefiltering every line for the literal
 * `"usage":{` before any JSON parse — that one `includes` is what keeps an
 * 828 MB corpus scannable in well under a second.
 */

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
  const write1h = message.usage.cache_creation?.ephemeral_1h_input_tokens;
  if (write1h !== undefined) {
    tokens.cacheCreation1h = write1h;
  }

  return {
    harness: "claude",
    ts,
    sessionId,
    project,
    projectPath: null,
    model: message.model,
    provider: null,
    tokens,
    costUsd: costForUsage(message.model, tokens, ts) ?? 0,
    messageId: message.id,
    requestId,
    isSidechain: line.isSidechain === true,
  };
};

/**
 * The usage records one transcript line holds, read by the transcript rule
 * ({@link lineRecords}): a line an unclean stop left NUL bytes in can still
 * carry a whole record after them.
 */
export const parseClaudeLine = (
  line: string,
  project: string
): ScannedRecord[] => {
  if (!line.includes('"usage":{')) {
    return [];
  }
  return lineRecords(line).flatMap((record) => {
    const scanned = parseClaudeRecord(record, project);
    return scanned ? [scanned] : [];
  });
};
