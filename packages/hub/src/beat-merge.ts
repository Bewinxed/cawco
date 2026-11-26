/**
 * ONLY A MACHINE'S NEWEST BEAT COUNTS. A beat that waits for its turn
 * (server.ts `admitBeat`, on the hub's admission, scheduler.ts) and is
 * joined by a later one from the same socket is worked once, as this merge
 * of the two: on 2026-11-18 a hub behind its loop worked every late beat as
 * it came, ten beats queued as ten beats' work, and never caught up.
 *
 * What a beat says of now (the sessions it carries, its desktop, its
 * update) is the newer one's. What a beat carries only on some beats (a
 * harness's report, its tools, its accounts, its catalog's dates, custody,
 * damaged records) is kept from the older one where the newer carries none,
 * and merged by its key where both do, the newer winning: each part rides
 * the beat after the daemon reads it (server.ts `heartbeatFromMachine`), so
 * dropping the older beat whole would lose a part no later beat repeats.
 * The session addresses both carry are each recorded, the older first, and
 * the bound readings both carry are added together.
 */
import type { HeartbeatReads } from "@cawco/core/agent-reads";
import { mergeLimitReadings } from "@cawco/core/limit-readings";

/** `newer`'s entries over `older`'s, by `key`, the older's order kept and the newer's new ones after. */
const byKey = <T>(
  older: readonly T[],
  newer: readonly T[],
  key: (one: T) => string
): T[] => {
  const merged = new Map(older.map((one) => [key(one), one]));
  for (const one of newer) {
    merged.set(key(one), one);
  }
  return [...merged.values()];
};

/** `older` and `newer`, two beats of one machine's socket, as the one beat worked in their place. */
export const mergeBeats = (
  older: HeartbeatReads,
  newer: HeartbeatReads
): HeartbeatReads => ({
  ...newer,
  custody: newer.custody ?? older.custody,
  damagedRecords: newer.damagedRecords ?? older.damagedRecords,
  limitReadings: mergeLimitReadings(older.limitReadings, newer.limitReadings),
  harnesses:
    older.harnesses && newer.harnesses
      ? byKey(older.harnesses, newer.harnesses, (one) => one.harness)
      : (newer.harnesses ?? older.harnesses),
  machineCapabilities: newer.machineCapabilities ?? older.machineCapabilities,
  resumableAt:
    older.resumableAt || newer.resumableAt
      ? { ...older.resumableAt, ...newer.resumableAt }
      : undefined,
  sessionAddresses: [...older.sessionAddresses, ...newer.sessionAddresses],
  tools: byKey(older.tools, newer.tools, (one) => one.id),
  codexAccounts: newer.codexAccounts ?? older.codexAccounts,
  homeStores: newer.homeStores ?? older.homeStores,
  providerAccounts: newer.providerAccounts ?? older.providerAccounts,
  providers:
    older.providers || newer.providers
      ? { ...older.providers, ...newer.providers }
      : undefined,
});
