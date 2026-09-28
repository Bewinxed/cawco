/**
 * The transcript shape the ported renderers consume. It is a *view* type, not a
 * protocol type: frames arrive as SDK messages (`@whiffle/core`) and `frames.ts`
 * folds them into these. Anything that describes the wire belongs in the SDK.
 */
import type {
  AvailableCommand,
  NeutralStatus,
  NeutralSystemMessage,
  UserQuestionResult,
} from "@whiffle/core";
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
  /** A rule that fired — whiffle's own standing instruction, never the reader's words. */
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
   * Sent into a running turn: drawn after the live tail, at reduced presence,
   * until the session reads it. Decided when the row first appears — a send
   * to an idle session is read at once and is never drawn as waiting.
   */
  queued?: boolean;
  /** The SDK message's own uuid — the handle for rewind and fork. */
  sdkUuid?: string;
  /**
   * Where a message sent to the session stands: drawn by this tab and not yet
   * taken (`sending`), taken by the hub (`sent`), consumed by the harness
   * (`read`), or never delivered (`failed`). Only moves forward, except that a
   * retry puts a failed one back to `sending`.
   */
  state?: SendState;
  /**
   * When the turn happened. A sent message: when the hub accepted it, live and
   * stored alike. Any other live frame: the client's clock on arrival, which is
   * the truth there. A stored entry: its `SessionMessage.timestamp`, and none
   * when the entry has none — stamping the parse time would render a time that
   * never happened. Absent beats invented; readers must handle it being unset.
   */
  timestamp?: Date;
  toolCallId?: string | null;
  type: MessageType;
}

export type SendState = "sending" | "sent" | "read" | "failed";

/** Everything a renderer may need beyond `content`, keyed by the type that uses it. */
export interface MessageMetadata {
  /** A `user.delegate_ask`'s display label, e.g. `whiffle#506dfafb`. */
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
   * Why this message was never delivered, stamped on the row when its command
   * settles at `failed`.
   *
   * It duplicates the record's own `reason` on purpose: command records are
   * swept by count and age (`SETTLED_COMMAND_TTL_MS`, five minutes), and a
   * message that failed must keep saying why after its record is forgotten.
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
  // Help menu
  version?: string;
  /** Set when a `user.peer` is a workflow's notice: what happened, e.g. `step Build failed`. */
  workflowEvent?: string;
}

/** An ask's life: parked on the parent, then allowed or refused by it. */
export type DelegateAskStatus = "pending" | "answered" | "denied";

/** What every kind of {@link DelegateEvent} carries, whichever it is. */
interface DelegateEventBase {
  createdAt: string;
  /** The hub's row id — what a fold deduplicates on and orders by. */
  id: number;
  /** The delegate the traffic is about, never the parent, on any of the kinds. */
  instanceId: string;
  parentInstanceId: string;
  /** The permission request an ask and its answer share; null on a report. */
  requestId: string | null;
  requestKind: "question" | "tool" | null;
  /** An ask's own state; null on an answer and a report, which settle nothing. */
  status: DelegateAskStatus | null;
  toolName: string | null;
}

/**
 * One line of the hub's record of what a delegate and its parent said to each
 * other — `delegate_events` (packages/hub `db/schema.ts`), read over
 * `GET /api/delegate-events` and pushed as a `delegate_event` frame. The hub is
 * the system of record: the transcript markers say the same things, but only
 * for a reader who was watching, and only as text to be parsed back.
 */
export type DelegateEvent =
  | (DelegateEventBase & {
      kind: "ask";
      /** The tool input as the harness asked it — `{filepath, diff}`, `{questions}`, … */
      payload: { input?: Record<string, JsonValue> };
    })
  | (DelegateEventBase & {
      kind: "answer";
      payload: { behavior?: string; answers?: Record<string, JsonValue> };
    })
  | (DelegateEventBase & {
      kind: "report";
      payload: { body: string; failed: boolean };
    });

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
