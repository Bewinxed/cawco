import type { ElysiaStatus, ValidationErrorResponse } from "elysia";

/**
 * Any problem Elysia's `problem(status, { code, detail })` returns, read
 * structurally: its status box holds one status apart from every other (its
 * `Code` is `in out`), so code that passes any of them on without answering
 * it as a route reads it (an approved write's run, a tool's dependency)
 * reads these members of it. A route answers the problem itself, whose
 * status and code its type keeps.
 */
export interface AnyProblem extends Pick<
  ElysiaStatus<ProblemStatus, { code: string; detail: string }>,
  "~status" | "response" | "status"
> {}

/** What a call answers instead of its value: the problems in its result (a function's, or its promise's), read off the function. */
export type ProblemsOf<R> = Extract<Awaited<R>, { readonly "~status": true }>;

/**
 * Every status the hub answers a problem with: a refusal's, never a 2xx. A
 * problem passed on is said again at one of these, never at `number`:
 * Elysia keys a status it only knows as `number` `default`, which Eden's
 * client reads as a possible answer (a 2xx, or an empty body), where one of
 * these is its refusal.
 */
export type ProblemStatus =
  400 | 401 | 403 | 404 | 409 | 410 | 413 | 415 | 422 | 500 | 502 | 503 | 504;

/**
 * A schema's own refusal, as its `error` (`t.String({ …, error:
 * schemaRefusal(words) })`): Elysia's validation problem, the sentence the
 * person reads as its `detail`, where Elysia's own names only the field that
 * failed (in production, nothing more). Elysia answers it whole, as JSON,
 * with 422, so the route's typed 422 is what is sent.
 */
export const schemaRefusal =
  (detail: string) =>
  ({ on }: { on: string }): ValidationErrorResponse => ({
    type: "validation",
    code: "validation",
    title: "Validation Error",
    status: 422,
    on,
    detail,
  });
