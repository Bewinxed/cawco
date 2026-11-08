import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";

/** A transaction on the hub's connection, as `db.transaction` hands it. */
export type Tx = Parameters<Parameters<BunSQLiteDatabase["transaction"]>[0]>[0];
