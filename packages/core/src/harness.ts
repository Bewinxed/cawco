/**
 * The harness-neutral spine (the 2026-08 rework).
 *
 * Whiffle once tunnelled Claude Agent SDK types verbatim — `@whiffle/core`
 * re-exported the SDK, the agent spawned `query()` and the dashboard folded SDK
 * messages into view state. Making the product harness-agnostic means the wire,
 * the hub and the dashboard all speak a vocabulary whiffle owns, and each
 * harness (claude, opencode, pi, …) is a daemon-side adapter that translates its
 * native events into it.
 *
 * Design rules for anything added here:
 * - This is the *only* wire contract. The dashboard folds these types, the hub
 *   peeks them, the agent adapters produce them.
 * - Field names deliberately mirror the Claude Agent SDK where a shape already
 *   exists there (it is the richest harness). That keeps the folding layer a
 *   type swap rather than a rewrite, and makes the claude adapter a re-tag.
 * - Every message carries `raw` — the harness's own event, verbatim — so a
 *   feature not yet modelled can still be reached without a protocol change.
 * - Nothing in this file imports a harness SDK. Those are agent-internal
 *   dependencies, never shared on the wire.
 */

/** The harnesses whiffle can spawn sessions on. Adding one is a new adapter. */
export type HarnessKind = "claude" | "opencode" | "pi";

export const HARNESSES: readonly HarnessKind[] = ["claude", "opencode", "pi"];

/** How a session answers tool permissions. The union is Claude Code's; others map onto it. */
export type PermissionMode =
  | "default"
  | "acceptEdits"
  | "bypassPermissions"
  | "plan"
  | "dontAsk"
  | "auto";

/**
 * How hard the model thinks, and how much it spends doing it: Claude Code's
 * effort scale, in its own order. Hand-written rather than tunnelled from the
 * SDK — nothing in this file imports a harness SDK, and `@whiffle/core` has no
 * dependencies at all — but it is the SDK's `EffortLevel` verbatim, so the
 * claude adapter hands it straight on.
 *
 * Effort is not only thinking depth. A lower level also buys fewer and more
 * consolidated tool calls, less preamble and terser confirmations; a higher one
 * spends tokens in all of those places. A harness with no such knob reports
 * `effort: false` rather than mapping onto this.
 */
export type EffortLevel = "low" | "medium" | "high" | "xhigh" | "max";

/** Every {@link EffortLevel}, low to max: the one runtime list validators and pickers read. */
export const EFFORT_LEVELS: readonly EffortLevel[] = [
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
];

/** A session's own word on what it is doing right now. */
export type NeutralStatus = "compacting" | "requesting" | null;

/* ------------------------------------------------------------------ MCP — */

/** MCP server config shapes, re-declared so `fleet.ts` stops importing the SDK. */
export interface McpStdioServerConfig {
  alwaysLoad?: boolean;
  args?: string[];
  command: string;
  env?: Record<string, string>;
  timeout?: number;
  type?: "stdio";
}

export interface McpSSEServerConfig {
  alwaysLoad?: boolean;
  headers?: Record<string, string>;
  timeout?: number;
  type: "sse";
  url: string;
}

export interface McpHttpServerConfig {
  alwaysLoad?: boolean;
  headers?: Record<string, string>;
  timeout?: number;
  type: "http";
  url: string;
}

export interface McpServerStatus {
  config?: Record<string, unknown>;
  error?: string;
  name: string;
  scope?: string;
  serverInfo?: { name: string; version?: string };
  status:
    | "connected"
    | "failed"
    | "needs-auth"
    | "pending"
    | "disabled"
    | string;
  tools?: { name: string; description?: string }[];
}

/* --------------------------------------------------------------- models — */

