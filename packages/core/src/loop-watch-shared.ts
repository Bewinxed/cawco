/**
 * What a process's loop and its watch on a thread of its own share
 * (loop-watch.ts `watchFromItsOwnThread`, loop-watch-worker.ts).
 */
import { z } from "zod";

/**
 * A loop held this long ends its process (loop-watch-worker.ts): the watch
 * says why, keeps what it read in `record`, and kills the process, whose
 * supervisor starts it again.
 */
export interface LoopEnd {
  /** How long the loop may be held before the process is ended, in ms. */
  afterMs: number;
  /** Where what the watch read goes, for the next process to say ({@link LoopEnded}). */
  record: string;
}

/** What a watch that ended its process kept, for the process after it to say. */
export const LoopEndedSchema = z.object({
  /** When it ended the process (ms epoch). */
  at: z.number(),
  /** The work the loop started last, as it named it (`doing`). */
  doing: z.string(),
  /** How long the loop had been held, in ms. */
  heldMs: z.number(),
  /** The process's memory, as `/proc` said it; empty off Linux. */
  memory: z.string(),
  /** The process's id. */
  pid: z.number(),
  /** The main thread, as `/proc` said it; empty off Linux. */
  thread: z.string(),
  /** Whose loop: "agent", "hub". */
  who: z.string(),
});
export type LoopEnded = z.infer<typeof LoopEndedSchema>;

/** What the loop posts its watch. */
export type WatchdogMessage =
  | {
      kind: "start";
      beat: SharedArrayBuffer;
      doing: SharedArrayBuffer;
      end?: LoopEnd;
      port: number;
      who: string;
    }
  | { kind: "section"; id: number; name: string }
  | { kind: "state"; flying: string; phase: string };

/** The shared memory's slots: the loop's beat (ms epoch), the last marked section's id (-1 for none), and 1 once it was left. */
export const BEAT = 0;
export const SECTION = 1;
export const LEFT = 2;

/**
 * The bytes the work the loop started last is named in (`doing`), its
 * length first (a 32-bit count), then its UTF-8; a longer name is cut.
 */
export const DOING_BYTES = 1024;

/** The name the loop wrote last into `doing`'s memory. */
export const readDoing = (buffer: SharedArrayBuffer): string => {
  const length = Math.min(
    new Int32Array(buffer, 0, 1)[0] ?? 0,
    DOING_BYTES - 4
  );
  // A copy: TextDecoder refuses a view of shared memory.
  return new TextDecoder().decode(new Uint8Array(buffer, 4, length).slice());
};
