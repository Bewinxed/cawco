/**
 * Every request the hub sent this machine under an id (a `control`, `spawn`
 * or `fs` envelope's `requestId`), and its answer once it has one: what
 * makes the hub's word "sent again under the same id" safe. A link that
 * drops mid-request no longer fails it: the hub holds it and sends it again
 * on this machine's next register (hub machine-calls.ts `resendHeld`). Here an id
 * seen before is never run again: one with its answer kept is answered with
 * it, one still running answers when it ends (through whatever socket is up
 * then), and one this agent's last process was running when it ended is
 * answered that it was not run again. Workspace creates and archives, inputs
 * written and a landing's commands so run once however often the
 * request comes.
 *
 * Kept on disk (`requests.jsonl` in CawCo's data dir), so a restart of this
 * agent still knows what it ran: each change appended as one line within
 * {@link WRITE_AFTER_MS}, the last line of an id its state. The file is
 * written whole only once {@link COMPACT_AFTER} lines are appended, as the
 * entries kept then: the whole record, rewritten at every request, was
 * up to 4,096 ids and their answers written and flushed each time one
 * arrived and each time one was answered. Bounded: the newest
 * {@link REQUESTS_KEPT} ids, and answers up to {@link ANSWER_CHARS_KEPT}
 * characters of JSON in all, in memory; on disk, the ids and the answers
 * of up to {@link ANSWER_CHARS_ON_DISK} each.
 */
import { readFileSync } from "node:fs";
import { open, rm } from "node:fs/promises";
import { join } from "node:path";
import { AGENT_RESTARTED_MID_REQUEST } from "@cawco/core/binary-updates";
import { makeFolder } from "@cawco/core/folders";
import type { ControlResultFrame as ControlResult } from "@cawco/core/frames";
import { jsonSizeEstimate } from "@cawco/core/json-stream";
import { cawcoDataDir } from "@cawco/core/paths/roots";
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
/** Lines appended before the file is written whole as the entries kept. Our choice: each id's two lines, twice over. */
const COMPACT_AFTER = 4 * REQUESTS_KEPT;

type Entry =
  | { state: "running" }
  /** `answer` absent: answered, and the answer was too large to keep. */
  | { answer?: ControlResult; chars: number; state: "answered" }
  /** Running in this agent's last process when it ended. */
  | { state: "interrupted" };

/** One line of the file: an id and its state as kept on disk. */
type Line = [string, { answer?: ControlResult; state: string }];

const path = (): string => join(cawcoDataDir(), "requests.jsonl");
/** The whole record earlier agents kept, rewritten at every change: read once, by the first start that keeps lines, and removed once it writes its file whole. */
const formerPath = (): string => join(cawcoDataDir(), "requests.json");

const entries = new Map<string, Entry>();
let answerChars = 0;
/** Lines in the file since it was last written whole. */
let appended = 0;

/** An entry as the file keeps it. */
const lineOf = (id: string, entry: Entry): Line => [
  id,
  entry.state === "answered"
    ? {
        state: "answered",
        ...(entry.answer && entry.chars <= ANSWER_CHARS_ON_DISK
          ? { answer: entry.answer }
          : {}),
      }
    : { state: entry.state },
];

/** A line the last process wrote, taken in: what it ran stays ran. */
const take = ([id, entry]: Line): void => {
  const was = entries.get(id);
  if (was?.state === "answered") {
    answerChars -= was.chars;
  }
  if (entry?.state === "answered") {
    const chars = entry.answer ? jsonSizeEstimate(entry.answer) : 0;
    entries.set(id, { state: "answered", answer: entry.answer, chars });
    answerChars += chars;
  } else {
    entries.set(id, { state: "interrupted" });
  }
};

/** What the last process wrote, read once as this one starts. A line cut short by a crash mid-write is left out. */
const load = (): void => {
  const former: Line[] | null = parsed(readText(formerPath()));
  if (Array.isArray(former)) {
    for (const line of former) {
      take(line);
    }
    appended = COMPACT_AFTER;
  }
  const text = readText(path());
  for (const one of text.split("\n")) {
    const line: Line | null = parsed(one);
    if (Array.isArray(line)) {
      take(line);
      appended += 1;
    }
  }
  // A line cut short would swallow the next one appended: the file is
  // written whole first.
  if (text && !text.endsWith("\n")) {
    appended = COMPACT_AFTER;
  }
};

/** A file's text; none when it is not there. */
const readText = (file: string): string => {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return "";
  }
};

/** `text` as JSON, as its writer here wrote it; none when it is empty or cut short (a crash mid-write). */
const parsed = (text: string) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};
load();
trim();

/** The lines not yet written. */
const pending: Line[] = [];
let writing: ReturnType<typeof setTimeout> | undefined;
/** The writes of the file, one after another. */
let written: Promise<void> = Promise.resolve();

/** Appends `lines` and flushes them; or, past {@link COMPACT_AFTER}, writes the file whole as the entries kept. */
const write = async (lines: Line[]): Promise<void> => {
  if (appended + lines.length > COMPACT_AFTER) {
    const whole = [...entries].map(([id, entry]) => lineOf(id, entry));
    await writeStateFile(
      path(),
      `${whole.map((line) => JSON.stringify(line)).join("\n")}\n`
    );
    appended = whole.length;
    await rm(formerPath(), { force: true });
    return;
  }
  await makeFolder(cawcoDataDir());
  const file = await open(path(), "a", 0o600);
  try {
    await file.writeFile(
      `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`
    );
    await file.datasync();
  } finally {
    await file.close();
  }
  appended += lines.length;
};

/** `id`'s entry as it stands now, on disk within {@link WRITE_AFTER_MS}. */
const persist = (id: string): void => {
  const entry = entries.get(id);
  if (entry) {
    pending.push(lineOf(id, entry));
  }
  if (writing !== undefined) {
    return;
  }
  writing = setTimeout(() => {
    writing = undefined;
    const lines = pending.splice(0);
    written = written
      .then(() => write(lines))
      .catch((error: unknown) =>
        console.warn(
          `[requests] ${path()} could not be written: ${error instanceof Error ? error.message : String(error)}`
        )
      );
  }, WRITE_AFTER_MS);
};

/** The oldest ids, and their answers, past the bounds go. */
function trim(): void {
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
}

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
    persist(requestId);
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
  persist(requestId);
};
