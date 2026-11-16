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
import { isRecord } from "./is-record";

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

/** A schema of any kind, as zod's core declares it: what each kind's class narrows. */
type Schema = z.core.$ZodType;

/** `held`'s member at `key`: an array's at its index, an object's at its name. */
const memberOf = (held: unknown, key: string | number): unknown => {
  if (Array.isArray(held)) {
    return typeof key === "number" ? held[key] : undefined;
  }
  return isRecord(held) ? held[key] : undefined;
};

/**
 * The schema `schema` reads `value` with in its place: a wrapper's inner
 * one, a pipe's input, a lazy schema's own, a union's first option that
 * parses it (z.union keeps that one's output); undefined for any other kind.
 */
const innerOf = (schema: Schema, value: unknown): Schema | undefined => {
  if (
    schema instanceof z.core.$ZodCatch ||
    schema instanceof z.core.$ZodDefault ||
    schema instanceof z.core.$ZodNonOptional ||
    schema instanceof z.core.$ZodNullable ||
    schema instanceof z.core.$ZodOptional ||
    schema instanceof z.core.$ZodPrefault ||
    schema instanceof z.core.$ZodReadonly
  ) {
    return schema._zod.def.innerType;
  }
  if (schema instanceof z.core.$ZodPipe || schema instanceof z.core.$ZodCodec) {
    return schema._zod.def.in;
  }
  if (schema instanceof z.core.$ZodLazy) {
    return schema._zod.def.getter();
  }
  if (schema instanceof z.core.$ZodUnion) {
    return schema._zod.def.options.find(
      (option) => z.safeParse(option, value).success
    );
  }
};

/**
 * `schema` as it reads `value`: its wrappers off, a pipe's input, a lazy
 * schema's own, a union's first option that parses it. `seen` hears each
 * schema on the way.
 */
const settled = (
  schema: Schema,
  value: unknown,
  seen: (one: Schema) => void
): Schema => {
  let at: Schema | undefined = schema;
  let last = schema;
  while (at) {
    seen(at);
    last = at;
    at = innerOf(at, value);
  }
  return last;
};

/** The schema a settled `schema` reads its `key`'s value with; undefined when it names none. */
const childOf = (schema: Schema, key: string | number): Schema | undefined => {
  if (schema instanceof z.core.$ZodObject) {
    return schema._zod.def.shape[key] ?? schema._zod.def.catchall;
  }
  if (schema instanceof z.core.$ZodArray) {
    return schema._zod.def.element;
  }
  if (schema instanceof z.core.$ZodRecord) {
    return schema._zod.def.valueType;
  }
  if (schema instanceof z.core.$ZodIntersection) {
    return (
      childOf(schema._zod.def.left, key) ?? childOf(schema._zod.def.right, key)
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
  const seen = (one: Schema) => {
    named = storedTypes.get(one) ?? named;
  };
  let at: Schema | undefined = schema;
  let held = value;
  for (const key of path) {
    at = childOf(settled(at, held, seen), key);
    if (!at) {
      return named;
    }
    held = memberOf(held, key);
  }
  settled(at, held, seen);
  return named;
};
