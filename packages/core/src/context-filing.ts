/**
 * A session's context filling up, as the hub answers it: once a turn ends
 * with its context within its compaction policy's {@link
 * import("./accounts").Compaction.fileRoom} of the point where its harness
 * compacts it on its own (harness.ts `NeutralResultMessage.compactsAt`),
 * the session takes one turn to file its open items into its records (hub
 * at-limit.ts `fileDue`, compaction.ts `fileAtThreshold`), and its harness
 * compacts it later on its own. What the person reads of it is the hub's
 * {@link ContextLine}s in its transcript.
 */
import type { HarnessKind } from "./harness/kinds";

/** A session's context as its harness last reported it, and where that harness compacts it on its own: the reading a filing fired at. */
export interface ContextFill {
  compactsAt: number;
  tokens: number;
}

/**
 * Where a filing at the threshold stands: its turn runs (`filing`), it
 * ended (`filed`), or it ended before its turn did (`stopped`: an
 * interrupt, a stop, a refused send, its account's limit).
 */
export type FilingStage = "filing" | "filed" | "stopped";

/**
 * What a session's records held as its filing at the threshold started,
 * each record one line to compare (hub open-items.ts `recordsOf`): its
 * plan's steps (status and words), when its spec was written, its task's
 * to-dos and its open filed tasks' (task, place, tick and words), the ids
 * of its open filed tasks and of its notes in its project's memory inbox.
 * Kept with the filing's plan (hub schema `limitCompactions.records`), so a
 * hub that restarts mid-filing still counts what it wrote.
 */
export interface FiledRecords {
  notes: string[];
  /** When its spec was written, ISO 8601; null while it has none. */
  spec: string | null;
  steps: string[];
  tasks: string[];
  todos: string[];
}

/**
 * What a filing at the threshold wrote: each kind of record, counted where
 * it is new or changed since the filing started (hub open-items.ts
 * `filingWrote`). All zero: its turn wrote nothing new.
 */
export interface FilingWrote {
  /** Notes it put in its project's memory inbox. */
  notes: number;
  /** Whether it wrote its spec again. */
  spec: boolean;
  /** Its plan's steps written new or changed, a step closed included. */
  steps: number;
  /** Tasks it filed. */
  tasks: number;
  /** To-dos written new or changed, on its task or a task it filed. */
  todos: number;
}

/**
 * One of the hub's lines in a session's transcript about its context (core
 * `CONTEXT_LINE`), stored as JSON in the line's `content`, each naming the
 * session's harness:
 *
 * - `filing`: its context reached the policy's threshold and it files its
 *   open items; said again in its place as that ends, once filed with what
 *   the filing wrote (`wrote`: absent while it runs, once stopped, and when
 *   what its records held as it started is unknown).
 * - `compacted`: its harness compacted it, and whether a filing came since
 *   its compaction before (`filed`, that filing's stage; null when none);
 *   said again as `failed` when the compaction failed after its boundary.
 */
export type ContextLine =
  | {
      kind: "filing";
      fill: ContextFill;
      harness: HarnessKind;
      stage: FilingStage;
      wrote?: FilingWrote;
    }
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
