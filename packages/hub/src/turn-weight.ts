/**
 * A turn's tokens as one figure, weighted as Claude prices them: what an
 * account's window is spent by, as far as anything says. Read by the usage
 * summary as turns are recorded (db usage-periods.ts) and by a session's
 * burn (rebalance.ts `readProvider`).
 */

/** One turn's tokens, as `turn_usage` keeps them. */
export interface TurnTokens {
  cacheReadTokens: number;
  /** The part of {@link cacheWriteTokens} written for an hour; null when not split. */
  cacheWrite1hTokens: number | null;
  /** Every cache write, whatever its lifetime. */
  cacheWriteTokens: number;
  inputTokens: number;
  outputTokens: number;
}

/**
 * A turn's tokens weighted as Claude prices them against uncached input:
 * 5-minute cache writes 1.25×, 1-hour writes 2×, cache reads 0.1×, output
 * 5× (platform.claude.com/docs/en/build-with-claude/prompt-caching: Opus
 * 5.5 "$4 / MTok | $5 / MTok | $8 / MTok | $0.20 / MTok | $20 / MTok";
 * every current Claude model keeps the same ratios). A write not split by
 * lifetime counts as 5-minute. A subscription's window is spent in
 * proportion to these, as far as anything says.
 */
export const weightedTokens = (turn: TurnTokens): number => {
  const hour = turn.cacheWrite1hTokens ?? 0;
  return (
    turn.inputTokens +
    1.25 * (turn.cacheWriteTokens - hour) +
    2 * hour +
    0.1 * turn.cacheReadTokens +
    5 * turn.outputTokens
  );
};
