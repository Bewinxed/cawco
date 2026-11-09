import type { PublicInstanceRow } from "./db/instances";

/**
 * A session's row's times as the API answers them: the ISO strings they are
 * sent as, typed so, where the database reads them as dates. Spread over
 * the row it answers (`{ ...row, ...instanceTimes(row) }`). Its times that
 * may be null stay typed as dates: the shipped app's openapi.json declares
 * them optional date-times, and a nullable string is what the wire check
 * (scripts/wire-compat.ts) refuses against it.
 */
export const instanceTimes = (
  row: Pick<PublicInstanceRow, "createdAt" | "updatedAt">
) => ({
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});
