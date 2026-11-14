/**
 * Each account's window paces as placement and rebalancing read them: made by
 * forecast.ts (`accountPaces`), read by placement.ts's carry test.
 */

/** One window's pace for placement and rebalancing, and what one percent of it costs. */
export interface WindowPace {
  kind: string;
  /** Percent per hour since the window opened; null when not measured or nothing runs there. */
  pace: number | null;
  scopeLabel: string | null;
  /** Weighted tokens (forecast.ts `weightedTokens`) one percent of the window took; null when unmeasured. */
  tokensPerPct: number | null;
}

/** Each account's window paces, by account id. */
export type AccountPaces = ReadonlyMap<string, WindowPace[]>;
