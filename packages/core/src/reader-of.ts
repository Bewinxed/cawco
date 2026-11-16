import {
  type GenericSchema,
  type InferInput,
  type InferOutput,
  is,
  safeParse,
} from "valibot";

/** `schema`'s reading of a value: its output, or undefined when the value is not one. */
export const readerOf =
  <S extends GenericSchema>(schema: S) =>
  (value: unknown): InferOutput<S> | undefined => {
    const read = safeParse(schema, value);
    return read.success ? read.output : undefined;
  };

/**
 * `schema`'s guard as a reader: the very value it was given, whole and
 * untouched (its keys in their order, each one the schema does not name
 * kept), once it is in the schema's shape; undefined when it is not. For a
 * file another program owns that CawCo writes back as it read it.
 */
export const wholeReaderOf =
  <S extends GenericSchema>(schema: S) =>
  (value: unknown): InferInput<S> | undefined =>
    is(schema, value) ? value : undefined;
