/**
 * A session's transcript as the hub builds it and every client renders it.
 *
 * The hub folds each session's frames into blocks once, as they arrive
 * (`transcript.ts`), and serves them: a page of history over HTTP, and the
 * changes since on the session's Ledger stream (`stream.ts`). A client decodes
 * and draws; it derives nothing.
 *
 * Finished blocks never change. A block can change only while something is
 * still owed to it: a tool call until its result lands, a send until it is read
 * or fails. The live tail — the text and reasoning being streamed, the call in
 * flight — is {@link TranscriptTail}, and is all that moves between frames.
 */
import type {
  NeutralStatus,
  PermissionMode,
  SendRecord,
  SendState,
  SlashCommand,
  UserQuestionResult,
} from "./harness";

/** What a block is: the row kind a renderer draws it as. */
export type BlockType =
  | "user"
  /** A message another session sent — reported speech, never the reader's own. */
  | "user.peer"
  /** A rule that fired — cawco's own standing instruction, never the reader's words. */
  | "user.rule"
  /** A delegate's routed permission ask — plumbing between sessions, folded into its delegate's card. */
  | "user.delegate_ask"
  | "assistant"
  | "thinking"
  | "tool.use"
  /** This session handing work to another one. */
  | "tool.handoff"
  | "tool.result"
  | "tool.progress"
  | "result.success"
  | "result.error"
  /**
   * Not a row: the place a send was read at, or stored at, among the
   * harness's own rows. The builder draws the send's row there from its
   * record; no client ever sees one.
   */
  | "send.ref"
  | `system.${string}`
  | `ui.${string}`;

/** The MCP servers and tools an `init` announced. */
export interface BlockTooling {
  servers: { name: string; status: string }[];
  tools: string[];
}

/** Everything a renderer may need beyond `content`, keyed by the kind that uses it. */
export interface BlockMetadata {
  /** A `system.account_move`: what the hub did at the session's account's limit. */
  accountMove?: import("./accounts").AccountMove;
  /** A `user.delegate_ask`'s display label, e.g. `cawco#506dfafb`. */
  askLabel?: string;
  /** A `user.delegate_ask`'s hub permission requestId — what it waits on to be answered. */
  askRequestId?: string;
  /**
   * What the reader attached to the turn: texts, parsed back out of its
   * `<pasted-text>` blocks, and files, out of its `Attached file:` lines.
   */
  attachments?: Array<
    | { kind: "text"; name: string; content: string }
    | import("./attachments").ShownFile
  >;
  compactError?: string;
  /**
   * A compaction boundary read back from a harness that stores how it ended
   * (opencode): `failed` with the harness's words in `compactError`.
   */
  compactResult?: "success" | "failed";
  /**
   * A send that is the message a session went on from in a fresh
   * conversation (origin {@link import("./harness").CONTINUATION_ORIGIN}):
   * drawn folded under the `continued` line before it, never as a turn.
   */
  continuation?: true;
  cwd?: string;
  /** The delegate a `tool.handoff` started, read once off its result. */
  delegateInstanceId?: string;
  /** The delegate's brief headline, carried beside {@link delegateInstanceId}. */
  delegateTitle?: string;
  /**
   * A failure card's heading (`ui.error`, `ui.session_error`); a missing
   * session's when unset on a session error, "Turn failed" otherwise.
   */
  errorTitle?: string;
  exitCode?: number;
  handoffBrief?: string;
  handoffKind?: "handoff" | "start" | "delegate";
  hookName?: string;
  /** A stored transcript can name an image it no longer carries, hence the optional src. */
  images?: Array<{ mediaType: string; src?: string }>;
  isRedactedThinking?: boolean;
  model?: string;
  /** Harness-injected user-role content (task notifications, reminders, compaction). */
  noteKind?: string;
  /** A task notification's Task `tool_use_id` — folds the note into its branch. */
  noteTaskToolId?: string;
  noteTitle?: string;
  numTurns?: number;
  /** Its display name, as the sender's host asserted it. */
  peerName?: string;
  /** The sender's host-openable session, so the card can link back to it. */
  peerSession?: string;
  /** `init` only, and re-reported every turn: what the session answers tools with. */
  permissionMode?: PermissionMode;
  preTokens?: number;
  /** Set when a `user.peer` is a delegate's auto-report rather than a hand-off. */
  reportKind?: "report" | "failed";
  result?: string;
  resultErrors?: string[];
  /** Images returned by the tool, as the hub's media references. */
  resultImages?: Array<{ mediaType: string; src: string }>;
  resultSubtype?: string;
  /** A `user.rule`'s rule name, read off its `[Rule: <name>]` marker line. */
  ruleName?: string;
  /** Why a send did not go: its record's reason. */
  sendFailed?: string;
  sessionId?: string;
  /** `init` only: which of the commands are skills rather than commands. */
  skills?: string[];
  /** `init` only: what this session answers behind `/`, without the leading slash. */
  slashCommands?: string[];
  subagentDescription?: string;
  /** The `model` override the spawn input asked for, when present. */
  subagentModel?: string;
  subagentType?: string;
  subtype?: string;
  thinking?: string;
  /**
   * How long the thinking block ran, measured by the hub's clock between the
   * block opening and its settled message. Preferred over transcript
   * adjacency, which reads 0 when thinking and a tool call land in one frame.
   */
  thinkingDurationMs?: number;
  thinkingSignature?: string;
  /** The unified file diff returned by an apply_patch call. */
  toolDiff?: string;
  toolId?: string;
  toolInput?: Record<string, unknown>;
  /** `init` only: the MCP servers and tools behind the `/` palette. */
  tooling?: BlockTooling;
  toolName?: string;
  toolResult?: string;
  toolStatus?: "pending" | "success" | "error";
  /** The reader's answers to an `AskUserQuestion`, normalised by the harness adapter. */
  toolUseResult?: UserQuestionResult;
  totalCost?: number;
  trigger?: "manual" | "auto";
  /** A send made urgently (`SendRecord.mode`): into the running turn, or ahead of it. */
  urgent?: true;
  /** Set when a `user.peer` is a workflow's notice: what happened, e.g. `step Build failed`. */
  workflowEvent?: string;
}

