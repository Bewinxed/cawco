import { status } from "elysia";

/** The statuses a refusal answers with. */
type RefusalCode = 400 | 403 | 404 | 409;

/**
 * A refusal, with the status a route answers and the words a tool returns.
 * Each module subclasses it, so its routes answer its own refusals and let
 * anything else through.
 */
export class StatusRefusal extends Error {
  readonly status: RefusalCode;
  constructor(code: RefusalCode, message: string) {
    super(message);
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

/** A refusal of `Kind` as the route's answer; anything else goes to `otherwise`, thrown on by default. */
export const refusalAnswer =
  <R = never>(Kind: RefusalKind, otherwise: (error: unknown) => R = rethrow) =>
  (error: unknown) =>
    error instanceof Kind
      ? status(error.status, error.message)
      : otherwise(error);

/** Runs a route's work, answering a refusal of `Kind` with its status. */
export const refusalAttempt = (Kind: RefusalKind) => {
  const answer = refusalAnswer(Kind);
  return async <T>(work: () => T | Promise<T>) => {
    try {
      return await work();
    } catch (error) {
      return answer(error);
    }
  };
};
