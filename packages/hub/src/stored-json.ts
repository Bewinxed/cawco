/**
 * A JSON column whose shape is checked both ways: on every write and on every
 * read, against the zod schema that is the column's type. The column holds
 * `z.output` of its schema, so there is no second hand-written interface to
 * drift from what the rows hold.
 *
 * Drizzle's `text(name, { mode: "json" }).$type<T>()` is a compile-time label
 * only: its read is `JSON.parse` and nothing else, so a row written before a
 * type changed came back typed as the new shape and failed far from the read
 * ("e.trim is not a function" on every send after a plan-step field was
 * renamed, 2026-10-26). Here the read is Drizzle's own `customType`
 * `fromDriver`, "Transform data returned by driver to desired column's output
 * format" (orm.drizzle.team/docs/custom-types), with the schema's parse in
 * it. drizzle-zod (drizzle-orm/zod) derives schemas from tables for checking
 * a request; for a JSON column it takes the content schema from the caller
 * and runs nothing on a read, so it is not this.
 *
 * A row that fails its schema throws {@link StoredShapeError}, naming its
 * table, column, row and the zod issue. A stored row that fails means a
 * migration is missing: the fix is the migration, never a looser schema.
 */

import { typeAt } from "@cawco/core/stored-types";
import { getTableName, is, type Table } from "drizzle-orm";
import {
  customType,
  getTableConfig,
  SQLiteColumn,
  SQLiteCustomColumn,
  type SQLiteTable,
} from "drizzle-orm/sqlite-core";
import { z } from "zod";

/** Which way a value failed its schema: read back from a row, or on its way into one. */
export type StoredDirection = "read" | "write";

/** A stored JSON value that is not the shape its column's schema says. */
export class StoredShapeError extends Error {
  readonly table: string;
  readonly column: string;
  /** The row's primary key, `/`-joined when it has several; undefined on a write or when no row could be named. */
  readonly row: string | undefined;
  readonly direction: StoredDirection;
  /** What is wrong, as zod says it, or the JSON parser's message. */
  readonly issue: string;
  constructor(
    place: { table: string; column: string; row?: string },
    direction: StoredDirection,
    issue: string,
    options?: { cause?: unknown }
  ) {
    const at = `${place.table}.${place.column}`;
    super(
      direction === "read"
        ? `${at} in row ${place.row ?? "(not found)"} is not its stored shape, so a migration is missing: ${issue}`
        : `${at} was written a value that is not its stored shape: ${issue}`,
      options
    );
    this.name = "StoredShapeError";
    this.table = place.table;
    this.column = place.column;
    this.row = place.row;
    this.direction = direction;
    this.issue = issue;
  }
}

export const isStoredShapeError = (error: unknown): error is StoredShapeError =>
  error instanceof StoredShapeError;

/**
 * Names the row a failing read came from: its primary key, found by the
 * column's raw text. Drizzle hands a column's `fromDriver` the value alone,
 * so the database that holds the row says which it is
 * ({@link nameStoredRowsFrom}).
 */
export type StoredRowNamer = (
  table: SQLiteTable,
  keys: readonly SQLiteColumn[],
  column: SQLiteColumn,
  raw: string
) => string | undefined;

let rowNamer: StoredRowNamer | undefined;

/** The database a failing read names its row from (the hub's, as it opens). */
export const nameStoredRowsFrom = (namer: StoredRowNamer): void => {
  rowNamer = namer;
};

/** A table's primary key columns: a column marked primary, or the table's composite key. */
export const primaryKeyOf = (table: SQLiteTable): SQLiteColumn[] => {
  const config = getTableConfig(table);
  const own = config.columns.filter((column) => column.primary);
  return own.length > 0 ? own : (config.primaryKeys[0]?.columns ?? []);
};

/** Where a column is, by its table's and its own SQL names. */
const placeOf = (column: unknown): { table: string; column: string } =>
  is(column, SQLiteColumn)
    ? { table: getTableName(column.table as Table), column: column.name }
    : { table: "(unknown table)", column: "(unknown column)" };

const issueOf = (error: z.ZodError): string => z.prettifyError(error);

/** Where a key is in a stored value, from its column's root: each key or index on the way, the key itself last. */
type KeyPath = readonly (string | number)[];

/** A JSON object as code builds one: a plain object, not a Date, a Map or a class's. */
const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

/**
 * Each key `value` holds that `parsed`, its schema's output, does not hold
 * at all: a key the schema does not declare, which an object schema drops
 * without a word (zod's object strips the keys it does not name). A key
 * whose value is undefined is none: JSON writes no such key.
 */
const droppedKeys = (
  value: unknown,
  parsed: unknown,
  at: KeyPath = []
): KeyPath[] => {
  if (Array.isArray(value)) {
    return Array.isArray(parsed)
      ? value.flatMap((one, index) =>
          droppedKeys(one, parsed[index], [...at, index])
        )
      : [];
  }
  if (!(isPlainObject(value) && isPlainObject(parsed))) {
    return [];
  }
  return Object.entries(value).flatMap(([key, one]) => {
    if (one === undefined) {
      return [];
    }
    return Object.hasOwn(parsed, key)
      ? droppedKeys(one, parsed[key], [...at, key])
      : [[...at, key]];
  });
};

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/u;

