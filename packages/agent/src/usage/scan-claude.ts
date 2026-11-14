import { costForUsage } from "@cawco/core/usage/pricing";
import { cacheCreationCount } from "@cawco/core/usage/tokens";
import type { UsageTokens } from "@cawco/core/usage/types";
import { lineRecords } from "@cawco/jsonl-parser";
import { z } from "zod";
import type { ScannedRecord } from "./types";

/**
 * Claude Code transcript scanner (USAGE-SPEC.md §2.3, §5.2). Walks
 * `<config>/projects/**\/*.jsonl`, prefiltering every line for the literal
 * `"usage":{` before any JSON parse — that one `includes` is what keeps an
 * 828 MB corpus scannable in well under a second.
 */

/**
 * A transcript line, as written by Claude Code: its usage nullable where the
 * Messages API's `BetaUsage` is (core usage/types.ts `RawClaudeUsage`).
 */
const TranscriptLine = z.object({
  isSidechain: z.boolean().optional(),
  message: z
    .object({
      id: z.string().optional(),
      model: z.string().optional(),
      usage: z
        .object({
          cache_creation: z
            .object({
              ephemeral_5m_input_tokens: z.number().optional(),
              ephemeral_1h_input_tokens: z.number().optional(),
            })
            .nullable()
            .optional(),
          cache_creation_input_tokens: z.number().nullable().optional(),
          cache_read_input_tokens: z.number().nullable().optional(),
          input_tokens: z.number(),
          output_tokens: z.number(),
          service_tier: z.string().nullable().optional(),
          speed: z.string().nullable().optional(),
        })
        .optional(),
    })
    .optional(),
  requestId: z.string().optional(),
  sessionId: z.string().optional(),
  timestamp: z.string().optional(),
});

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
  const parsed = TranscriptLine.safeParse(raw);
  if (!parsed.success) {
    return null;
  }
  const line = parsed.data;
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
