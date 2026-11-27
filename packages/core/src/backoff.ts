/**
 * THE ONE WAY ANYTHING TRIES AGAIN. Every retry in the hub, the agent and
 * the dashboard takes its waits from here: capped exponential backoff with
 * jitter, and an end it names.
 *
 * - **Capped exponential.** The wait after the nth failure in a row is
 *   `firstMs * 2^(n-1)`, never past `mostMs`.
 * - **Jitter.** Each wait is drawn between half that and the whole of it
 *   ("equal jitter", aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter):
 *   a fleet that failed together (a hub restart, a provider's outage) does
 *   not come back together, and the shortest wait is still half the step.
 * - **A terminal give-up.** A policy says when it stops: after so many
 *   failures in a row, or once failing has lasted so long. Past it the
 *   state is `gave-up` until {@link Backoff.succeeded} or
 *   {@link Backoff.again} starts it over, which only an event says may
 *   help: the person's own retry, a config changed, the peer announced
 *   again. Whoever holds one shows the person that it gave up; nothing waits
 *   on it in silence. A link that is the product's spine (a dashboard's
 *   socket to its hub, an agent's link to its hub) cannot give up without
 *   leaving the person a dead screen or the fleet a dead machine: its policy
 *   says `never` with why, and its cap is what bounds its cost.
 *
 * Why this exists: on 2026-11-19 two loops retried for ever, a daemon's
 * browser link every 5 s and an MCP sign-in's renewal, and nothing anywhere
 * said a retry had stopped helping (tsk-399). A retry written by hand is a
 * lint error (scripts/lint/retry-through-backoff.grit).
 */

/** The one first wait of a retry: a policy with no reason of its own to wait otherwise starts here. */
// @limit external: gRPC waits 1 second before its first retry (INITIAL_BACKOFF = 1 second, https://github.com/grpc/grpc/blob/master/doc/connection-backoff.md); the daemon's hub link and the dashboard's socket already start there
export const RETRY_FIRST_MS = 1000;

/** When a {@link BackoffPolicy} stops. */
type GiveUp =
  /** After this many failures in a row. */
  | { readonly afterTries: number }
  /** Once failing has lasted this long since the first failure in a row. */
  | { readonly afterMs: number }
  /** Never: why this link must keep trying, at its cap. */
  | { readonly never: string };

/** How a retry waits, and when it stops. */
export interface BackoffPolicy {
  /** The wait after the first failure (before jitter). */
  readonly firstMs: number;
  /** When it gives up. */
  readonly giveUp: GiveUp;
  /** The longest wait (before jitter). */
  readonly mostMs: number;
}

/** What a failure leads to: a wait before the next try, or the end. */
export type BackoffStep =
  | {
      readonly kind: "wait";
      /** How long to wait before the next try. */
      readonly ms: number;
      /** Failures in a row, this one counted. */
      readonly tries: number;
    }
  | {
      readonly kind: "gave-up";
      /** How long it had been failing. */
      readonly failingMs: number;
      /** Failures in a row, this one counted. */
      readonly tries: number;
    };

/** Past this, `2 ** n` is far over any cap: the exponent stops growing there. */
// @limit measured: 2^30 times the base delay is past any wait; more doublings overflow
const MOST_DOUBLINGS = 30;

/**
 * The wait after `tries` failures in a row (1 for the first): capped
 * exponential, drawn between half of it and the whole ({@link random} in
 * [0, 1)). For a count kept elsewhere (a row's column); a loop holds a
 * {@link Backoff}.
 */
export const backoffWait = (
  policy: Pick<BackoffPolicy, "firstMs" | "mostMs">,
  tries: number,
  random: () => number = Math.random
): number => {
  const step = Math.min(
    policy.mostMs,
    policy.firstMs * 2 ** Math.min(Math.max(0, tries - 1), MOST_DOUBLINGS)
  );
  return Math.round(step / 2 + random() * (step / 2));
};

/**
 * What the `tries`th failure in a row leads to, when failing began at
 * `since` ({@link BackoffStep}): for a count kept elsewhere.
 */
export const backoffStep = (
  policy: BackoffPolicy,
  tries: number,
  since: number,
  now: number = Date.now()
): BackoffStep => {
  const failingMs = Math.max(0, now - since);
  const { giveUp } = policy;
  const over =
    ("afterTries" in giveUp && tries >= giveUp.afterTries) ||
    ("afterMs" in giveUp && failingMs >= giveUp.afterMs);
  return over
    ? { kind: "gave-up", tries, failingMs }
    : { kind: "wait", ms: backoffWait(policy, tries), tries };
};

/**
 * One retrying thing's failures in a row: each {@link failed} says how long
 * to wait or that it gave up; {@link succeeded} starts it over.
 */
export class Backoff {
  readonly policy: BackoffPolicy;
  #tries = 0;
  #since = 0;
  #gaveUp = false;

  constructor(policy: BackoffPolicy) {
    this.policy = policy;
  }

  /** A try failed: how long to wait before the next, or that it gave up. */
  failed(now: number = Date.now()): BackoffStep {
    if (this.#tries === 0) {
      this.#since = now;
    }
    this.#tries += 1;
    const step = backoffStep(this.policy, this.#tries, this.#since, now);
    this.#gaveUp = step.kind === "gave-up";
    return step;
  }

  /** A try landed: the next failure waits the first wait again. */
  succeeded(): void {
    this.#tries = 0;
    this.#gaveUp = false;
  }

  /**
   * Something says a try may help now (the person's retry, a config
   * changed, the peer back): starts over as {@link succeeded} does.
   */
  again(): void {
    this.succeeded();
  }

  /** Whether it gave up, until it starts over. */
  get gaveUp(): boolean {
    return this.#gaveUp;
  }

  /** Failures in a row so far. */
  get tries(): number {
    return this.#tries;
  }
}
