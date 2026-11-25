/**
 * How a provider's request fails, said once for every provider: refused in
 * the service's words ({@link ProviderRefused}, with when its rate limit
 * lets the next request go), or not answered within the hub's deadline
 * ({@link ProviderUnanswered}); and {@link request}, one request to a
 * service as an Effect that fails with one of them.
 */
import { Effect, Schema } from "effect";

/** What kind of refusal a service gave: what a hub reads it to stop (a whole sync for `sign-in` and `rate`, a write for any). */
const REFUSAL_KINDS = [
  "sign-in",
  "scope",
  "rate",
  "unreachable",
  "input",
] as const;
export type RefusalKind = (typeof REFUSAL_KINDS)[number];

/**
 * A service refused a request, or could not be reached for it: its words,
 * with what the connection needs where it lacks it, and when its rate
 * limit lets the next request go (ms; null when it holds nothing back).
 */
export class ProviderRefused extends Schema.TaggedError<ProviderRefused>()(
  "ProviderRefused",
  {
    kind: Schema.Literals(REFUSAL_KINDS),
    resumeAt: Schema.NullOr(Schema.Number),
    words: Schema.String,
  }
) {}

/** A request the service did not answer within the hub's deadline: nothing moves, and nothing is said of the watch. */
export class ProviderUnanswered extends Schema.TaggedError<ProviderUnanswered>()(
  "ProviderUnanswered",
  {
    /** How long it was given, ms. */
    after: Schema.Number,
    service: Schema.String,
  }
) {}

/** How a provider's request fails. */
export type ProviderFailure = ProviderRefused | ProviderUnanswered;

/**
 * One request to `service`: `run` given the signal that aborts when the
 * request is let go, its failure read by `refused`, and let go with
 * {@link ProviderUnanswered} after `requestMs`.
 */
export const request = <A>(
  service: string,
  requestMs: number,
  run: (signal: AbortSignal) => Promise<A>,
  refused: (error: unknown) => ProviderRefused
): Effect.Effect<A, ProviderFailure> =>
  Effect.tryPromise({ try: (signal) => run(signal), catch: refused }).pipe(
    Effect.timeoutOrElse({
      duration: requestMs,
      orElse: () =>
        Effect.fail(new ProviderUnanswered({ service, after: requestMs })),
    })
  );

/** A refusal in `words`, of kind `input` unless said otherwise. */
export const refusedWith = (
  words: string,
  kind: RefusalKind = "input",
  resumeAt: number | null = null
): ProviderRefused => new ProviderRefused({ kind, words, resumeAt });

/** Words for any failure: a refusal's own, or how long the service was given. */
export const failureWords = (failure: ProviderFailure): string =>
  failure._tag === "ProviderRefused"
    ? failure.words
    : `${failure.service} did not answer within the ${failure.after} ms it was given.`;

/** A webhook delivery whose signature does not hold, why in words: for the hub's log, never its caller. */
export class DeliveryUnverified extends Schema.TaggedError<DeliveryUnverified>()(
  "DeliveryUnverified",
  { words: Schema.String }
) {}

/** A verified delivery whose body does not read as what its service sends, why in words. */
export class DeliveryUnread extends Schema.TaggedError<DeliveryUnread>()(
  "DeliveryUnread",
  { words: Schema.String }
) {}