/** One model a harness offers. `value` is the wire id; `resolvedModel` the alias. */
export interface ModelInfo {
  /**
   * The model's context window in tokens, exactly as the harness reports it
   * (opencode's provider `limit.context`, pi's `Model.contextWindow`, and for
   * claude the `modelUsage` window the hub last observed). Absent means
   * unknown — never a guess.
   */
  contextWindow?: number;
  description?: string;
  displayName: string;
  /** ISO date the model was released, when the catalog source says. */
  released?: string;
  resolvedModel?: string;
  supportedEffortLevels?: EffortLevel[];
  supportsAdaptiveThinking?: boolean;
  supportsAutoMode?: boolean;
  /**
   * Whether this model has an effort scale, and which of its stops it reaches.
   * The pair is the *only* thing that decides what an effort control offers —
   * `xhigh` and `max` are model-dependent, and a hardcoded list of which models
   * have them is a list that is wrong by the next release.
   */
  supportsEffort?: boolean;
  supportsFastMode?: boolean;
  value: string;
}

/* ------------------------------------------------------------- commands — */

/** What the composer's `/` menu renders. Replaces the SDK's `SlashCommand`. */
export interface SlashCommand {
  aliases?: string[];
  argumentHint: string;
  description: string;
  /** What the harness says this is, when it knows. Absent → derived from the name and the session's skill list. */
  kind?: "builtin" | "custom" | "skill" | "mcp";
  name: string;
}

/**
 * What {@link CONTROL_SUPPORTED_COMMANDS} answers, on every harness: the
 * session's `/` menu. A harness with no slash commands (pi) answers an empty
 * list, never nothing, so the menu reads one shape whoever answered.
 */
export type SupportedCommands = SlashCommand[];

/* ----------------------------------------------------------- permissions — */

export type PermissionUpdateDestination =
  | "userSettings"
  | "projectSettings"
  | "localSettings"
  | "session"
  | "cliArg";

/** A permission the SDK suggests persisting, so "always allow" has something to write. */
export type PermissionUpdate =
  | {
      type: "addRules" | "replaceRules" | "removeRules";
      rules: { toolName: string; ruleContent?: string }[];
      behavior: "allow" | "deny" | "ask";
      destination: PermissionUpdateDestination;
    }
  | {
      type: "setMode";
      mode: PermissionMode;
      destination: PermissionUpdateDestination;
    }
  | {
      type: "addDirectories" | "removeDirectories";
      directories: string[];
      destination: PermissionUpdateDestination;
    };

/**
 * Whether a machine's daemon can actually start sessions for a harness.
 * `unreadable-credentials` is macOS's own failure: Claude Code keeps its
 * credentials in the login keychain, and a daemon outside the GUI session is
 * refused the secret (`errSecInteractionNotAllowed`). Generalized: every
 * harness reports its own auth word through the same three states.
 */
export type AuthState =
  | "authenticated"
  | "unauthenticated"
  | "unreadable-credentials";

/** A parked permission's answer. `remember` is opencode's "always". */
export type PermissionResult =
  | {
      behavior: "allow";
      updatedInput?: unknown;
      updatedPermissions?: PermissionUpdate[];
      remember?: boolean;
      toolUseID?: string;
    }
  | {
      behavior: "deny";
      message: string;
      interrupt?: boolean;
      toolUseID?: string;
    };

/** One question of an `AskUserQuestion`-shaped prompt, as every harness can express. */
export interface UserQuestion {
  header: string;
  multiSelect: boolean;
  options: { label: string; description: string }[];
  question: string;
}

/** The reader's choices, back the way the tool reads them. */
export type UserAnswers = Record<string, string | string[]>;

/**
 * A question the reader answered: the questions asked and the choices made,
 * keyed by question text.
 *
 * `answers` values are `string | string[]` by wire truth: the Claude SDK types
 * them `string` ("multi-select answers are comma-separated") but a real
 * transcript carries an array for a multi-select answer, and freeform "Other"
 * text lands inside `answers` too — so a value is not guaranteed to match any
 * option `label`. The union is the truth; nothing coerces it.
 */
export interface UserQuestionAnswered {
  /** Per-question notes (preview selections), keyed by question text. */
  annotations?: Record<string, { notes?: string; preview?: string }>;
  answers: UserAnswers;
  outcome: "answered";
  questions: UserQuestion[];
  /** Freeform text the reader typed instead of selecting a structured option. */
  response?: string;
}

/**
 * A question the reader walked away from. Every harness expresses this as a
 * denial of the question's permission, and it carries no answers at all — so
 * it is a separate member rather than an answered result with an empty map,
 * which would let a consumer draw a card with blank choices and call it an
 * answer.
 */
