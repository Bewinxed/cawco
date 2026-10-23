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

/** A deadline's timer this late ran in a process that was held (its loop blocked, or the machine starved it). */
const HELD_LATE_MS = 1000;
/** How long a held process reads what came due meanwhile before a late deadline decides. */
const CATCH_UP_MS = 1000;
/** Each look while it catches up. */
const CATCH_UP_STEP_MS = 10;

/**
 * Runs `read` with `ms` to answer. The read gets a signal that aborts when
 * the time is up (or when `options.signal` aborts) and hands it to whatever
 * it waits on: a fetch, a spawn, a socket. Answers `answered` with what the
 * read returned, or `unanswered` when the time ran out or the read threw
 * {@link Gone}. Any other error the read throws is its own and is thrown on,
 * as is the abort of `options.signal`: a caller that let go did not run out
 * of time.
 *
 * A deadline whose timer ran {@link HELD_LATE_MS} or more late found this
 * process held, and decides nothing until what came due meanwhile is read:
 * Bun runs a timer that came due while its loop was held before it reads
 * the sockets, so an answer that arrived in time waits behind the deadline.
 * Up to {@link CATCH_UP_MS} more is given, looked at every
 * {@link CATCH_UP_STEP_MS}. 2026-10-23 19:33, obelisk: the agent's loop held
 * ~75 s (its 10 s bounds said "within 84 s"), and 317 session starts were
 * stopped because the hub's answer to each credential's ACK lay unread.
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
    let settled = false;
    const giveUp = () => {
      if (settled) {
        return;
      }
      deadline.abort(
        new DOMException(`no answer within ${ms} ms`, "TimeoutError")
      );
      resolve({ kind: "unanswered", after: elapsed(), reason: "timeout" });
    };
    let timer = setTimeout(() => {
      if (elapsed() - ms < HELD_LATE_MS) {
        giveUp();
        return;
      }
      const until = performance.now() + CATCH_UP_MS;
      const look = () => {
        if (settled) {
          return;
        }
        if (performance.now() >= until) {
          giveUp();
          return;
        }
        timer = setTimeout(look, CATCH_UP_STEP_MS);
      };
      timer = setTimeout(look, CATCH_UP_STEP_MS);
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
        settled = true;
        clearTimeout(timer);
        resolve({ kind: "answered", value });
      },
      (error: unknown) => {
        settled = true;
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
