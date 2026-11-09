/**
 * Account vocabulary the words and the account types share: an account's
 * colours, how a provider's new sessions choose an account, and how a
 * session's context is made small as it moves. Imports nothing.
 */

/**
 * Every account colour, in the order a new account takes the first one no
 * account wears: seven, so seven accounts (six Claude logins and the opencode
 * Go plan, say) are told apart at a glance.
 */
export const ACCOUNT_HUES = [
  "amber",
  "blue",
  "cyan",
  "green",
  "orange",
  "rose",
  "violet",
] as const;

/** The colour an account is drawn in: the `--account-<name>` token. */
export type AccountHue = (typeof ACCOUNT_HUES)[number];

/** How a provider's new sessions choose among its accounts. */
export type PlacementStrategy =
  "pinned" | "fill-first" | "spread" | "soonest-reset";

export const PLACEMENT_STRATEGIES = [
  "pinned",
  "fill-first",
  "spread",
  "soonest-reset",
] as const satisfies readonly PlacementStrategy[];

/**
 * How a session's context is made small as it moves to another organization,
 * whose cache it can't read: its harness's own `/compact` after a turn that
 * files its open items (`native`), a fresh conversation of the same session
 * opened on a summary {@link Compaction.summarizer} writes (`summary`), or
 * nothing, the conversation moved as it is (`whole`).
 */
export type CompactMethod = "native" | "summary" | "whole";

export const COMPACT_METHODS = [
  "native",
  "summary",
  "whole",
] as const satisfies readonly CompactMethod[];
