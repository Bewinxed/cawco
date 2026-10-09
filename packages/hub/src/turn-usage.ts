import {
  type ClaudeModelUsage,
  costForTurn,
  type NeutralResultMessage,
} from "@cawco/core";
import type { TurnUsageRow } from "./db/turn-usage";

const FIELDS = [
  "inputTokens",
  "outputTokens",
  "cacheReadInputTokens",
  "cacheCreationInputTokens",
  "costUSD",
] as const;

/** A result's `modelUsage`, every field a number. */
const cumulative = (
  raw: Record<string, Partial<ClaudeModelUsage>>
): Record<string, ClaudeModelUsage> =>
  Object.fromEntries(
    Object.entries(raw).map(([model, usage]) => [
      model,
      Object.fromEntries(
        FIELDS.map((field) => [field, usage[field] ?? 0])
      ) as unknown as ClaudeModelUsage,
    ])
  );

/** Whether `now` could follow `seen` in one conversation: no count went down. */
const follows = (
  seen: Record<string, ClaudeModelUsage>,
  now: Record<string, ClaudeModelUsage>
): boolean =>
  Object.entries(seen).every(([model, before]) => {
    const after = now[model];
    return (
      after !== undefined &&
      FIELDS.every((field) => after[field] >= before[field])
    );
  });

export interface TurnUsage {
  rows: TurnUsageRow[];
  /** Claude: the cumulative this result leaves as the session's next baseline. */
  seen?: Record<string, ClaudeModelUsage>;
}

interface Session {
  accountId: string | null;
  id: string;
  modelUsageSeen: Record<string, ClaudeModelUsage> | null;
}

/**
 * What a completed turn spent, by model.
 *
 * Claude: the change in the result's cumulative `modelUsage` since the
 * session's last result. Claude Code reports a compaction's spend nowhere
 * else (its `usage` is all zeros, `num_turns` 0), and a turn's subagents
 * spend under their own models. With no baseline yet (a resumed start this
 * hub saw no result of), or one the result does not follow (a different
 * conversation's cost-state), the result only sets the baseline.
 *
 * OpenCode and pi: the per-model sums their result frame carries
 * ({@link NeutralResultMessage.turnUsage}), priced at list rates.
 */
export const turnUsageOf = (
  session: Session,
  result: NeutralResultMessage & { uuid: string },
  keepAlive: boolean,
  at: number
): TurnUsage => {
  const row = (
    model: string,
    tokens: Omit<
      TurnUsageRow,
      "accountId" | "at" | "instanceId" | "keepAlive" | "model" | "resultId"
    >
  ): TurnUsageRow => ({
    instanceId: session.id,
    resultId: result.uuid,
    model,
    accountId: session.accountId,
    keepAlive,
    at: new Date(at),
    ...tokens,
  });
  const { modelUsage } = result as NeutralResultMessage & {
    modelUsage?: Record<string, Partial<ClaudeModelUsage>>;
  };
  if (modelUsage) {
    const now = cumulative(modelUsage);
    const seen = session.modelUsageSeen;
    if (!(seen && follows(seen, now))) {
      return { rows: [], seen: now };
    }
    const rows = Object.entries(now).flatMap(([model, after]) => {
      const before = seen[model];
      const spent = (field: (typeof FIELDS)[number]) =>
        after[field] - (before?.[field] ?? 0);
      const tokens = {
        inputTokens: spent("inputTokens"),
        outputTokens: spent("outputTokens"),
        cacheReadTokens: spent("cacheReadInputTokens"),
        cacheWriteTokens: spent("cacheCreationInputTokens"),
        cacheWrite1hTokens: null,
        costUsd: spent("costUSD"),
      };
      return tokens.inputTokens +
        tokens.outputTokens +
        tokens.cacheReadTokens +
        tokens.cacheWriteTokens >
        0
        ? [row(model, tokens)]
        : [];
    });
    return { rows, seen: now };
  }
  return {
    rows: (result.turnUsage ?? []).map((usage) =>
      row(usage.model, {
        inputTokens: usage.input,
        outputTokens: usage.output,
        cacheReadTokens: usage.cacheRead,
        cacheWriteTokens: usage.cacheWrite,
        cacheWrite1hTokens: usage.cacheWrite1h ?? null,
        costUsd: costForTurn(usage.model, {
          input: usage.input,
          output: usage.output,
          cacheRead: usage.cacheRead,
          cacheWrite5m: usage.cacheWrite - (usage.cacheWrite1h ?? 0),
          cacheWrite1h: usage.cacheWrite1h ?? 0,
        }),
      })
    ),
  };
};
