/**
 * Which declared TypeScript type each generated stored schema is made from
 * (hub scripts/stored-shapes.ts wraps each in {@link declared}), and the
 * type a key at a path of a stored value is read by ({@link typeAt}), so a
 * write holding a key no type declares names the type to declare it in
 * (stored-json.ts). A registry rather than the schema's own `.meta()`, which
 * returns a copy: the combinators other schemas read (`.extend`, `.shape`)
 * and the columns need the one instance. Zod alone: the agent and the CLI
 * load the generated schemas, never the database's modules.
 */
import { z } from "zod";

/** A declared type: its name, and where it is declared (a path from the repository's root, or a package's module). */
export interface StoredType {
  declaredIn: string;
  type: string;
}

const storedTypes = z.registry<StoredType>();

/**
 * `schema`, recorded as the one made from `type`, declared in
 * `declaredIn`. A schema recorded already keeps its first: an alias
 * (`type A = B`) is B's schema, and a key is declared in B.
 */
export const declared = <S extends z.ZodType>(
  schema: S,
  type: string,
  declaredIn: string
): S => {
  if (!storedTypes.has(schema)) {
    storedTypes.add(schema, { type, declaredIn });
  }
  return schema;
};

/** What the walk reads of a schema's definition (zod's `_zod.def`), each on the kinds that have it. */
interface DefView {
  catchall?: z.ZodType;
  element?: z.ZodType;
  getter?: () => z.ZodType;
  in?: z.ZodType;
  innerType?: z.ZodType;
  left?: z.ZodType;
  options?: readonly z.ZodType[];
  right?: z.ZodType;
  shape?: Readonly<Record<string, z.ZodType>>;
  type: string;
  valueType?: z.ZodType;
}

const defOf = (schema: z.ZodType): DefView => schema._zod.def as DefView;

/** The kinds that read their value with the one schema they wrap. */
const WRAPPERS = new Set([
  "catch",
  "default",
  "nonoptional",
  "nullable",
  "optional",
  "prefault",
  "readonly",
]);

/**
 * `schema` as it reads `value`: its wrappers off, a pipe's input, a lazy
 * schema's own, a union's first option that parses it (z.union keeps that
 * one's output). `seen` hears each schema on the way.
 */
const settled = (
  schema: z.ZodType,
  value: unknown,
  seen: (one: z.ZodType) => void
): z.ZodType => {
  let at: z.ZodType | undefined = schema;
  let last = schema;
  while (at) {
    seen(at);
    last = at;
    const def = defOf(at);
    if (WRAPPERS.has(def.type)) {
      at = def.innerType;
    } else if (def.type === "pipe") {
      at = def.in;
    } else if (def.type === "lazy") {
      at = def.getter?.();
    } else if (def.type === "union") {
      at = def.options?.find((option) => option.safeParse(value).success);
    } else {
      at = undefined;
    }
  }
  return last;
};

/** The schema a settled `schema` reads its `key`'s value with; undefined when it names none. */
const childOf = (
  schema: z.ZodType,
  key: string | number
): z.ZodType | undefined => {
  const def = defOf(schema);
  if (def.type === "object") {
    return def.shape?.[key] ?? def.catchall;
  }
  if (def.type === "array") {
    return def.element;
  }
  if (def.type === "record") {
    return def.valueType;
  }
  if (def.type === "intersection") {
    return (
      (def.left && childOf(def.left, key)) ??
      (def.right && childOf(def.right, key))
    );
  }
};

/**
 * The declared type that reads the object at `path` of `value`, which
 * `schema` reads whole: the nearest one recorded ({@link declared}) on the
 * way down to it, through each wrapper and union option the read takes.
 * Undefined when none is.
 */
export const typeAt = (
  schema: z.ZodType,
  value: unknown,
  path: readonly (string | number)[]
): StoredType | undefined => {
  let named = storedTypes.get(schema);
  const seen = (one: z.ZodType) => {
    named = storedTypes.get(one) ?? named;
  };
  let at: z.ZodType | undefined = schema;
  let held = value;
  for (const key of path) {
    at = childOf(settled(at, held, seen), key);
    if (!at) {
      return named;
    }
    held =
      typeof held === "object" && held !== null
        ? (held as Record<string | number, unknown>)[key]
        : undefined;
  }
  settled(at, held, seen);
  return named;
};
