import { eq } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import type { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";

/** What holds a singleton table's one row: a table keyed by a fixed `id`. */
type SingletonTable = SQLiteTable & { id: SQLiteColumn };
type Reader = Pick<BunSQLiteDatabase, "select">;

/**
 * The one row of a settings table (schema.ts, a table keyed by a const
 * beside its definition): undefined until it is written.
 */
export const singleton = <Table extends SingletonTable>(
  from: Reader,
  table: Table,
  id: string
): Table["$inferSelect"] | undefined =>
  from.select().from(table).where(eq(table.id, id)).get();

/** One column of a settings table's one row, read alone: the rest of the row stays unread. */
export const singletonColumn = <
  Table extends SingletonTable,
  Column extends SQLiteColumn,
>(
  from: Reader,
  table: Table,
  id: string,
  column: Column
): Column["_"]["data"] | undefined =>
  from.select({ value: column }).from(table).where(eq(table.id, id)).get()
    ?.value;
