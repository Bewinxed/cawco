/**
 * How a provider's poll stops short, said once for every provider: a
 * {@link Stop} in the service's words (its rate limit's resume time with
 * it), or a request the service did not answer within the hub's deadline
 * ({@link Unanswered}), read back as the stream's `Polled` outcome by
 * {@link polledFailure}.
 */
import type { Asked, Polled } from "./provider";

/** A read stopped short, in the words the project's views read. */
export class Stop extends Error {
  readonly resumeAt: number | null;
  constructor(message: string, resumeAt: number | null = null) {
    super(message);
    this.resumeAt = resumeAt;
  }
}

/** A request the service did not answer in time: the read ends there and moves nothing. */
class Unanswered extends Error {
  readonly after: number;
  constructor(service: string, after: number) {
    super(`${service} did not answer within ${after} ms`);
    this.after = after;
  }
}

/** A bounded read's answer, or {@link Unanswered} thrown. */
export const answered = <T>(service: string, asked: Asked<T>): T => {
  if (asked.kind === "unanswered") {
    throw new Unanswered(service, asked.after);
  }
  return asked.value;
};

/** What a stream's read that threw comes to: unanswered, or stopped in the service's words. */
export const polledFailure = (
  service: string,
  error: unknown
): Extract<Polled<never>, { kind: "stopped" | "unanswered" }> => {
  if (error instanceof Unanswered) {
    return { kind: "unanswered", after: error.after };
  }
  return {
    kind: "stopped",
    problem:
      error instanceof Stop
        ? { words: error.message, resumeAt: error.resumeAt }
        : {
            words: `${service} could not be reached: ${error instanceof Error ? error.message : String(error)}`,
            resumeAt: null,
          },
  };
};
