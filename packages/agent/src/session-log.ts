/** What the session supervisor and its neighbours say in the agent's log. */

import { Effect } from "effect";

/** The words of whatever was thrown. */
export const errorText = (problem: unknown): string =>
  (problem instanceof Error ? problem.message : String(problem))
    .replace(/\s+/gu, " ")
    .trim();

export const warn = (message: string): void => {
  Effect.runFork(Effect.logWarning(message));
};
