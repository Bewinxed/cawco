/**
 * What the session card says of its two figures: the conversation's
 * context, on the meter under its head (dashboard usage/ContextMeter), and
 * the account's limit, on its account chip. The exact numbers are each
 * one's tooltip.
 */

export const sessionStatWords = {
  /** The context meter's words: "38% of context". */
  context: (used: number): string => `${Math.round(used)}% of context`,
  /** The context meter's tooltip: "76k of 200k tokens", and when it was read while the session isn't running. */
  contextTokens: (used: string, max: string, readAt: string | null): string =>
    `${used} of ${max} tokens${readAt ? ` · read at ${readAt}` : ""}`,
  /** In the meter's place while the context is being read. */
  contextReading: "Reading context…",
  /** In the meter's place while a running turn holds the session and it can't be asked. */
  contextHeld: "Context can't be read until this turn ends",
  /** In the meter's place when the harness refused the read: its own words. */
  contextRefused: (error: string): string => `Couldn't read context: ${error}`,
  /**
   * The account chip's limit tooltip: when it resets, and while the reading
   * is old, how old: "Resets 15:10 · read 3h 10m ago".
   */
  limitResets: (at: string | null, age: string | null): string =>
    [at ? `Resets ${at}` : null, age ? `read ${age} ago` : null]
      .filter(Boolean)
      .join(" · ") || "No reset reported",
};
