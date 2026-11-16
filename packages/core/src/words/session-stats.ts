/**
 * What the session card's stats strip says beside and behind its meters
 * (dashboard usage/StatMeter): a meter's figure, and the exact numbers its
 * tooltip gives.
 */

export const sessionStatWords = {
  /** The context in a line of facts: "38% of context". */
  context: (used: number): string => `${Math.round(used)}% of context`,
  /** A meter's figure: the share used, "38%". */
  share: (used: number): string => `${Math.round(used)}%`,
  /** The context meter's tooltip: "76k of 200k tokens", and when it was read while the session isn't running. */
  contextTokens: (used: string, max: string, readAt: string | null): string =>
    `${used} of ${max} tokens${readAt ? ` · read at ${readAt}` : ""}`,
  /**
   * A limit meter's tooltip: when it resets, and while the reading is old,
   * how old: "Resets 15:10 · read 3h 10m ago".
   */
  limitResets: (at: string | null, age: string | null): string =>
    [at ? `Resets ${at}` : null, age ? `read ${age} ago` : null]
      .filter(Boolean)
      .join(" · ") || "No reset reported",
};