export interface UserQuestionDismissed {
  outcome: "dismissed";
  questions: UserQuestion[];
}

/**
 * How an `AskUserQuestion`-shaped prompt ended. This is the answer-side
 * counterpart to {@link UserQuestion}; a harness adapter produces it from its
 * own native payload so the dashboard never branches on harness.
 *
 * `outcome` is what separates the two ways a question legitimately ends from
 * the third case nobody writes down — the field being absent, which means a
 * shape no adapter produced and is a fault to surface, not a state to draw.
 */
export type UserQuestionResult = UserQuestionAnswered | UserQuestionDismissed;

/* ------------------------------------------------------------- sessions — */

/** A stored session as the catalog lists it. `harness` says who owns the id. */
export interface NeutralSessionInfo {
  createdAt?: number;
  customTitle?: string;
  cwd?: string;
  fileSize?: number;
  firstPrompt?: string;
  gitBranch?: string;
  harness: HarnessKind;
  lastModified: number;
  sessionId: string;
  summary?: string;
  tag?: string;
}

/** A stored transcript entry. `message` is the {@link NeutralMessage} the turn wrote. */
export interface SessionMessage {
  /**
   * This entry is a compaction summary: the text the harness condensed the
   * conversation before it into. Everything from the last such entry on is
   * what the session's model holds in context now. Claude: the record after a
   * `compact_boundary` (`isCompactSummary`); opencode: the assistant message
   * with `summary: true`; pi: a `compaction` entry's `summary`, placed where
   * its first kept entry begins.
   */
  compactSummary?: true;
  /**
   * An assistant entry the harness wrote in place of the model's answer: its
   * error, as the live frame carried it ({@link NeutralAssistantMessage.error}).
   */
  error?: string;
  /**
   * How many sends this entry holds the words of, when the harness joined
   * several into one: Claude takes up the prompts queued behind a turn
   * together and stores them as one user record under the last one's uuid,
   * their words joined by newlines — one `dequeue` line per prompt right
   * before the record (measured, CLI 2.1.280). Absent for an entry that is
   * one send.
   */
  joined?: number;
  /**
   * A `user`/`assistant` entry's stored message. A `system` entry's is the
   * frame the live stream carried for the same record — a
   * {@link NeutralSystemMessage}, or the error `result` a failed turn closed
   * with — so a reader draws it with the frame's own mapping.
   */
  message: unknown;
  parent_agent_id: string | null;
  parent_tool_use_id: string | null;
  /**
   * A send the harness has written down and not yet taken up. opencode writes
   * a message sent into a running step at once and gives it to the model when
   * that step ends — the read its live stream says then. Every other stored
   * send was written as it was read.
   */
  queued?: true;
  /**
   * The sends this stored entry is ({@link SendRecord.uuid}), in the order
   * the harness took them up, as the hub linked them on the way out of the
   * history route: one, or the several a harness joined into it
   * ({@link joined}). A reader draws each from its record — its words, its
   * clock, its state — in the entry's place. Absent on everything the hub has
   * no record for: the harness's own turns, and a message typed into the
   * harness directly.
   */
  sends?: string[];
  session_id: string;
  /**
   * The uuid a sent message was sent under ({@link NeutralUserMessage.uuid}),
   * when the harness stores it apart from its own id for the entry: Claude's
   * `queued_command.source_uuid` on a fold. A reader keys a message the hub
   * has no record for by this.
   */
  sourceUuid?: string;
  /**
   * When the entry was written, ISO-8601, as its harness recorded it: Claude's
   * line time, opencode's message `time.created` (a tool result: its call's
   * end), pi's entry `timestamp`. A send is dated by its record instead
   * ({@link SendRecord.acceptedAt}). An entry the hub builds itself (a custody
   * notice) has none, and a reader that gets none renders none rather than its
   * own clock — stamping the read time dates every turn of an old session to
   * the moment it was opened.
   */
  timestamp?: string;
  type: "user" | "assistant" | "system";
  uuid: string;
}

/**
 * One task of a session's plan, as every harness can express. Claude Code keeps
 * a ledger file per task; opencode has a native `todo` list; pi has neither.
 * The dashboard renders this one shape regardless of which answered.
 */
