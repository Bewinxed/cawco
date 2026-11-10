/**
 * When the person last sent a prompt in a stored transcript file, read
 * backward from its end: what a stored transcript is placed by in the
 * dashboard's Recent (core `NeutralSessionInfo.wroteAt`), as a listed
 * session is placed by its own `wroteAt`. An agent's reply never moves it;
 * the file's change time moves on every write.
 *
 * Each harness says which record is a prompt and when it was sent
 * (`promptAt`); the read stops at the newest one. A file is read again only
 * once it changes: the answer is kept by path, on the file's size and change
 * time, so relisting an unchanged transcript reads none of it. The read
 * steps back {@link STEP_BYTES} at a time (a transcript's last prompt is
 * nearly always in its last few kilobytes) and keeps only the records of the
 * step it is in, so a long run of tool calls after the prompt costs reading
 * those bytes and no more. The SDK's listing reads each transcript's last
 * 64 KiB already (claude.ts `transcriptEnds`); a step that size reads what
 * it reads.
 */
import {
  type BytePrefilter,
  fileStamp,
  type LocatedRecord,
  ReverseReader,
  type TranscriptRecord,
} from "@cawco/jsonl-parser";

/** Bytes read back a step: the 64 KiB end the SDK's own listing reads. */
const STEP_BYTES = 64 * 1024;

/** An answer kept for a file as it stood. */
interface Kept {
  at: number | undefined;
  mtimeMs: number;
  size: number;
}

/**
 * Every file's answer, by path. One small entry a transcript the machine
 * lists (a path and three numbers), so it is never trimmed: a deleted file's
 * entry stays until the agent restarts.
 */
const kept = new Map<string, Kept>();

/**
 * The newest record of the file at `path` that `promptAt` gives a time for,
 * and that time (ms epoch); undefined when it holds none or is gone.
 * `prefilter` passes the lines a prompt can be on, before any is parsed.
 */
export async function lastPromptAt(
  path: string,
  prefilter: BytePrefilter,
  promptAt: (record: TranscriptRecord) => number | undefined
): Promise<number | undefined> {
  let stamp: { mtimeMs: number; size: number };
  try {
    stamp = await fileStamp(path);
  } catch {
    kept.delete(path);
    return;
  }
  const held = kept.get(path);
  if (held && held.mtimeMs === stamp.mtimeMs && held.size === stamp.size) {
    return held.at;
  }
  let at: number | undefined;
  try {
    at = await newestPrompt(path, prefilter, promptAt);
  } catch {
    // Gone or unreadable as it was read: no answer, and none kept.
    return;
  }
  kept.set(path, { ...stamp, at });
  return at;
}

async function newestPrompt(
  path: string,
  prefilter: BytePrefilter,
  promptAt: (record: TranscriptRecord) => number | undefined
): Promise<number | undefined> {
  const reader = new ReverseReader(path, {
    prefilter,
    chunkBytes: STEP_BYTES,
    maxBytes: Number.POSITIVE_INFINITY,
  });
  for (;;) {
    await reader.more(1);
    // This step's records, newest last; the steps after it were let go.
    const step = reader.records;
    reader.records = [];
    for (let i = step.length - 1; i >= 0; i -= 1) {
      const at = promptAt((step[i] as LocatedRecord).record);
      if (at !== undefined) {
        return at;
      }
    }
    if (reader.spent) {
      return;
    }
  }
}

/** An ISO time a record carries, as ms epoch; undefined when it carries none that parses. */
export const timeOf = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value !== "string") {
    return;
  }
  const at = Date.parse(value);
  return Number.isNaN(at) ? undefined : at;
};
