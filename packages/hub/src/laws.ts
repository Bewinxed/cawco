/**
 * THE HUB'S END OF A BROKEN LAW (core invariant.ts). A law the hub catches
 * broken fails the frame or the request it was found in, is logged by name
 * (`[law] …`), and goes to agents as a defect task (law-tasks.ts). It never
 * reaches the person's screen as a law: what he was doing fails in its own
 * place, in plain words, as any failure does. The hub itself carries on,
 * because one hub is the operator's only view of the fleet.
 */
import {
  type InvariantBroken,
  invariant,
  isInvariantBroken,
  type Law,
  type LawAbout,
} from "@cawco/core/invariant";

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
     * filed, and thrown on, so the request fails with the law's name and
     * the facts.
     */
    raise: <T>(read: () => T): T => {
      try {
        return read();
      } catch (error) {
        if (isInvariantBroken(error)) {
          caught(error);
        }
        throw error;
      }
    },
  };
}
