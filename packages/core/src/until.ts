/**
 * "Wait until a condition holds, within a deadline": looks, and looks again
 * every `every` milliseconds, until a look holds (`done`, by default a truthy
 * answer) or the deadline has passed. Answers the last look.
 */
export interface UntilOptions<T> {
  /** Where time comes from: the wall clock unless a spec passes its own. */
  clock?: UntilClock;
  /** The moment on `clock.now` after which no further look is made. */
  deadline: number;
  /** Whether a look's answer is the one waited for. */
  done?: (answer: T) => boolean;
  /** The milliseconds slept between two looks. */
  every: number;
}

export interface UntilClock {
  now: () => number;
  sleep: (ms: number) => Promise<unknown>;
}

const WALL_CLOCK: UntilClock = {
  now: () => Date.now(),
  sleep: (ms) => Bun.sleep(ms),
};

export const until = async <T>(
  look: () => T | Promise<T>,
  { clock = WALL_CLOCK, deadline, done = Boolean, every }: UntilOptions<T>
): Promise<T> => {
  for (;;) {
    const answer = await look();
    if (done(answer) || clock.now() >= deadline) {
      return answer;
    }
    await clock.sleep(every);
  }
};
