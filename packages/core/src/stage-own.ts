/**
 * WHAT A STAGE ANSWERS AT `OWN_PATH` (stage.ts), AS ITS CANVAS PAGE READS
 * IT: a states file's stories that run in a module runner of their own, and
 * their private modules' code (agent stage-host host.ts makes it, canvas
 * own.ts reads it). The page reads it off `fetch`, so it is JSON until this
 * parse reads it.
 */

import {
  array,
  type InferOutput,
  object,
  record,
  safeParse,
  string,
  union,
  unknown,
} from "valibot";

/** A private module's code as a story's runner evaluates it, or the error Vite's transform of it threw. */
const OWN_CODE = union([
  object({ code: string(), etag: string(), map: unknown() }),
  object({ error: string() }),
]);

/** A private module's code ({@link OWN_CODE}). */
export type OwnCode = InferOutput<typeof OWN_CODE>;

const OWN_ANSWER = object({
  /** The states file's address as the page's code names it: each runner's entry. */
  entry: string(),
  /** Each private module's code, by the address the page's code imports it at. */
  modules: record(string(), OWN_CODE),
  /** The stories that run in a runner of their own, by export name. */
  stories: array(string()),
  /** Each such story whose component is no private module (its seed can't reach it): the component's file from the root. */
  unreached: record(string(), string()),
  /** The private modules, by the address the page's code imports each at (the dev server's base in it). */
  urls: array(string()),
});

/** A states file's own stories with their private modules' code ({@link OWN_ANSWER}). */
export type OwnAnswer = InferOutput<typeof OWN_ANSWER>;

/** The stage's answer at `OWN_PATH` for states file `file`; one in no such shape throws, naming why. */
export const ownAnswer = (file: string, value: unknown): OwnAnswer => {
  const read = safeParse(OWN_ANSWER, value);
  if (!read.success) {
    throw new Error(
      `The stage answered ${file}'s own modules in a shape the page does not read: ${read.issues.map((issue) => issue.message).join("; ")}`
    );
  }
  return read.output;
};
