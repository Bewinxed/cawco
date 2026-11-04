/**
 * A session's context filling up, as the hub answers it: once a turn ends
 * with its context at its compaction policy's {@link
 * import("./accounts").Compaction.fileAtPct} of its model's window, the
 * session takes one turn to file its open items into its records (hub
 * at-limit.ts `fileDue`, server.ts `fileAtThreshold`), and its harness
 * compacts it later on its own. What the person reads of it is the hub's
 * {@link ContextLine}s in its transcript.
 */
import type { HarnessKind } from "./harness";

/** A session's context as its harness last reported it, against its model's window: the reading a filing fired at. */
export interface ContextFill {
  tokens: number;
  window: number;
}

/**
 * Where a filing at the threshold stands: its turn runs (`filing`), it
 * ended (`filed`), or it ended before its turn did (`stopped`: an
 * interrupt, a stop, a refused send, its account's limit).
 */
export type FilingStage = "filing" | "filed" | "stopped";

/**
 * One of the hub's lines in a session's transcript about its context (core
 * `CONTEXT_LINE`), stored as JSON in the line's `content`:
 *
 * - `filing`: its context reached the policy's threshold and it files its
 *   open items; said again in its place as that ends.
 * - `compacted`: its harness compacted it, and whether a filing came since
 *   its compaction before (`filed`, that filing's stage; null when none);
 *   said again as `failed` when the compaction failed after its boundary.
 */
export type ContextLine =
  | { kind: "filing"; fill: ContextFill; stage: FilingStage }
  | {
      kind: "compacted";
      /**
       * The compaction failed after its harness said its boundary (OpenCode
       * says it as compaction starts): it did not compact.
       */
      failed?: true;
      /** Whether a filing came since its last compaction, and how it ended; null: none did. */
      filed: FilingStage | null;
      harness: HarnessKind;
      /** Its context before it, as the harness reported; null when it said none. */
      tokens: number | null;
      /** Whether the harness compacted on its own (`auto`) or was asked to (`manual`); null when it said neither. */
      trigger: "auto" | "manual" | null;
    };