/** One row of a transcript, as the hub built it. */
export interface TranscriptBlock {
  content: string;
  /**
   * Stable for the life of the transcript, on every screen and after every
   * reload: the harness's uuid for the frame it came from (one assistant frame
   * is several blocks, `<uuid>:<index>`), a send's uuid, `task:<id>` for a
   * task line — and a hash of the frame for the few that carry no uuid.
   */
  id: string;
  instanceId: string;
  metadata?: BlockMetadata;
  /** The Task call whose subagent said this. Absent on the main transcript. */
  parentToolUseId?: string;
  /** A send not read yet ({@link TranscriptPage.queued}). */
  queued?: boolean;
  /** The harness's own uuid for the frame — the handle for rewind and fork. */
  sdkUuid?: string;
  /** A send's row: where its record stands. */
  state?: Exclude<SendState, "replaced">;
  /**
   * When the turn happened, ISO-8601. A send: when the hub accepted it.
   * Anything else: when the harness stored its record. Absent when the
   * harness gives none — an invented clock would date a row by when it was read.
   */
  timestamp?: string;
  toolCallId?: string | null;
  type: BlockType;
}

/**
 * A subagent's branch: the Task call it hangs under, and how far it has got.
 * Its blocks are the blocks whose `parentToolUseId` is {@link toolUseId}.
 */
export interface TranscriptBranch {
  completedAt?: string;
  description?: string;
  error?: string;
  instanceId: string;
  /** When the last branch event arrived, ISO-8601, for recency sorting. */
  lastEventAt?: string;
  lastToolName?: string;
  /** Model that answered (wire id from assistant frames), or the requested alias until the first frame arrives. */
  model?: string;
  result?: string;
  startedAt: string;
  status: "starting" | "running" | "complete" | "error";
  subagentType: string;
  /** `agentProgressSummaries`' present-tense line, when enabled. */
  summary?: string;
  /** The task the `task_*` progress messages report under. */
  taskId?: string;
  /** The Task tool.use id that spawned this subagent. */
  toolUseId: string;
}

/** The tool a session is running right now — the fleet view's glance line. */
export interface ToolGlance {
  glance: string;
  name: string;
  toolId: string;
}

/**
 * The live tail: what the turn is doing between frames. The one part of a
 * transcript that moves token by token.
 */
export interface TranscriptTail {
  /** A turn is in flight, as the frames show it. */
  busy: boolean;
  /** The main loop's tool in flight, cleared by its result or the turn's end. */
  currentTool: ToolGlance | null;
  /** Which content block the main loop has open right now, from the partials. */
  openBlock: "thinking" | "text" | "tool" | null;
  /** Partial assistant text of the main loop, between partials and the final message. */
  streaming: string;
  /** Partial assistant text, per subagent branch, by its Task call id. */
  streams: Record<string, string>;
  /** The SDK signed the thinking block: it is wrapping up, not still going. */
  thinkingClosing: boolean;
  /** When the open thinking block started, epoch ms, by the hub's clock. */
  thinkingSince: number | null;
  /** What the open thinking block has reasoned so far. */
  thinkingStream: string;
}

