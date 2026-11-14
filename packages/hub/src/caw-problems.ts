import type { problem } from "elysia";
import type { listFolder, projectRoot } from "./project-folder";

/** A problem of this status and code, its words a string. */
type Problem<Status extends number, Code extends string> = ReturnType<
  typeof problem<Status, { code: Code; detail: string }>
>;

/**
 * What project-joining.ts `leadHome` answers when it cannot say where Caw
 * starts: the project's folder on the hub (the folder's own problems), or a
 * machine that does not say where its home is. `leadHome` returns it, and
 * caw.ts reads it from here: naming `leadHome` itself in caw.ts closes the
 * cycle caw → project-joining → hub-context → closure-context → caw.
 */
export type LeadHomeProblem =
  | Extract<
      Awaited<ReturnType<typeof listFolder>> | ReturnType<typeof projectRoot>,
      { readonly "~status": true }
    >
  | Problem<502, "caw-home-unsaid">;
