/**
 * Whether a stored JSON value reads whole as a shape, said in SQLite: the
 * predicate a migration that lifts values out of a JSON column keeps its
 * rows by, written from the column's recorded shape (stored/columns.json,
 * `z.toJSONSchema` of the column's zod schema) as it stood when the
 * migration was written. The migration's SQL holds the predicate's text,
 * and the step that logs its rows (db/migrate.ts) and the script that
 * counts them read with the same text, from the same frozen shape.
 *
 * A shape here is the subset of JSON Schema those records use: `type` (one
 * or several), `properties` with `required`, `items`, `enum`, `const`,
 * `anyOf`, made with the builders below. A key a shape does not declare is
 * ignored, as zod's objects drop it. A value zod checks in code
 * (`z.custom`, a refine) is recorded only as `x-code`; such a shape names
 * its SQL mirror instead, by `mirror`.
 *
 * Every JSON function sits inside a CASE that proved the column JSON
 * ({@link readsWhole}): SQLite may run either side of an AND first. Inside
 * it every path is read off the proved document, so a key that is missing or
 * of another kind reads as null, never as an error, and a list's entries
 * are read by their own paths (`fullkey`).
 */

type JsonType =
  "string" | "number" | "integer" | "boolean" | "null" | "object" | "array";

/**
 * Values zod checks in code, mirrored in SQL over a value's JSON type and
 * value. `machine-path`: core `isMachinePath`, a text that is absolute and
 * exactly as `machinePath` makes it: no surrounding white space, no empty,
 * `.` or `..` part, no trailing slash but the root's.
 */
const MIRRORS = {
  "machine-path": (type: string, value: string): string =>
    `(${type} = 'text' AND substr(${value}, 1, 1) = '/' AND ${value} = trim(${value}, ' ' || char(9, 10, 11, 12, 13)) AND instr(${value}, '//') = 0 AND instr(${value} || '/', '/./') = 0 AND instr(${value} || '/', '/../') = 0 AND (${value} = '/' OR substr(${value}, -1, 1) <> '/'))`,
} as const;

/** A recorded shape: the JSON Schema subset stored/columns.json writes. */
export interface JsonShape {
  readonly anyOf?: readonly JsonShape[];
  readonly const?: string | boolean;
  readonly enum?: readonly string[];
  readonly items?: JsonShape;
  /** A value zod checks in code: its SQL mirror, by name ({@link MIRRORS}). */
  readonly mirror?: keyof typeof MIRRORS;
  readonly properties?: Readonly<Record<string, JsonShape>>;
  readonly required?: readonly string[];
  readonly type?: JsonType | readonly JsonType[];
}

/* The builders a frozen shape is written with. */

export const TEXT: JsonShape = { type: "string" };
export const NUMBER: JsonShape = { type: "number" };
export const FLAG: JsonShape = { type: "boolean" };
/** `z.literal(true)`. */
export const TRUE: JsonShape = { type: "boolean", const: true };
export const TEXT_OR_NULL: JsonShape = { type: ["string", "null"] };
export const NUMBER_OR_NULL: JsonShape = { type: ["number", "null"] };
/** One of these texts (`z.enum`). */
export const oneOf = (...values: string[]): JsonShape => ({
  type: "string",
  enum: values,
});
/** This text alone (`z.literal`). */
export const literal = (value: string): JsonShape => ({
  type: "string",
  const: value,
});
export const listOf = (items: JsonShape): JsonShape => ({
  type: "array",
  items,
});
export const anyOf = (...shapes: JsonShape[]): JsonShape => ({
  anyOf: shapes,
});
export const nullable = (shape: JsonShape): JsonShape =>
  anyOf(shape, { type: "null" });
/** An object with `required` properties and `optional` ones. */
export const object = (
  required: Record<string, JsonShape>,
  optional: Record<string, JsonShape> = {}
): JsonShape => ({
  type: "object",
  properties: { ...required, ...optional },
  required: Object.keys(required),
});
/** An object of one `kind`, with its other `required` and `optional` properties. */
export const kinded = (
  kind: string,
  required: Record<string, JsonShape> = {},
  optional: Record<string, JsonShape> = {}
): JsonShape => object({ kind: literal(kind), ...required }, optional);

