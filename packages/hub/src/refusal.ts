import {
  type ElysiaStatus,
  problem,
  type ValidationErrorResponse,
} from "elysia";

/**
 * Any problem Elysia's `problem(status, { code, detail })` returns, read
 * structurally: its status box holds one status apart from every other (its
 * `Code` is `in out`), so code that passes any of them on without answering
 * it as a route reads it (an approved write's run, a tool's dependency)
 * reads these members of it. A route answers the problem itself, whose
 * status and code its type keeps.
 */
export interface AnyProblem extends Pick<
  ElysiaStatus<number, { code: string; detail: string }>,
  "~status" | "response" | "status"
> {}

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
      ? problem(error.status, { code, detail: error.message })
      : otherwise(error);