/** A key's path as code reads it: `notice`, `steps[2].input`, `files["a.b"]`. */
const pathText = (path: KeyPath): string =>
  path
    .map((key, at) => {
      if (typeof key === "number") {
        return `[${key}]`;
      }
      if (IDENTIFIER.test(key)) {
        return at === 0 ? key : `.${key}`;
      }
      return `[${JSON.stringify(key)}]`;
    })
    .join("");

/** A key a stored value holds that its type does not declare. */
export interface UndeclaredKey {
  /** Its path from the column's root, as code reads it ({@link pathText}). */
  key: string;
  /** The declared type that reads the object holding it, where it is to be declared: `X (its file)`. */
  type: string;
}

/**
 * The keys `value` holds that `parsed`, `schema`'s output of it, dropped
 * ({@link droppedKeys}), each with the declared type that reads the object
 * holding it (stored-types.ts `typeAt`). What a write is refused for; what
 * an old row holds that its read strips (hub scripts/stored-rows.ts).
 */
export const undeclaredKeys = (
  schema: z.ZodType,
  value: unknown,
  parsed: unknown
): UndeclaredKey[] =>
  droppedKeys(value, parsed).map((path) => {
    const type = typeAt(schema, value, path.slice(0, -1));
    return {
      key: pathText(path),
      type: type ? `${type.type} (${type.declaredIn})` : "the column's type",
    };
  });

/** An array's every index read as one: `steps[3].input` is `steps[].input`. */
const INDEX = /\[\d+\]/gu;

/** What a write holding `undeclared` keys is told: each key, an array's indices as one, and the type to declare it in. */
const undeclaredIssue = (undeclared: readonly UndeclaredKey[]): string => {
  const byType = new Map<string, Set<string>>();
  for (const { key, type } of undeclared) {
    const keys = byType.get(type) ?? new Set<string>();
    keys.add(`\`${key.replace(INDEX, "[]")}\``);
    byType.set(type, keys);
  }
  const held = [...byType]
    .map(
      ([type, keys]) =>
        `${[...keys].join(", ")}, which ${type} does not declare`
    )
    .join("; ");
  const one = [...byType.values()].reduce((n, keys) => n + keys.size, 0) === 1;
  return `it holds ${held}, so the write would drop ${one ? "it" : "them"}. Declare ${one ? "it in its type" : "each in its type"}, then run \`bun run stored-shapes\` in packages/hub.`;
};

/** Each key {@link received} has said it left out, by where from, its type and its path: said once a process. */
const leftOut = new Set<string>();

/**
 * `value`, which another program sent (an agent's frame or answer, a
 * harness's own report carried in one), as `schema`'s type, to be stored:
 * the keys its type declares, each other one left out here and said once
 * in the log, naming `from` and the type to declare it in. A stored write
 * refuses a key its type does not declare ({@link checkStored}): CawCo's
 * own code never builds one. What another program sends may carry one
 * that is no fault of CawCo's, a field Claude Code added (its model list's
 * `supportsThinkingOff`, 2026-11-04), or one an older agent still sends
 * after it left the type, so it is taken into the type where it arrives.
 * A value that is not its type at all comes back as it was, for its write
 * to refuse with the column's name.
 */
export const received = <S extends z.ZodType>(
  schema: S,
  value: unknown,
  from: string
): z.output<S> => {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    return value as z.output<S>;
  }
  for (const { key, type } of undeclaredKeys(schema, value, parsed.data)) {
    const path = key.replace(INDEX, "[]");
    const said = `${from}\n${type}\n${path}`;
    if (!leftOut.has(said)) {
      leftOut.add(said);
      console.log(
        `[stored] ${from} sent \`${path}\`, which ${type} does not declare: left out of what CawCo keeps`
      );
    }
  }
  return parsed.data;
};

/**
 * `value`, parsed by `schema`: the checked value, or {@link StoredShapeError}
 * naming `place`. The one check a stored JSON value passes, by a column
 * ({@link storedJson}). A write is refused a key its schema would
 * drop ({@link droppedKeys}), as it is a value of the wrong shape: on
 * 2026-11-04 a report's `notice` had been dropped from every write for
 * nine days, the type it was stored by never declaring it. A read keeps
 * stripping: a row written before a key was taken out of its type still
 * reads.
 */
const checkStored = <S extends z.ZodType>(
  schema: S,
  value: unknown,
  place: { table: string; column: string; row?: string },
  direction: StoredDirection
): z.output<S> => {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new StoredShapeError(place, direction, issueOf(parsed.error));
  }
  if (direction === "write") {
    const undeclared = undeclaredKeys(schema, value, parsed.data);
    if (undeclared.length > 0) {
      throw new StoredShapeError(place, direction, undeclaredIssue(undeclared));
    }
  }
  return parsed.data;
};

