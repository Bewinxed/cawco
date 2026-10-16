/**
 * A read with a deadline has three outcomes: answered yes, answered no, or no
 * answer in time. The answer, yes or no, is `value`; no answer is its own
 * kind, so nothing can read it as "no" without saying so in a `switch` on
 * `kind` (Alexis King, "Parse, don't validate",
 * https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/: "If we
 * could statically *prove* the `Nothing` case impossible, then a modification
 * … would invalidate the proof and trigger a compile-time failure").
 *
 * `after`: the milliseconds the read was given before it was let go.
 * `reason`: "timeout" when the clock ran out; "dead" when the side asked
 * ended before it answered (its connection closed, its process exited), as
 * the read says by throwing {@link Gone}.
 *
 * This file is the one place a deadline meets a read (lint/no-raw-deadline.grit).
 */
export type Bounded<T> =
  | { kind: "answered"; value: T }
  | { kind: "unanswered"; after: number; reason: "timeout" | "dead" };

/** Thrown by a read whose other side ended before it answered: {@link readWithin} answers it `unanswered`, reason "dead". */
export class Gone extends Error {
  constructor(what: string) {
    super(what);
    this.name = "Gone";
  }
}

/**
 * Runs `read` with `ms` to answer. The read gets a signal that aborts when
 * the time is up (or when `options.signal` aborts) and hands it to whatever
 * it waits on: a fetch, a spawn, a socket. Answers `answered` with what the
 * read returned, or `unanswered` when the time ran out or the read threw
 * {@link Gone}. Any other error the read throws is its own and is thrown on,
 * as is the abort of `options.signal`: a caller that let go did not run out
 * of time.
 */
export const readWithin = <T>(
  ms: number,
  read: (signal: AbortSignal) => Promise<T>,
  options: { signal?: AbortSignal } = {}
): Promise<Bounded<T>> => {
  const started = performance.now();
  const elapsed = () => Math.round(performance.now() - started);
  const deadline = new AbortController();
  const signal = options.signal
    ? AbortSignal.any([options.signal, deadline.signal])
    : deadline.signal;
  return new Promise<Bounded<T>>((resolve, reject) => {
    const timer = setTimeout(() => {
      deadline.abort(
        new DOMException(`no answer within ${ms} ms`, "TimeoutError")
      );
      resolve({ kind: "unanswered", after: elapsed(), reason: "timeout" });
    }, ms);
    let pending: Promise<T>;
    try {
      pending = read(signal);
    } catch (error) {
      clearTimeout(timer);
      reject(error);
      return;
    }
    pending.then(
      (value) => {
        clearTimeout(timer);
        resolve({ kind: "answered", value });
      },
      (error: unknown) => {
        clearTimeout(timer);
        if (deadline.signal.aborted) {
          // Already answered `unanswered`: this is the read giving up on our abort.
          return;
        }
        if (error instanceof Gone) {
          resolve({ kind: "unanswered", after: elapsed(), reason: "dead" });
          return;
        }
        reject(error);
      }
    );
  });
};
