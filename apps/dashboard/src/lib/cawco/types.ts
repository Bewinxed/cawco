/**
 * The transcript shape the renderers consume: the hub's blocks (`@cawco/core`,
 * `TranscriptBlock`), plus what only this tab knows — its own sends before the
 * hub has them, and its own failure lines.
 */
import type {
  BlockMetadata,
  DelegateEvent,
  SendState,
  TranscriptBlock,
} from "@cawco/core";

type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

/**
 * One row of a transcript: a block the hub built, or one this tab drew itself
 * (a send on its way, a failure it saw).
 */
export type Message = Omit<TranscriptBlock, "state" | "metadata"> & {
  metadata?: MessageMetadata;
  /**
   * Where a message sent to the session stands. From its record, the hub's
   * word: waiting for the harness (`pending`), taken up by it (`read`), or
   * never going to be (`failed`). Before the hub has taken it, this tab's
   * own: on its way (`sending`), or it never reached the hub (`unreached`).
   * Absent on everything that is not a send.
   */
  state?: SendRowState;
};

/**
 * A send's row state: its record's (`SendState`, core) — a replaced send is
 * no row — or, before the hub has it, this tab's own.
 */
export type SendRowState =
  "sending" | "unreached" | Exclude<SendState, "replaced">;

/** A block's metadata, and what this tab's own rows carry beside it. */
export interface MessageMetadata extends BlockMetadata {
  /** A folded command line's command (SystemLine). */
  command?: string;
}

/** The two kinds a card renders directly; an answer only settles its ask. */
export type DelegateAskEvent = Extract<DelegateEvent, { kind: "ask" }>;
export type DelegateReportEvent = Extract<DelegateEvent, { kind: "report" }>;
