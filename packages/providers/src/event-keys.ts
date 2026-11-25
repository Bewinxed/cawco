/**
 * An item's events' natural keys (provider spec §2.5 "Keys"), said once for
 * every provider: a poll, a webhook and a write (each provider's
 * `writes.ts`, which names the events its write itself caused) all make
 * them here, so a write's key and the key its event comes back under are
 * one string.
 */

/** What an event's key names its item by: its kind and its key on the service (`12`, `ENG-123`). */
type Keyed = "issue" | "pr";

export const eventKeys = {
  opened: (kind: Keyed, key: string): string => `${kind}:${key}:opened`,
  /** A close, at its time on the service, ms: a second close lands. */
  closed: (kind: Keyed, key: string, at: number): string =>
    `${kind}:${key}:closed@${at}`,
  /** A reopen, at the version the item was read at. */
  reopened: (kind: Keyed, key: string, version: string): string =>
    `${kind}:${key}:reopened@${version}`,
  labeled: (kind: Keyed, key: string, label: string): string =>
    `${kind}:${key}:labeled:${label}`,
};