export interface NeutralTask {
  blockedBy: string[];
  blocks: string[];
  description?: string;
  id: string;
  owner?: string;
  status: "pending" | "in_progress" | "completed";
  subject: string;
}

/* ------------------------------------------------------ neutral messages — */

export type NeutralContentBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string; signature?: string }
  | { type: "redacted_thinking" }
  | {
      type: "tool_use";
      id: string;
      name: string;
      input: Record<string, unknown>;
    }
  | {
      type: "tool_result";
      tool_use_id: string;
      content: unknown;
      is_error?: boolean;
      structuredContent?: Record<string, unknown>;
      /** The answer payload of an `AskUserQuestion` tool result, normalised by the harness adapter. */
      questionResult?: UserQuestionResult;
    }
  | {
      type: "image";
      source: { type: "base64"; media_type: string; data: string };
    };

export type NeutralAssistantBlock = Extract<
  NeutralContentBlock,
  { type: "text" | "thinking" | "redacted_thinking" | "tool_use" }
>;

export type NeutralOrigin =
  | { kind: "human" }
  | {
      kind: "peer";
      from?: string;
      name?: string;
      fromSession?: string;
      body?: string;
    }
  /**
   * Whiffle's own word, not the user's and not another session's: today, a rule
   * that fired. `name` is what fired it, e.g. `rule:Honest caveat`. Kept apart
   * from `peer` so a transcript can say who is really talking — a model that
   * mistakes a rule for the user apologises to nobody.
   */
  | { kind: "system"; name?: string };

export interface NeutralAssistantMessage {
  /** Blocks already published for this message, preserving row ids across incremental settlement. */
  contentOffset?: number;
  /**
   * The harness's word that this message is not the model answering but a
   * failure written in its place — Claude's synthetic `authentication_failed`,
   * `rate_limit`, … (measured on CLI 2.1.280: "Not logged in · Please run
   * /login" arrives as one, before an `is_error` result).
   */
  error?: string;
  /**
   * Set by the hub on an error message ({@link error}) that answered sends
   * the session had just read: they failed with its words, and their rows
   * carry them, so it draws no row of its own.
   */
  failedSends?: string[];
  message: { model?: string; content: NeutralAssistantBlock[] };
  parent_tool_use_id?: string | null;
  /** The harness's own event, verbatim, for renderers that need more than this. */
  raw?: unknown;
  session_id?: string;
  /**
   * When the harness stored this record, ISO-8601: the clock its row shows,
   * live as after a reload ({@link SessionMessage.timestamp}). Claude's
   * stream carries its record's own; opencode's is its message's
   * `time.created`; pi's is its entry's. Absent on a frame the harness
   * stores no record for.
   */
  timestamp?: string;
  type: "assistant";
  uuid?: string;
}

/**
 * A user-role message. Two things wear this shape: what the harness says in
 * the user's role (tool results, its own notices), and a message SENT to the
 * session — which always carries `origin` and `uuid` ({@link SentMessage}),
 * and nothing else does.
 */
export interface NeutralUserMessage {
  message: { role: "user"; content: string | NeutralContentBlock[] };
  origin?: NeutralOrigin;
  parent_tool_use_id?: string | null;
  raw?: unknown;
  /**
   * A retry: the uuid of the failed send this one is sent in place of. The
   * hub marks that record `replaced` ({@link SendRecord.replacedBy}).
   */
  replaces?: string;
  session_id?: string;
  shouldQuery?: boolean;
  /** When the harness stored it ({@link NeutralAssistantMessage.timestamp}). */
  timestamp?: string;
  type: "user";
  uuid?: string;
}

/**
 * A message sent to a session, by the reader or by whiffle. `uuid` is its one
 * identity from the press to a reload: the dashboard's command id for a
 * reader's send, minted where the hub builds its own. The hub keeps one
 * {@link SendRecord} under it, and every copy of the message on every screen
 * is drawn from that record.
 */
export type SentMessage = NeutralUserMessage & {
  origin: NeutralOrigin;
  uuid: string;
};

/**
 * How a send asks to be read: as a turn of its own, as a note the next turn
 * folds in (`shouldQuery: false`), or urgently — into the running turn, or
 * ahead of it.
 */
