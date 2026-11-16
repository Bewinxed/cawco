/**
 * THE HUB'S END OF A BROKEN LAW (core invariant.ts). A law the hub catches
 * broken is logged by name (`[law] …`) and goes to agents as a defect task
 * (law-tasks.ts). What it was found in goes no further: a board row is left
 * out, a send fails on its row, a transcript is read again, a request fails
 * in plain words (server.ts `onError`). It never reaches the person's screen
 * as a law: what he was doing fails in its own place, as any failure does.
 * The hub itself carries on, because one hub is the operator's only view of
 * the fleet.
 */
import {
  type InvariantBroken,
  invariant,
  isInvariantBroken,
  type Law,
  type LawAbout,
} from "@cawco/core/invariant";
import { hubFailureWords } from "@cawco/core/words/hub-failure";
import { HTTPError, problem } from "elysia";

/**
 * A law broken answering a request, as the request fails: Elysia's own
 * thrown problem (as machine-answers.ts `MachineProblem` is), a 500 in plain
 * words, the same in a dev hub as in the shipped one. The law's own words
 * went to the log and its task; they are never the answer.
 */
class LawProblem extends HTTPError {
  readonly type = "about:blank";
  constructor(message: string, options: { cause: InvariantBroken }) {
    super(message, options);
    this.name = "LawProblem";
  }
  override value() {
    return problem(500, {
      code: "hub-fault",
      detail: hubFailureWords.lawBroken,
    });
  }
}

export function createLaws() {
  /** Who takes each break once the hub's tasks exist ({@link fileWith}). */
  let filer: ((error: InvariantBroken) => void) | undefined;
  /** Breaks caught before there was a filer: the board's first read at boot runs before the tasks are made. */
  const early: InvariantBroken[] = [];

  /** Logs `error`'s law by name and hands it to the filer. */
  const caught = (error: InvariantBroken): void => {
    console.error(`[law] ${error.message}`);
    if (filer) {
      filer(error);
      return;
    }
    early.push(error);
  };

  return {
    /** Hands each break to `file` from now on, those caught before it first. */
    fileWith: (file: (error: InvariantBroken) => void): void => {
      filer = file;
      for (const error of early.splice(0)) {
        file(error);
      }
    },
    /**
     * `read`'s answer; undefined when a law broke inside it, which is logged
     * and filed. Anything else it throws is thrown on.
     */
    hold: <T>(read: () => T): T | undefined => {
      try {
        return read();
      } catch (error) {
        if (!isInvariantBroken(error)) {
          throw error;
        }
        caught(error);
        return undefined;
      }
    },
    /**
     * Whether law `law` holds (`cond`), for a frame about to go or a timer's
     * work: broken, it is logged and filed, and the caller sends nothing.
     */
    holds: (
      cond: unknown,
      law: Law,
      words: string | (() => string),
      about?: () => LawAbout
    ): boolean => {
      try {
        invariant(cond, law, words, about);
        return true;
      } catch (error) {
        if (!isInvariantBroken(error)) {
          throw error;
        }
        caught(error);
        return false;
      }
    },
    /**
     * `read`'s answer, for a request: a law broken inside it is logged and
     * filed, and thrown on as a {@link LawProblem}, so the request fails in
     * plain words. Anything else it throws is thrown on as it is.
     */
    raise: <T>(read: () => T): T => {
      try {
        return read();
      } catch (error) {
        if (!isInvariantBroken(error)) {
          throw error;
        }
        caught(error);
        throw new LawProblem(hubFailureWords.lawBroken, { cause: error });
      }
    },
  };
}
