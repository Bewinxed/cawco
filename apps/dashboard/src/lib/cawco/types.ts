/**
 * The transcript shape the renderers consume: the hub's blocks (`@cawco/core`,
 * `TranscriptBlock`), plus what only this tab knows — its own sends before the
 * hub has them, and its own failure lines.
 */
import type {
  BlockMetadata,
  BlockType,
  DelegateEvent,
  SendState,
  TranscriptBlock,
} from "@cawco/core";
import type { SubagentState } from "#lib/utils/flow-types.js";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

export type MessageType = BlockType;

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
  | "sending"
  | "unreached"
  | Exclude<SendState, "replaced">;

/** A block's metadata, and what this tab's own rows carry beside it. */
export interface MessageMetadata extends BlockMetadata {
  /** A folded command line's command (SystemLine). */
  command?: string;
  /** A project's Caw's turn: the project folder's files it wrote, drawn as chips under it. */
  files?: string[];
  /** A project's Caw's turn: the tasks it is about (`tsk-12`), drawn as cards under it. */
  tasks?: string[];
}

/** The two kinds a card renders directly; an answer only settles its ask. */
export type DelegateAskEvent = Extract<DelegateEvent, { kind: "ask" }>;
export type DelegateReportEvent = Extract<DelegateEvent, { kind: "report" }>;

/**
 * One row of the session view: consecutive tool calls collapse into a group, a
 * Task call becomes the branch it spawned, everything else stands alone. Shared
 * because the transcript renders these and the in-app search reads them.
 */
export type TranscriptGroup =
  | { kind: "single"; message: Message; index: number }
  | { kind: "tools"; messages: Message[]; index: number }
  | { kind: "subagent"; branch: SubagentState; spawn: Message; index: number };