export type SendMode = "turn" | "note" | "urgent";

/**
 * Where a send stands, as the hub alone decides it: waiting for the harness
 * (`pending`), taken up by it (`read`), never going to be (`failed`, with
 * why), or sent again as another send (`replaced`).
 */
export type SendState = "pending" | "read" | "failed" | "replaced";

/**
 * THE ONE RECORD OF A SEND. The hub writes it when it accepts the send and is
 * its only writer after that: every change is stored, then sequenced into the
 * session's stream as a `send` frame, and a history read serves it beside the
 * entries. Every screen draws the send from this, live and after any reload.
 */
export interface SendRecord {
  /** ISO-8601: when the hub took the send. The only clock its row shows. */
  acceptedAt: string;
  /**
   * A failed send the harness never stored: the uuid of the last thing the
   * session said before it failed — an assistant frame, or a send it read.
   * Its row goes right after that. Absent when the session had said nothing.
   */
  anchor?: string;
  /**
   * Exactly what the sender submitted: its words, its pictures (as the hub's
   * media references) and pastes, and who it is from. What the agent adds on
   * the way to the harness (a worktree line, an urgent prefix) is not in it.
   */
  body: NeutralUserMessage;
  /**
   * The id the harness stored the send under, where that is not its uuid:
   * opencode's message id, pi's entry id, and — for a send Claude joined into
   * another's record ({@link SessionMessage.joined}) — that record's uuid.
   */
  harnessId?: string;
  instanceId: string;
  mode: SendMode;
  /** Why it failed, in the harness's words or the hub's. */
  reason?: string;
  /** The retry that replaced it. */
  replacedBy?: string;
  /** The failed send this one was sent in place of. */
  replaces?: string;
  state: SendState;
  uuid: string;
}

/**
 * One line of a session's history as the hub serves it: a stored entry, or a
 * send's record. The records of a page come before its entries.
 */
export type HistoryLine = SessionMessage | { record: SendRecord };

/**
 * The `system` subtype saying the harness has now consumed these sends: each
 * named in `read` by its uuid, or by the id the harness stored it under
 * ({@link MESSAGES_STORED}). The hub turns it into the records' `read`; it
 * never reaches a screen.
 */
export const MESSAGES_READ = "read";

/**
 * The `system` subtype saying which id the harness stores each send under
 * (`storedAs`, by the send's uuid), said as soon as the harness knows it.
 */
export const MESSAGES_STORED = "stored";

export interface NeutralStreamMessage {
  event:
    | {
        type: "content_block_start";
        content_block: { type: "thinking"; thinking: string };
      }
    | {
        type: "content_block_delta";
        delta: { type: "text_delta"; text: string };
      }
    | {
        type: "content_block_delta";
        delta: { type: "thinking_delta"; thinking: string };
      }
    | { type: "content_block_stop" }
    | { type: "message_stop" };
  parent_tool_use_id?: string | null;
  raw?: unknown;
  session_id?: string;
  type: "stream_event";
  uuid?: string;
}

export interface NeutralResultMessage {
  /** Prompt-cache tokens the turn read from / wrote to, when the harness reports them. */
  cache?: { read: number; write: number };
  errors?: string[];
  /**
   * The sends this error failed, set by the hub: read, and answered by nothing
   * but this error. Their rows carry the error, so it draws no line of its own.
   */
  failedSends?: string[];
  is_error: boolean;
  num_turns?: number;
  raw?: unknown;
  result?: string;
  session_id?: string;
  stop_reason?: string | null;
  subtype: string;
  /** When the harness stored what it closes on ({@link NeutralAssistantMessage.timestamp}). */
  timestamp?: string;
  total_cost_usd?: number;
  type: "result";
  uuid?: string;
}

/**
 * A `system` frame. One loose interface rather than a subtype union: the folding
 * layer switches on `subtype` and reads the fields each subtype carries, and a
 * harness that emits a subtype nothing here names degrades to a generic line.
 */
