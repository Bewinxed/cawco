/**
 * The agent's one form for a promise run inside an Effect (the effect-ts
 * skill's `Effect.tryPromise` with a `Schema.TaggedError`, node_modules/
 * effect/AGENTS.md "Creating effects from common sources"):
 *
 * - a promise that can reject is {@link fromPromise}: its rejection is a
 *   {@link Rejected} in the error channel, the very error it rejected with
 *   as its `cause`, so Effect code tells it apart by its tag
 *   (`Effect.catchTag("Rejected", …)`) and reads the error it carries;
 * - a promise that cannot reject (one whose own `.catch` answers its
 *   failure, a process's `exited`) is `Effect.promise`;
 * - a failure the module names for itself is that module's own
 *   `Schema.TaggedError`, made in `Effect.tryPromise`'s `catch`.
 *
 * A promise caller sees what it saw before Effect: the runtime's promise
 * edge (daemon-runtime.ts `runPromise`) rejects with a {@link Rejected}'s
 * `cause`, so `instanceof` and `.message` read the error the promise gave.
 * `Effect.tryPromise` with `catch: (error) => error` (a failure of type
 * `unknown`) is refused by scripts/lint/agent-promise-wraps.grit.
 */
import { Effect, Schema } from "effect";

/** A promise rejected: `cause` is what it rejected with. */
export class Rejected extends Schema.TaggedError<Rejected>()("Rejected", {
  cause: Schema.Defect(),
}) {
  /** The words of what it rejected with, as that error says them. */
  override get message(): string {
    return this.cause instanceof Error
      ? this.cause.message
      : String(this.cause);
  }
}

/**
 * `run`'s promise as an Effect: its value, or a {@link Rejected} carrying
 * what it rejected with. `run` is handed the Effect's interruption as a
 * signal, for a fetch or a child it can stop.
 */
export const fromPromise = <A>(
  run: (signal: AbortSignal) => PromiseLike<A>
): Effect.Effect<A, Rejected> =>
  Effect.tryPromise({ try: run, catch: (cause) => new Rejected({ cause }) });

/** What a failure is to a promise caller: a {@link Rejected}'s own error, anything else itself. */
export const asThrown = (error: unknown): unknown =>
  error instanceof Rejected ? error.cause : error;
