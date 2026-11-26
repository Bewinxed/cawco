import { Effect } from "effect";

/**
 * `work()` as a step of work let go whose failure is said and goes no
 * further: `words`, then the error's message, as a warning. The step after
 * it runs either way, as a `.catch` that logs and returns did.
 */
export const warned = (
  work: () => Promise<unknown>,
  words: string
): Effect.Effect<void> =>
  Effect.tryPromise({ try: work, catch: (error) => error }).pipe(
    Effect.catch((error) =>
      Effect.sync(() => {
        console.warn(
          `${words}: ${error instanceof Error ? error.message : String(error)}`
        );
      })
    ),
    Effect.asVoid
  );