export interface NeutralSystemMessage {
  // commands_changed
  commands?: SlashCommand[];
  compact_error?: string;
  // compact_boundary
  compact_metadata?: { trigger?: "manual" | "auto"; pre_tokens?: number };
  compact_result?: "success" | "failed";
  // model_fallback
  content?: string;
  cwd?: string;
  description?: string;
  exit_code?: number;
  fallback_model?: string;
  // hook_response — a session-start hook that failed, the one hook frame a
  // transcript draws (its output is otherwise startup noise, and never stored)
  hook_name?: string;
  last_tool_name?: string;
  mcp_servers?: { name: string; status: string }[];
  // init
  model?: string;
  patch?: { description?: string; status?: string; error?: string };
  permissionMode?: PermissionMode;
  raw?: unknown;
  // read ({@link MESSAGES_READ}) — the sends the harness has now consumed
  read?: string[];
  /**
   * task_notification: the report a finished task handed back. Claude's live
   * frame carries none; its stored notification (`<result>`) does.
   */
  result?: string;
  session_id?: string;
  skills?: string[];
  slash_commands?: string[];
  // status — the session's own word (`compacting`/`requesting`/null), and the
  // task-notification status (`completed`/`failed`/`stopped`), which the SDK
  // also names `status`. Kept as one loose field; the folder reads it per subtype.
  status?: NeutralStatus | string;
  stderr?: string;
  stdout?: string;
  /**
   * stored ({@link MESSAGES_STORED}), or read: the id the harness stores each
   * send under, by the send's uuid, where the harness keys its own record
   * differently (opencode's message id, pi's entry id). The hub keeps it on
   * the send's record, so a history read finds the send again.
   */
  storedAs?: Record<string, string>;
  subagent_type?: string;
  subtype: string;
  summary?: string;
  task_id?: string;
  text?: string;
  timestamp?: string;
  // task_started / task_progress / task_notification / task_updated
  tool_use_id?: string;
  tools?: string[];
  type: "system";
  uuid?: string;
}

/** A frame that has no neutral meaning yet, forwarded whole for a future renderer. */
export interface NeutralRawMessage {
  harness: HarnessKind;
  message: unknown;
  parent_tool_use_id?: string | null;
  session_id?: string;
  type: "raw";
  uuid?: string;
}

export type NeutralMessage =
  | NeutralAssistantMessage
  | NeutralUserMessage
  | NeutralStreamMessage
  | NeutralResultMessage
  | NeutralSystemMessage
  | NeutralRawMessage;

/* ---------------------------------------------------------- capabilities — */

/** What a harness can do, so the dashboard gates features instead of guessing. */
export interface HarnessCapabilities {
  compaction: boolean;
  contextUsage: boolean;
  costUsd: boolean;
  deleteSession: boolean;
  /** The reasoning-effort scale, at spawn and mid-session. */
  effort: boolean;
  /** The harness applies the hub's fleet config (MCP/skills/memory/agents) to its own files. */
  fleet: boolean;
  /** Fork a stored session into a new one. */
  fork: boolean;
  getSessionMessages: boolean;
  /** Peer-to-peer hand-off tools (`mcp__whiffle__*` for claude). */
  handoff: boolean;
  hooks: boolean;
  images: boolean;
  interrupt: boolean;
  listSessions: boolean;
  mcpControl: boolean;
  mcpStatus: boolean;
  permissionModes: PermissionMode[];
  plugins: boolean;
  /** Answers `{ skills: SlashCommand[] }`. */
  reloadSkills: boolean;
  renameSession: boolean;
  /** Rewind / resume-at-message. */
  rewind: boolean;
  setModel: boolean;
  skills: boolean;
  subagents: boolean;
  supportedCommands: boolean;
  supportedModels: boolean;
  /** The scratch-tag the catalog filter reads. */
  tagSession: boolean;
  tasks: boolean;
  thinking: boolean;
}

/** What a machine knows about one harness: is it installed, can it work, what can it do. */
export interface HarnessReport {
  auth: AuthState;
  capabilities: HarnessCapabilities;
  harness: HarnessKind;
  installed: boolean;
  /**
   * The models this harness offers on this machine.
   *
   * It rides the machine's report for the same reason {@link
   * HarnessCapabilities.permissionModes} does, and not the {@link
   * CONTROL_SUPPORTED_MODELS} control beside it: the catalog is a property of
   * the installed CLI and the account behind it, identical for every session on
   * the machine and knowable with none running. Asking a session for it made a
   * fleet-wide fact inherit one session's lifecycle — a machine with nothing
   * running had no catalog at all, so its model picker was empty and no session
   * could be named or shown an effort scale.
   *
   * Absent (not empty) from a machine whose agent predates the field, and from
   * a harness that could not be probed; empty means it was asked and offered
   * nothing.
   */
  models?: ModelInfo[];
  /** The CLI/SDK version, when it can be read. */
  version?: string;
}