/** `text` parsed as JSON and by `schema`: the value, or what is wrong with it. */
const parseStored = <S extends z.ZodType>(
  schema: S,
  text: string
):
  | { ok: true; value: z.output<S> }
  | { ok: false; issue: string; cause?: unknown } => {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return {
      ok: false,
      issue: error instanceof Error ? error.message : String(error),
      cause: error,
    };
  }
  const parsed = schema.safeParse(value);
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, issue: issueOf(parsed.error), cause: parsed.error };
};

/** `text`, a stored JSON value's text, parsed and checked, or {@link StoredShapeError} naming `place`. */
export const readStoredText = <S extends z.ZodType>(
  schema: S,
  text: string,
  place: { table: string; column: string; row?: string }
): z.output<S> => {
  const parsed = parseStored(schema, text);
  if (!parsed.ok) {
    throw new StoredShapeError(place, "read", parsed.issue, {
      cause: parsed.cause,
    });
  }
  return parsed.value;
};

/** How a column's text is sealed at rest: `close` on write, `open` on read (null when it does not open). */
export interface StoredSeal {
  close: (text: string) => string;
  open: (raw: string) => string | null;
}

/** The row `raw` was read from, named by the registered namer. */
const rowOf = (column: unknown, raw: string): string | undefined => {
  if (!(rowNamer && is(column, SQLiteColumn))) {
    return;
  }
  const table = column.table as SQLiteTable;
  try {
    return rowNamer(table, primaryKeyOf(table), column, raw);
  } catch (error) {
    // Naming the row is for the message; the shape error is what is thrown.
    return `(not named: ${error instanceof Error ? error.message : String(error)})`;
  }
};

/** What a stored JSON column is checked against, kept on the column (its custom type's config). */
export interface StoredShape<S extends z.ZodType = z.ZodType> {
  schema: S;
  seal?: StoredSeal;
}

/** The {@link StoredShape} a column was declared with by {@link storedJson}; undefined for any other column. */
export const storedShapeOf = (column: unknown): StoredShape | undefined => {
  if (!is(column, SQLiteCustomColumn)) {
    return;
  }
  // `config` is protected in Drizzle's types and public at runtime (column.js `this.config = config`).
  const config: unknown = Reflect.get(column, "config");
  const shape =
    typeof config === "object" && config !== null && "fieldConfig" in config
      ? config.fieldConfig
      : undefined;
  return isStoredShape(shape) ? shape : undefined;
};

const isStoredShape = (value: unknown): value is StoredShape =>
  typeof value === "object" &&
  value !== null &&
  "schema" in value &&
  value.schema instanceof z.ZodType;

/** The {@link StoredShape} of the column a custom type's `toDriver`/`fromDriver` runs on (`this`). */
const shapeOf = (column: unknown): StoredShape => {
  const shape = storedShapeOf(column);
  if (!shape) {
    throw new Error("a stored JSON column without its shape");
  }
  return shape;
};

/**
 * One custom type for every stored JSON column; each column's schema and
 * seal ride in its config ({@link StoredShape}), read back through `this`,
 * the column Drizzle calls `toDriver` and `fromDriver` on
 * (`mapFromDriverValue(value) { return this.mapFrom(value) }`).
 */
const storedJsonType = customType<{
  data: unknown;
  driverData: string;
  config: StoredShape;
  configRequired: true;
}>({
  dataType: () => "text",
  // Drizzle writes null as SQL NULL without calling this
  // (sql.js: `chunk.value === null ? null : chunk.encoder.mapToDriverValue(chunk.value)`).
  toDriver(this: unknown, value) {
    const { schema, seal } = shapeOf(this);
    const text = JSON.stringify(
      checkStored(schema, value, placeOf(this), "write")
    );
    return seal ? seal.close(text) : text;
  },
  fromDriver(this: unknown, raw) {
    const { schema, seal } = shapeOf(this);
    const text = seal ? seal.open(raw) : raw;
    if (text === null) {
      return null;
    }
    const parsed = parseStored(schema, text);
    if (!parsed.ok) {
      throw new StoredShapeError(
        { ...placeOf(this), row: rowOf(this, raw) },
        "read",
        parsed.issue,
        { cause: parsed.cause }
      );
    }
    return parsed.value;
  },
});

/** A stored JSON column's builder, typed as its schema's output. */
type StoredJsonBuilder<Data> = ReturnType<
  ReturnType<typeof customType<{ data: Data; driverData: string }>>
>;

/**
 * A JSON column checked against `schema` on every write and every read:
 * `storedJson(PlanStep.array())("steps")`. Its TypeScript type is
 * `z.output` of the schema. With `seal`, the JSON is sealed at rest (hub
 * secret-box) and checked once it is opened; a value that does not open
 * reads as null.
 */
export function storedJson<S extends z.ZodType>(
  schema: S
): (name: string) => StoredJsonBuilder<z.output<S>>;
export function storedJson<S extends z.ZodType>(
  schema: S,
  seal: StoredSeal
): (name: string) => StoredJsonBuilder<z.output<S> | null>;
export function storedJson<S extends z.ZodType>(schema: S, seal?: StoredSeal) {
  return (name: string) =>
    storedJsonType(name, seal ? { schema, seal } : { schema });
}
