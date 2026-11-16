import { type GenericSchema, type InferOutput, safeParse } from "valibot";

/** `schema`'s reading of a value: its output, or undefined when the value is not one. */
export const readerOf =
  <S extends GenericSchema>(schema: S) =>
  (value: unknown): InferOutput<S> | undefined => {
    const read = safeParse(schema, value);
    return read.success ? read.output : undefined;
  };
