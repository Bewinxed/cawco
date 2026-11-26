/** What the session supervisor and its neighbours say in the agent's log. */

import { Effect } from "effect";
import { runSync } from "./daemon-runtime";

/** The words of whatever was thrown. */
export const errorText = (problem: unknown): string =>
  (problem instanceof Error ? problem.message : String(problem))
    .replace(/\s+/gu, " ")
    .trim();

/** `message` said as a warning, under the supervisor's name when it names no area of its own. */
export const warn = (message: string): void => {
  runSync(
    Effect.logWarning(
      message.startsWith("[") ? message : `[supervisor] ${message}`
    )
  );
};
