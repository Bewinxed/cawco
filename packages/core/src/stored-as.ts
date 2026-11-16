/**
 * A stored type's own schema (stored-shapes.ts, its output that type
 * exactly) read inside a valibot schema: what a wire reader built in valibot
 * (control-args.ts, machine-inbound.ts) takes a stored type's value by.
 */

import { pipe, rawTransform, unknown } from "valibot";
import type { z } from "zod";
import { wireReadWords } from "./words/wire-reads";

/** A value read by `schema`, a stored type's own: its output, or its issues said, naming it `what`. */
export const storedAs = <T>(schema: z.ZodType<T>, what: string) =>
  pipe(
    unknown(),
    rawTransform<unknown, T>(({ dataset, addIssue, NEVER }) => {
      const read = schema.safeParse(dataset.value);
      if (read.success) {
        return read.data;
      }
      addIssue({
        message: wireReadWords.notStored(
          what,
          read.error.issues
            .map((issue) => issue.path.join(".") || issue.message)
            .join(", ")
        ),
      });
      return NEVER;
    })
  );
