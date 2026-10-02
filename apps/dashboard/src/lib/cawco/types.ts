/**
 * The transcript shape the ported renderers consume. It is a *view* type, not a
 * protocol type: frames arrive as SDK messages (`@cawco/core`) and `frames.ts`
 * folds them into these. Anything that describes the wire belongs in the SDK.
 */
import type {
  AvailableCommand,
  DelegateEvent,
  NeutralStatus,
  NeutralSystemMessage,
  SendState,
  SessionTooling,
  UserQuestionResult,
} from "@cawco/core";
import type { SubagentState } from "$lib/utils/flow-types";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

export type MessageType =
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
   * harness's own rows. `placeSends` (transcript/sends.ts) draws the send's
   * row there from its record; nothing else ever sees one.
   */
  | "send.ref"
  | `system.${string}`
  | `ui.${string}`;

export interface Message {
  content: string;
  /**
   * The row's identity. A message sent to the session is keyed by the uuid it
   * was sent under, from the press to a reload, on every screen.
   */
  id?: string;
  instanceId: string;
  metadata?: MessageMetadata;
  /** Links this message to the Task tool.use that spawned it (subagent output). */
  parentToolUseId?: string;
  /**
   * Waits at the end of the transcript, after the live tail: a send the
   * session has not read — its record `pending`, or this tab's own send the
   * hub has not taken yet (`sending`, `unreached`).
   */
  queued?: boolean;
  /** The SDK message's own uuid — the handle for rewind and fork. */
  sdkUuid?: string;
  /**
   * Where a message sent to the session stands. From its record, the hub's
   * word: waiting for the harness (`pending`), taken up by it (`read`), or
   * never going to be (`failed`). Before the hub has taken it, this tab's
   * own: on its way (`sending`), or it never reached the hub (`unreached`).
   * Absent on everything that is not a send.
   */
  state?: SendRowState;
  /**
   * When the turn happened. A send: when the hub accepted it, live and stored
   * alike (`SendRecord.acceptedAt`). Anything else: when the harness stored
   * its record — a live frame's `timestamp`, a stored entry's
   * `SessionMessage.timestamp`, the same instant either way — and none when
   * the harness gives none: the client's clock would date a row by when it
   * was watched, and a reload would date it differently. Absent beats
   * invented; readers must handle it being unset.
   */
  timestamp?: Date;
  toolCallId?: string | null;
  type: MessageType;
}

/**
 * A send's row state: its record's (`SendState`, core) — a replaced send is
 * no row — or, before the hub has it, this tab's own.
 */
export type SendRowState =
  | "sending"
  | "unreached"
  | Exclude<SendState, "replaced">;

