/**
 * "Wait until a condition holds, within a deadline": looks, and looks again
 * every `every` milliseconds, until a look holds (`done`, by default a truthy
 * answer) or the deadline has passed. Answers the last look.
 */
export interface UntilOptions<T> {
  /** The moment, by `Date.now()`, after which no further look is made. */
  deadline: number;
  /** Whether a look's answer is the one waited for. */
  done?: (answer: T) => boolean;
  /** The milliseconds slept between two looks. */
  every: number;
}

export const until = async <T>(
  look: () => T | Promise<T>,
  { deadline, done = Boolean, every }: UntilOptions<T>
): Promise<T> => {
  for (;;) {
    const answer = await look();
    if (done(answer) || Date.now() >= deadline) {
      return answer;
    }
    await Bun.sleep(every);
  }
};