/** A place in the document, as SQL: an entry's own `fullkey` (or the root) and a suffix under it. */
interface Place {
  readonly base: string | null;
  readonly suffix: string;
}

/** The place as a SQL text expression. */
const pathOf = ({ base, suffix }: Place): string => {
  if (base === null) {
    return `'$${suffix}'`;
  }
  return suffix ? `${base} || '${suffix}'` : base;
};

const under = (place: Place, key: string): Place => ({
  base: place.base,
  suffix: `${place.suffix}.${key}`,
});

/** SQLite's `json_type` names for each JSON Schema type. */
const SQLITE_TYPES: Record<JsonType, readonly string[]> = {
  string: ["text"],
  number: ["integer", "real"],
  integer: ["integer"],
  boolean: ["true", "false"],
  null: ["null"],
  object: ["object"],
  array: ["array"],
};

const quoted = (value: string): string => `'${value.replaceAll("'", "''")}'`;

/** The JSON types a shape names, none when it names none. */
const typesOf = (shape: JsonShape): readonly JsonType[] => {
  if (shape.type === undefined) {
    return [];
  }
  return typeof shape.type === "string" ? [shape.type] : shape.type;
};

/** The test of a `const`: `true` or `false` by its JSON type, a text by its value. */
const constTest = (one: string | boolean, type: string, value: string) =>
  typeof one === "boolean"
    ? `${type} = '${one}'`
    : `(${type} = 'text' AND ${value} = ${quoted(one)})`;

/** What each declared property holds: required ones are there, optional ones may be missing. */
const propertyTests = (
  doc: string,
  shape: JsonShape,
  place: Place,
  depth: number
): string[] => {
  const required = new Set(shape.required ?? []);
  return Object.entries(shape.properties ?? {}).map(([key, inner]) => {
    const at = under(place, key);
    const test = holds(doc, inner, at, depth);
    return required.has(key)
      ? test
      : `(json_type(${doc}, ${pathOf(at)}) IS NULL OR ${test})`;
  });
};

/** The predicate `shape` holds of the value at `place` in `doc`, a column proved JSON. */
const holds = (
  doc: string,
  shape: JsonShape,
  place: Place,
  depth: number
): string => {
  const path = pathOf(place);
  const type = `json_type(${doc}, ${path})`;
  const value = `json_extract(${doc}, ${path})`;
  if (shape.mirror) {
    return MIRRORS[shape.mirror](type, value);
  }
  if (shape.anyOf) {
    return `(${shape.anyOf.map((one) => holds(doc, one, place, depth)).join(" OR ")})`;
  }
  const types = typesOf(shape);
  const tests = [
    ...(types.length > 0
      ? [
          `${type} IN (${types
            .flatMap((one) => SQLITE_TYPES[one])
            .map(quoted)
            .join(", ")})`,
        ]
      : []),
    ...(shape.enum
      ? [
          `(${type} = 'text' AND ${value} IN (${shape.enum.map(quoted).join(", ")}))`,
        ]
      : []),
    ...(shape.const === undefined ? [] : [constTest(shape.const, type, value)]),
    ...propertyTests(doc, shape, place, depth),
  ];
  if (shape.items) {
    const entry = `e${depth}`;
    const each = holds(
      doc,
      shape.items,
      { base: `${entry}.fullkey`, suffix: "" },
      depth + 1
    );
    tests.push(
      `CASE WHEN ${type} = 'array' THEN NOT EXISTS (SELECT 1 FROM json_each(${doc}, ${path}) ${entry} WHERE NOT coalesce(${each}, 0)) ELSE 0 END`
    );
  }
  return tests.length > 0 ? `(${tests.join(" AND ")})` : "1";
};

/**
 * `column` reads whole as `shape`: valid JSON whose value holds it. 0 when
 * it is not JSON, or null (a column never set is the caller's to tell).
 */
export const readsWhole = (column: string, shape: JsonShape): string =>
  `CASE WHEN json_valid(${column}) THEN coalesce(${holds(column, shape, { base: null, suffix: "" }, 0)}, 0) ELSE 0 END`;

/** `expression` over `column`, only once it is JSON; null otherwise. */
export const inJson = (column: string, expression: string): string =>
  `CASE WHEN json_valid(${column}) THEN ${expression} END`;
