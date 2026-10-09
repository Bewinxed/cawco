import { costForTurn, type NeutralResultMessage } from "@cawco/core";
import type { TurnUsageRow } from "./db/turn-usage";

interface ReportedUsage {
  input_tokens?: number;
  output_tokens?: number;
}

interface ModelUsage {
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
  inputTokens?: number;
}

/**
 * The turn's main model: of the models its result names (`modelUsage`, which
 * also lists the subagents' models), the one that read the most prompt.
 */
const mainModel = (models: Record<string, ModelUsage> | undefined) => {
  let best: { model: string; prompt: number } | null = null;
  for (const [model, usage] of Object.entries(models ?? {})) {
    const prompt =
      (usage.inputTokens ?? 0) +
      (usage.cacheReadInputTokens ?? 0) +
      (usage.cacheCreationInputTokens ?? 0);
    if (!best || prompt > best.prompt) {
      best = { model, prompt };
    }
  }
  return best?.model ?? null;
};

/**
 * What a completed turn spent, as its result frame reports it: Claude's result
 * carries the turn's `usage`; a result with none (OpenCode, pi) records nothing.
 */
export const turnUsageOf = (
  session: { accountId: string | null; id: string },
  result: NeutralResultMessage & { uuid: string },
  keepAlive: boolean,
  at: number
): TurnUsageRow | null => {
  const { usage, modelUsage } = result as NeutralResultMessage & {
    modelUsage?: Record<string, ModelUsage>;
    usage?: ReportedUsage;
  };
  if (!usage) {
    return null;
  }
  const tokens = {
    input: usage.input_tokens ?? 0,
    output: usage.output_tokens ?? 0,
    cacheRead: result.cache?.read ?? 0,
    cacheWrite5m: result.cache?.write5m ?? 0,
    cacheWrite1h: result.cache?.write1h ?? 0,
  };
  const model = mainModel(modelUsage);
  return {
    instanceId: session.id,
    resultId: result.uuid,
    accountId: session.accountId,
    model,
    inputTokens: tokens.input,
    cacheReadTokens: tokens.cacheRead,
    cacheWrite5mTokens: tokens.cacheWrite5m,
    cacheWrite1hTokens: tokens.cacheWrite1h,
    outputTokens: tokens.output,
    costUsd: model ? costForTurn(model, tokens) : null,
    keepAlive,
    at: new Date(at),
  };
};