/** Everything a renderer may need beyond `content`, keyed by the type that uses it. */
export interface MessageMetadata {
  /** A `user.delegate_ask`'s display label, e.g. `cawco#506dfafb`. */
  askLabel?: string;
  /** A `user.delegate_ask`'s hub permission requestId — what it waits on to be answered. */
  askRequestId?: string;
  // What a user turn carried besides its typed text
  /**
   * Files the reader attached to the turn, each drawn as a DocThumb that opens
   * in the lightbox. The local copy has them from the send; a stored turn has
   * them parsed back out of its `<pasted-text>` blocks (frames.ts).
   */
  attachments?: Array<{ name: string; content: string }>;
  // Login prompt
  authUrl?: string;
  command?: string;
  commands?: AvailableCommand[];
  currentModel?: string;
  cwd?: string;
  /**
   * The delegate instance id, extracted from the tool result once at
   * {@link applyToolResult} time so DelegateBranch and suppression logic read a
   * field instead of parsing prose. Set on `tool.handoff` messages with
   * `handoffKind === 'delegate'` whose result has been applied.
   */
  delegateInstanceId?: string;
  /** The delegate's brief headline, carried beside {@link delegateInstanceId}. */
  delegateTitle?: string;
  error?: string;
  // Session error
  /** The `ui.session_error` card's heading; a missing session when unset. */
  errorTitle?: string;
  exitCode?: NeutralSystemMessage["exit_code"];
  handoffBrief?: string;
  // Compact boundary
  /** Who sent a {@link MessageType} of `user.peer`: the sending session's id. */
  handoffKind?: "handoff" | "start" | "delegate";
  // Hook response
  hookName?: NeutralSystemMessage["hook_name"];
  /** A stored transcript can name an image it no longer carries, hence the optional uri. */
  images?: Array<{ mediaType: string; src?: string }>;
  isRedactedThinking?: boolean;
  // Model picker
  loading?: boolean;
  memoryContent?: string;
  memoryPath?: string;
  // Memory picker
  memoryPhase?: "selection" | "editing";
  model?: NeutralSystemMessage["model"];
  models?: Array<{ value: string; displayName: string; description: string }>;
  // Harness-injected user-role content (task notifications, reminders, compaction)
  noteKind?: string;
  /** A task notification's Task `tool_use_id` — folds the note into its branch. */
  noteTaskToolId?: string;
  noteTitle?: string;
  numTurns?: number;
  oauthState?: string;
  peerFrom?: string;
  /** Its display name, as the sender's host asserted it. */
  peerName?: string;
  /** The sender's host-openable session, so the card can link back to it. */
  peerSession?: string;
  /** `init` only, and re-reported every turn: what the session answers tools with. */
  permissionMode?: NeutralSystemMessage["permissionMode"];
  preTokens?: number;
  questionAnswers?: Record<string, string>;
  // Ask question (AskUserQuestion tool / onUserDialog)
  questionRequestId?: string;
  questions?: Array<{
    question: string;
    header: string;
    options: Array<{ label: string; description: string }>;
    multiSelect: boolean;
  }>;
  /** Set when a `user.peer` is a delegate's auto-report rather than a hand-off. */
  reportKind?: "report" | "failed";
  result?: string;
  resultErrors?: string[];
  /** Images returned by the tool, preserved as display data URIs. */
  resultImages?: Array<{ mediaType: string; src: string }>;
  // Result errors
  resultSubtype?: string;
  /** A `user.rule`'s rule name, read off its `[Rule: <name>]` marker line. */
  ruleName?: string;
  selectedMemoryType?: "project" | "user";
  selectedModel?: string;
  /**
   * Why a send did not go: its record's reason, or — for one that never
   * reached the hub — its command's.
   */
  sendFailed?: string;
  sessionId?: string;
  /** `init` only: which of those names are skills rather than commands. */
  skills?: NeutralSystemMessage["skills"];
  /** `init` only: what this session answers behind `/`, without the leading slash. */
  slashCommands?: NeutralSystemMessage["slash_commands"];
  status?: NeutralStatus;
  stderr?: NeutralSystemMessage["stderr"];
  stdout?: NeutralSystemMessage["stdout"];
  subagentDescription?: string;
  /** The `model` override the spawn input asked for, when present. */
  subagentModel?: string;
  // Subagent spawning (Task tool)
  subagentType?: string;
  // System messages
  subtype?: string;
  /** The task a `system.task` line reports — the dedupe key against the
   *  harness's own XML notification for the same completion. */
  taskId?: string;
  // Thinking blocks
  thinking?: string;
  /**
   * How long the thinking block actually ran, measured by the client's own
   * clock between `content_block_start` and the settled message. Preferred
   * over transcript adjacency, which reads 0 when thinking and a tool call
   * land in one frame.
   */
  thinkingDurationMs?: number;
  thinkingSignature?: string;
  // Tool messages
  toolId?: string;
  toolInput?: JsonValue;
  /** `init` only: the MCP servers and tools behind the `/` palette. */
  tooling?: SessionTooling;
  toolName?: string;
  toolResult?: JsonValue;
  toolStatus?: "pending" | "success" | "error";
  /**
   * The reader's answers to an `AskUserQuestion` tool result, normalised by the
   * harness adapter (`UserQuestionResult`: questions + answers keyed by question
   * text, plus any freeform `response` and per-question `annotations`). Written
   * once, in `applyToolResult`, and read only by the question renderer.
   */
  toolUseResult?: UserQuestionResult;
  totalCost?: number;
  trigger?: "manual" | "auto";
  /** A send made urgently (`SendRecord.mode`): into the running turn, or ahead of it. */
  urgent?: true;
  // Help menu
  version?: string;
  /** Set when a `user.peer` is a workflow's notice: what happened, e.g. `step Build failed`. */
  workflowEvent?: string;
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
