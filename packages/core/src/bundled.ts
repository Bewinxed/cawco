/**
 * `Bun.build` for every bundle CawCo makes: the runtime hosts, the stage,
 * the overlay, the release binary and a probe's own page. Bun 1.4.3 throws
 * on a failed build (it never answers `success: false`), and what it throws
 * is an AggregateError whose whole message is "Bundle failed", with no
 * stack: the bundler's messages are on its `errors` alone, so a log or a
 * probe that prints the error says nothing more. It is said again here,
 * naming the bundle and each message with its file, line and column.
 */

import { isRecord } from "./is-record";

/** One bundler message in words, with its place in the source when it has one. */
const logSaid = (log: unknown): string => {
  if (!isRecord(log)) {
    return String(log);
  }
  const { position, message } = log;
  const at = isRecord(position)
    ? `${String(position.file)}:${String(position.line)}:${String(position.column)}: `
    : "";
  return `${at}${typeof message === "string" ? message : String(log)}`;
};

/** `what`'s bundle built from `config`; a failure throws "<what>'s build failed: <file>:<line>:<column>: <message>; …". */
export async function bundled(
  what: string,
  config: Bun.BuildConfig
): Promise<Bun.BuildOutput> {
  try {
    return await Bun.build(config);
  } catch (error) {
    const logs = error instanceof AggregateError ? error.errors : [error];
    throw new Error(`${what}'s build failed: ${logs.map(logSaid).join("; ")}`, {
      cause: error,
    });
  }
}