/** The default for a harness adapter that reports nothing; adapters override. */
export const CAPABILITIES_NONE: HarnessCapabilities = {
  interrupt: false,
  permissionModes: [],
  setModel: false,
  effort: false,
  contextUsage: false,
  supportedModels: false,
  supportedCommands: false,
  reloadSkills: false,
  mcpStatus: false,
  mcpControl: false,
  listSessions: false,
  getSessionMessages: false,
  renameSession: false,
  deleteSession: false,
  fork: false,
  rewind: false,
  tagSession: false,
  skills: false,
  subagents: false,
  tasks: false,
  compaction: false,
  costUsd: false,
  thinking: false,
  images: false,
  handoff: false,
  hooks: false,
  plugins: false,
  fleet: false,
};

/**
 * The neutral names the `control` verb understands for a *live session*.
 * Identical to Claude Code's `Query` methods, so the claude adapter passes them
 * through unchanged; the opencode and pi adapters map them onto their own
 * surfaces. The dashboard calls these by name, never the harness's own words.
 */
export const CONTROL_INTERRUPT = "interrupt";
export const CONTROL_SET_PERMISSION_MODE = "setPermissionMode";
export const CONTROL_SET_MODEL = "setModel";
/**
 * The one verb here that is not a `Query` method: claude spends it on
 * `applyFlagSettings({ effortLevel })`, where `max` is session-scoped and never
 * written to a settings file — which is the lifetime a mid-session switch
 * wants. Named after the setting, like `setModel`, because that is what the
 * dashboard is asking for.
 */
export const CONTROL_SET_EFFORT = "setEffort";
export const CONTROL_CONTEXT_USAGE = "getContextUsage";
export const CONTROL_SUPPORTED_MODELS = "supportedModels";
export const CONTROL_SUPPORTED_COMMANDS = "supportedCommands";
export const CONTROL_RELOAD_SKILLS = "reloadSkills";
export const CONTROL_MCP_STATUS = "mcpServerStatus";
export const CONTROL_MCP_RECONNECT = "reconnectMcpServer";
export const CONTROL_MCP_TOGGLE = "toggleMcpServer";

/** Machine-scoped session-catalog controls, answered by whichever harness owns the id. */
export const CONTROL_LIST_SESSIONS = "listSessions";
export const CONTROL_GET_SESSION_INFO = "getSessionInfo";
export const CONTROL_GET_SESSION_MESSAGES = "getSessionMessages";
export const CONTROL_RENAME_SESSION = "renameSession";
export const CONTROL_TAG_SESSION = "tagSession";
export const CONTROL_DELETE_SESSION = "deleteSession";

/** Full-text search across all transcripts on a machine (daemon-scoped). */
export const CONTROL_SEARCH_TRANSCRIPTS = "searchTranscripts";

/** A session's plan, answered by whichever harness owns it (`NeutralTask[]`). */
export const CONTROL_GET_TODOS = "getTodos";

/**
 * The models a harness can run on this machine, each with the context window
 * the harness itself reports for it (`ModelInfo[]`). Machine-scoped: answered
 * without a running session, for the hub to check a model's window before it
 * starts one. Harnesses whose models carry no reported window (claude) do not
 * answer it.
 */
export const CONTROL_MODEL_CATALOG = "modelCatalog";

/**
 * What git says changed in a directory, for a continuation's artifact index:
 * `git status --porcelain` and `git log --since=<iso> --name-status` — those
 * two commands, nothing else (`GitChanges`). Machine-scoped.
 */
export const CONTROL_GIT_CHANGES = "gitChanges";

/** A directory's git state as {@link CONTROL_GIT_CHANGES} answers it. */
export type GitChanges =
  | { repo: false }
  | { repo: true; status: string; log: string };
