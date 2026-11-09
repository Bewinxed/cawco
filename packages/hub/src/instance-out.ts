import type { PublicInstanceRow } from "./db/instances";

/**
 * A session's row's times as the API answers them: the ISO strings they are
 * sent as, typed so, where the database reads them as dates. Spread over
 * the row it answers (`{ ...row, ...instanceTimes(row) }`).
 */
export const instanceTimes = (
  row: Pick<
    PublicInstanceRow,
    | "createdAt"
    | "lastRequestAt"
    | "seenAt"
    | "spawnedAt"
    | "turnEndedAt"
    | "updatedAt"
  >
) => ({
  createdAt: row.createdAt.toISOString(),
  lastRequestAt: row.lastRequestAt?.toISOString() ?? null,
  seenAt: row.seenAt?.toISOString() ?? null,
  spawnedAt: row.spawnedAt?.toISOString() ?? null,
  turnEndedAt: row.turnEndedAt?.toISOString() ?? null,
  updatedAt: row.updatedAt.toISOString(),
});
