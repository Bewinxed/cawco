/**
 * THE HUB'S END OF A BROKEN LAW (core invariant.ts). A law the hub catches
 * broken fails the frame or the request it was found in, is logged by name,
 * and is raised as a red notice on every dashboard, until the hub restarts:
 * a broken law is a programmer's error, and it stays in front of the operator
 * until it is fixed. The hub itself carries on, because one hub is the
 * operator's only view of the fleet.
 *
 * The list goes out on a frame of its own (`laws.broken`), on each break and
 * to each dashboard as it connects, never on the board's frame: the board's
 * frame may be the one a law failed.
 */
import {
  type InvariantBroken,
  isInvariantBroken,
  LAWS,
  type Law,
  type LawBroken,
} from "@cawco/core";

export function createLaws(options: {
  /** Sends every law caught broken so far to every dashboard. */
  broadcast: (broken: LawBroken[]) => void;
}) {
  const broken = new Map<Law, LawBroken>();

  /** Logs `error`'s law by name, keeps it, and tells every dashboard. */
  const caught = (error: InvariantBroken): void => {
    console.error(`[law] ${error.message}`);
    const now = Date.now();
    const before = broken.get(error.law);
    broken.set(error.law, {
      law: error.law,
      statement: LAWS[error.law],
      words: error.words,
      at: before?.at ?? now,
      lastAt: now,
      count: (before?.count ?? 0) + 1,
    });
    options.broadcast([...broken.values()]);
  };

  return {
    /** Every law caught broken since the hub started, for a dashboard that connects. */
    broken: (): LawBroken[] => [...broken.values()],
    /**
     * `read`'s answer; undefined when a law broke inside it, which is logged
     * and raised. Anything else it throws is thrown on.
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
     * `read`'s answer, for a request: a law broken inside it is logged and
     * raised, and thrown on, so the request fails with the law's name and
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
