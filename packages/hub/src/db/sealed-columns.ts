/**
 * The hub's secret columns (secret-box.ts): sealed on every write, opened on
 * every read, the one path either way, and each saying which of what it
 * holds is secret, so the known values (known-values.ts) list every secret
 * the hub holds and replace it wherever text enters the hub.
 *
 * - {@link sealedText}: the value is one secret, whole.
 * - {@link sealedJson}: the value's JSON, checked against its schema once it
 *   is opened (hub stored-json.ts); its second argument names the leaves
 *   that are secret, so a sealed JSON column that does not say does not
 *   compile.
 *
 * Every write to either tells the known values to read the list again
 * ({@link sealedGeneration}). {@link sealedColumns} finds every such
 * column among the schema's tables, which is how the known values read
 * them: none is listed by hand.
 */
import {
  customType,
  getTableConfig,
  type SQLiteTable,
} from "drizzle-orm/sqlite-core";
import type { z } from "zod";
import { hubSecrets, openOrNull } from "../secret-box";
import { declaredConfigOf, storedJson, storedShapeOf } from "../stored-json";

/** Bumped by every write to a sealed column. */
let generation = 0;

/** A sealed column was written: the known values read their list again before the next replacement. */
const sealedWritten = (): void => {
  generation += 1;
};

/** How many writes the sealed columns have had in this process: the known values read their list again when it moves (known-values.ts). */
export const sealedGeneration = (): number => generation;

/** What a sealed text column says of its value: one secret, whole. */
const SEALED_TEXT = Object.freeze({ secret: "whole" });

const sealedTextType = customType<{
  data: string | null;
  driverData: string;
  config: typeof SEALED_TEXT;
  configRequired: true;
}>({
  dataType: () => "text",
  toDriver: (value) => {
    sealedWritten();
    return hubSecrets().seal(value ?? "");
  },
  fromDriver: (value) => openOrNull(value),
});

/**
 * A secret text column: sealed on every write, opened on every read. A
 * value the hub's key does not open reads as null: no secret, so the
 * feature that holds it asks for it again. Its whole value is a known
 * value (known-values.ts).
 */
export const sealedText = (name: string) => sealedTextType(name, SEALED_TEXT);

/**
 * A secret JSON column: the value's JSON, sealed as {@link sealedText} is,
 * and checked against its schema once it is opened (hub stored-json.ts).
 * `secrets` names the leaves of a value that are secret, each a known value
 * (known-values.ts); a value that does not read as its schema names none.
 */
export const sealedJson = <S extends z.ZodType>(
  schema: S,
  secrets: (value: z.output<S>) => readonly string[]
) =>
  storedJson(schema, {
    close: (json) => {
      sealedWritten();
      return hubSecrets().seal(json);
    },
    open: (raw) => openOrNull(raw),
    secrets: (value) => {
      const read = schema.safeParse(value);
      return read.success ? secrets(read.data) : [];
    },
  });

/** A secret column, by table and column, and the secrets an opened value of it holds. */
export interface SealedColumn {
  readonly column: string;
  /** The secrets `opened` (the column's value, opened) holds: the whole text, or the named leaves of its JSON. */
  readonly secretsOf: (opened: string) => readonly string[];
  readonly table: string;
}

/** `text` read as JSON; null when it is not, which no schema reads. */
const jsonOf = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

/** What a column was declared with, when it is a sealed one ({@link sealedText}, {@link sealedJson}); undefined for any other. */
const secretsOfColumn = (
  column: unknown
): SealedColumn["secretsOf"] | undefined => {
  const seal = storedShapeOf(column)?.seal;
  if (seal) {
    return (opened) => seal.secrets(jsonOf(opened));
  }
  return declaredConfigOf(column) === SEALED_TEXT
    ? (opened) => [opened]
    : undefined;
};

/** Every sealed column among `tables` (forget.ts `schemaTables`). */
export const sealedColumns = (tables: Iterable<SQLiteTable>): SealedColumn[] =>
  [...tables].flatMap((table) => {
    const config = getTableConfig(table);
    return config.columns.flatMap((column) => {
      const secretsOf = secretsOfColumn(column);
      return secretsOf
        ? [{ table: config.name, column: column.name, secretsOf }]
        : [];
    });
  });