/** What the session has said about itself, kept beside its blocks. */
export interface TranscriptFacts {
  /** The `/` menu: names as the session lists them, which are skills, and their details once pushed. */
  commands: {
    names: string[];
    skills: string[];
    detailed: SlashCommand[] | null;
  };
  /** The harness the frames came from. */
  harness: string | null;
  /** The transcript has turns in it: the session has already started. */
  initialized: boolean;
  /** How many `init`s this transcript has seen since the hub built it. */
  inits: number;
  /** What the last compaction did, from the frames that reported it. */
  lastCompaction: {
    at: number;
    preTokens: number;
    trigger: "manual" | "auto";
    result?: "success" | "failed";
    error?: string;
  } | null;
  /** The last turn came back an error — the SDK's `is_error`. */
  lastTurnFailed: boolean;
  /** Which model answers the next turn, by the newest `init` or fallback. */
  model: string | null;
  /** How the session answers tool permissions, by the newest `init`. */
  permissionMode: PermissionMode | null;
  /** The session's own word on what it is doing: `compacting`, `requesting`, or nothing. */
  sdkStatus: NeutralStatus;
  /** The harness session key the newest `init` named. */
  sessionId: string | null;
  /** The servers and tools the newest `init` announced. */
  tooling: BlockTooling | null;
  /** The cumulative cost the latest `result` reported, in dollars. */
  totalCost: number | null;
  /** How many turns have ended since the hub built this transcript. */
  turnsEnded: number;
}

/**
 * One change to a transcript, in the order the hub made it. Applied in
 * sequence to the page a client fetched, it gives exactly the blocks the hub
 * holds.
 */
export type TranscriptEvent =
  /** A new block at the end of the main transcript, or of its branch's. */
  | { type: "block.append"; block: TranscriptBlock }
  /** A send's row placed after the block `after` (null: first of all). */
  | { type: "block.insert"; block: TranscriptBlock; after: string | null }
  /** A block still owed something got it: the same id, new fields. */
  | { type: "block.update"; block: TranscriptBlock }
  /** A block that is no longer drawn: a send moved or replaced. */
  | { type: "block.remove"; id: string }
  /** The sends waiting to be read, oldest first — the whole list. */
  | { type: "queue"; blocks: TranscriptBlock[] }
  /** A subagent branch, as it stands now. */
  | { type: "branch"; branch: TranscriptBranch }
  /** The tail's fields this change moved. */
  | { type: "tail"; tail: Partial<TranscriptTail> }
  /** Text streamed onto the tail: the main loop's, a branch's, or reasoning. */
  | {
      type: "tail.append";
      streaming?: string;
      thinking?: string;
      branch?: { toolUseId: string; text: string };
    }
  /** The facts this change moved. */
  | { type: "facts"; facts: Partial<TranscriptFacts> }
  /** The hub's record of a send, as it moved: what a client's own copy gives way to. */
  | { type: "send"; record: SendRecord }
  /** The transcript was read again from the machine: fetch the newest page. */
  | { type: "reset" };

/** A subagent branch with its own blocks, as a page carries it. */
export type TranscriptPageBranch = TranscriptBranch & {
  blocks: TranscriptBlock[];
};

/**
 * One page of a session's transcript, newest first. The newest page carries
 * the live state too, and the stream position it is consistent with: a client
 * subscribes with `afterSeq: seq` and applies the events after it.
 */
export interface TranscriptPage {
  /** The main transcript's blocks on this page, oldest first. */
  blocks: TranscriptBlock[];
  /** The branches whose Task call is on this page, each with its blocks. */
  branches: TranscriptPageBranch[];
  /** Pass as `before` for the page older than this; null at the conversation's start. */
  cursor: string | null;
  /** Newest page only: what the session has said about itself. */
  facts?: TranscriptFacts;
  /** Newest page only: the sends waiting to be read. */
  queued?: TranscriptBlock[];
  /** Newest page only: the stream position this page is consistent with. */
  seq?: number;
  /** Newest page only: the live tail. */
  tail?: TranscriptTail;
  /** Where the transcript lives. */
  where: TranscriptWhere;
}

/** Where a transcript was found: the machine, folder, key and harness. */
export interface TranscriptWhere {
  cwd: string;
  harness: string;
  machineId: string;
  sessionKey: string;
}

/** A transcript event batch, as it rides a session's Ledger stream. */
export interface TranscriptStreamFrame {
  events: TranscriptEvent[];
  instanceId: string;
  kind: "transcript";
}
