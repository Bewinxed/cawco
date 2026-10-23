/**
 * Every request the hub sent this machine under an id (a `control`, `spawn`
 * or `fs` envelope's `requestId`), and its answer once it has one: what
 * makes the hub's word "sent again under the same id" safe. A link that
 * drops mid-request no longer fails it: the hub holds it and sends it again
 * on this machine's next register (hub server.ts `resendHeld`). Here an id
 * seen before is never run again: one with its answer kept is answered with
 * it, one still running answers when it ends (through whatever socket is up
 * then), and one this agent's last process was running when it ended is
 * answered that it was not run again. Workspace creates and archives, inputs
 * written and a landing gate's commands so run once however often the
 * request comes.
 *
 * Kept on disk (`requests.json` in CawCo's data dir), so a restart of this
 * agent still knows what it ran: written within {@link WRITE_AFTER_MS} of
 * each change. Bounded: the newest {@link REQUESTS_KEPT} ids, and answers up
 * to {@link ANSWER_CHARS_KEPT} characters of JSON in all, in memory; on disk,
 * the ids and the answers of up to {@link ANSWER_CHARS_ON_DISK} each.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ControlResultFrame as ControlResult } from "@cawco/core";
import { AGENT_RESTARTED_MID_REQUEST } from "@cawco/core/binary-updates";
import { jsonSizeEstimate } from "@cawco/core/json-stream";
import { cawcoDataDir } from "@cawco/core/paths";
import { writeStateFile } from "@cawco/core/state-file";

/**
 * Ids remembered. Our choice: far more than the requests a hub has in flight
 * to one machine at once (a conductor's lanes, their landings, the reads
 * of every open page), so an id is never forgotten while it can still come
 * again; a request is held no longer than its own deadline, an hour at most.
 */
const REQUESTS_KEPT = 4096;
/** Characters of answers kept in memory in all. Our choice: a few transcripts' worth. */
const ANSWER_CHARS_KEPT = 64 * 1024 * 1024;
/** The longest answer kept on disk. Our choice: every mutation's answer, no read's bulk. */
const ANSWER_CHARS_ON_DISK = 64 * 1024;
/** How soon a change reaches the disk. Our choice: well inside a reconnect's few seconds. */
const WRITE_AFTER_MS = 50;

type Entry =
  | { state: "running" }
  /** `answer` absent: answered, and the answer was too large to keep. */
  | { answer?: ControlResult; chars: number; state: "answered" }
  /** Running in this agent's last process when it ended. */
  | { state: "interrupted" };

const path = (): string => join(cawcoDataDir(), "requests.json");

const entries = new Map<string, Entry>();
let answerChars = 0;

/** What the last process wrote, read once as this one starts: what it ran stays ran. */
const load = (): void => {
  let saved: [string, { answer?: ControlResult; state: string }][];
  try {
    saved = JSON.parse(readFileSync(path(), "utf8"));
  } catch {
    return;
  }
  if (!Array.isArray(saved)) {
    return;
  }
  for (const [id, entry] of saved) {
    if (entry?.state === "answered") {
      const chars = entry.answer ? jsonSizeEstimate(entry.answer) : 0;
      entries.set(id, { state: "answered", answer: entry.answer, chars });
      answerChars += chars;
    } else {
      entries.set(id, { state: "interrupted" });
    }
  }
};
load();

let writing: ReturnType<typeof setTimeout> | undefined;
const persist = (): void => {
  if (writing !== undefined) {
    return;
  }
  writing = setTimeout(() => {
    writing = undefined;
    const saved = [...entries].map(([id, entry]) => [
      id,
      entry.state === "answered"
        ? {
            state: "answered",
            ...(entry.answer && entry.chars <= ANSWER_CHARS_ON_DISK
              ? { answer: entry.answer }
              : {}),
          }
        : { state: entry.state },
    ]);
    writeStateFile(path(), JSON.stringify(saved)).catch((error: unknown) =>
      console.warn(
        `[requests] ${path()} could not be written: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }, WRITE_AFTER_MS);
};

/** The oldest ids, and their answers, past the bounds go. */
const trim = (): void => {
  for (const [id, entry] of entries) {
    if (entries.size <= REQUESTS_KEPT && answerChars <= ANSWER_CHARS_KEPT) {
      return;
    }
    if (entries.size > REQUESTS_KEPT) {
      entries.delete(id);
      if (entry.state === "answered") {
        answerChars -= entry.chars;
      }
    } else if (entry.state === "answered" && entry.answer) {
      entries.set(id, { state: "answered", chars: 0 });
      answerChars -= entry.chars;
    }
  }
};

const refused = (requestId: string, error: string): ControlResult => ({
  kind: "control_result",
  requestId,
  ok: false,
  error,
});

/**
 * A request as it arrives. `run`: never seen, now running; the caller runs
 * it. `running`: running already; its answer goes when it ends. Otherwise
 * the answer to send for it, without running it again.
 */
export const arrive = (
  requestId: string
): "run" | "running" | ControlResult => {
  const entry = entries.get(requestId);
  if (entry === undefined) {
    entries.set(requestId, { state: "running" });
    trim();
    persist();
    return "run";
  }
  if (entry.state === "running") {
    return "running";
  }
  if (entry.state === "interrupted") {
    return refused(requestId, AGENT_RESTARTED_MID_REQUEST);
  }
  return (
    entry.answer ??
    refused(
      requestId,
      "This machine ran this request once already, and its answer was too large to keep for the time it came again; ask again for a fresh answer."
    )
  );
};

/** A request's answer, as it goes out: kept for the time it comes again. */
export const keepAnswer = (frame: ControlResult): void => {
  const { requestId } = frame;
  const entry = requestId ? entries.get(requestId) : undefined;
  if (!(requestId && entry?.state === "running")) {
    return;
  }
  const chars = jsonSizeEstimate(frame);
  entries.set(requestId, { state: "answered", answer: frame, chars });
  answerChars += chars;
  trim();
  persist();
};
