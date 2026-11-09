import { sql } from "drizzle-orm";

/** A list of ids, as a statement's `IN (...)` holds them. */
export const idList = (ids: readonly string[]) =>
  sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `
  );
