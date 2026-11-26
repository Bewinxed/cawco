/**
 * The OpenCode harness's promise edge for an Effect its caller can let go
 * of. Its promise calls run inside Effects as the agent's one form
 * (rejected.ts `attempt`); its joins are the kit's (`@cawco/core/effect/join`).
 *
 * The harness's members stay promises while their callers are promise code
 * (the effect plan's rule 2); the waits, retries, joins and gates inside
 * them are Effect, run at that edge.
 */
import { Cause, type Effect, Exit } from "effect";
import { runPromiseExit, thrownOf } from "../daemon-runtime";

/**
 * The promise edge of an Effect its caller can let go of with `signal`: it
 * settles as the Effect does, with its very value or error (a promise's
 * rejection as that very error, daemon-runtime.ts `thrownOf`), and a
 * `signal` that aborts it rejects with the signal's reason, as the promise
 * code it replaced did when its read threw on the abort.
 */
export const runAbortable = async <A, E>(
  effect: Effect.Effect<A, E>,
  signal?: AbortSignal
): Promise<A> => {
  const exit = await runPromiseExit(effect, signal ? { signal } : undefined);
  if (Exit.isSuccess(exit)) {
    return exit.value;
  }
  if (signal?.aborted && Cause.hasInterruptsOnly(exit.cause)) {
    throw signal.reason;
  }
  throw thrownOf(exit.cause);
};
