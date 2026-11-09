import { problem, type ValidationErrorResponse } from "elysia";

/**
 * A refusal a route answers: its status, a stable code naming the cause, and
 * the sentence the person or the session reads, as an RFC 9457 problem
 * (Elysia's `problem`: `{ type, title, status, code, detail }`, sent as
 * `application/problem+json`). Returned, never thrown: a helper that refuses
 * returns it, each caller passes it up (`if (x instanceof ElysiaStatus)
 * return x`), and the route answers it, so its status and body are in the
 * route's type, the dashboard's Eden client and openapi.json. Its sentence is
 * typed `string`, so one code is one body however its words are filled in.
 */
export const refusal = <const Status extends number, const Code extends string>(
  answering: Status,
  code: Code,
  detail: string
) => problem(answering, { code, detail });

/**
 * Any refusal, as code that passes one on without answering it as a route
 * reads it (an approved write's run, a tool's dependency): Elysia's status
 * mark and the problem it carries. A route answers the {@link refusal}
 * itself, whose status and code its type keeps.
 */
export interface Refused {
  readonly "~status": true;
  readonly response: { readonly code: string; readonly detail: string };
  readonly status: number;
}

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

/** The statuses a refusal answers with. */
type RefusalCode = 400 | 403 | 404 | 409;

/**
 * A refusal, with the status a route answers and the words a tool returns.
 * Each module subclasses it, so its routes answer its own refusals and let
 * anything else through.
 */
export class StatusRefusal<Code extends number = RefusalCode> extends Error {
  readonly status: Code;
  constructor(code: Code, message: string, options?: ErrorOptions) {
    super(message, options);
    this.status = code;
  }
}

type RefusalKind = new (code: RefusalCode, message: string) => StatusRefusal;

/** The `refuse` that throws a module's own refusal. */
export const refuser =
  (Kind: RefusalKind) =>
  (code: RefusalCode, message: string): never => {
    throw new Kind(code, message);
  };

const rethrow = (error: unknown): never => {
  throw error;
};

/** A thrown refusal of `Kind` as the route's {@link refusal}, under `code`; anything else goes to `otherwise`, thrown on by default. */
export const refusalAnswer =
  <const Code extends string, R = never>(
    Kind: RefusalKind,
    code: Code,
    otherwise: (error: unknown) => R = rethrow
  ) =>
  (error: unknown) =>
    error instanceof Kind
      ? refusal(error.status, code, error.message)
      : otherwise(error);

/** Runs a route's work, answering a thrown refusal of `Kind` as {@link refusalAnswer}. */
export const refusalAttempt = <const Code extends string>(
  Kind: RefusalKind,
  code: Code
) => {
  const answer = refusalAnswer(Kind, code);
  return async <T>(work: () => T | Promise<T>) => {
    try {
      return await work();
    } catch (error) {
      return answer(error);
    }
  };
};
