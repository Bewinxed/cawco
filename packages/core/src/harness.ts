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

/** Kept name for one release: the dashboard imported this from the SDK re-export. */
export type SDKSessionInfo = NeutralSessionInfo;

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
  message: unknown;
  parent_agent_id: string | null;
  parent_tool_use_id: string | null;
  session_id: string;
  /**
   * When the turn was actually written, ISO-8601, as the harness recorded it.
   * Optional in both directions: a daemon older than this field sends nothing,
   * and only the Claude harness has a source for it today (pi and opencode
   * build their entries from records that carry no time). A reader that gets
   * nothing must render no time at all rather than substitute its own clock —
   * stamping the read time dates every turn of an old session to the moment it
   * was opened.
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

/**
 * Whether a user message was put into the session by whiffle rather than typed
 * by the reader.
 *
 * This is what decides whether a harness echoes the message back as a frame.
 * The reader's own words already have a local copy in the dashboard, added when
 * they hit send; anything whiffle injects has no such copy, so unless the
 * harness frames it, it does not appear until the transcript is re-read from
 * disk. That was exactly the bug: rule messages arrived, the session acted on
 * them, and the chat stayed empty until a refresh.
 */
export const isInjected = (origin?: NeutralOrigin): boolean =>
  origin?.kind === "peer" || origin?.kind === "system";

export interface NeutralAssistantMessage {
  /** Blocks already published for this message, preserving row ids across incremental settlement. */
  contentOffset?: number;
  message: { model?: string; content: NeutralAssistantBlock[] };
  parent_tool_use_id?: string | null;
  /** The harness's own event, verbatim, for renderers that need more than this. */
  raw?: unknown;
  session_id?: string;
  type: "assistant";
  uuid?: string;
}

export interface NeutralUserMessage {
  message: { role: "user"; content: string | NeutralContentBlock[] };
  origin?: NeutralOrigin;
  parent_tool_use_id?: string | null;
  /**
   * The {@link QueuedMessage} this turn was: set by the harness on the real
   * message the model finally read, so a client can retire the queued row it
   * has been drawing for it. Absent on every message that never waited — and on
   * every message from a daemon older than the queue frames, whose clients
   * simply never had a queued row to retire.
   */
  queueId?: string;
  raw?: unknown;
  session_id?: string;
  shouldQuery?: boolean;
  type: "user";
  uuid?: string;
}

/**
 * A message the harness has taken but not started yet: sent while a turn was
 * already running, held until the model next pulls its input.
 *
 * The queue used to be private to the adapter — nothing announced an enqueue
 * and no snapshot carried one — so a dashboard could only *guess* that what it
 * sent was waiting, by drawing a local echo it lost on reload. This is the
 * queue as observable state: announced by a `message_queued` system frame,
 * retired by `message_dequeued` (or by the real turn's {@link
 * NeutralUserMessage.queueId}), and listed in the hub's snapshot so a client
 * that joins mid-queue sees what is waiting.
 *
 * `images` is a COUNT. The payloads are megabytes of base64 and the queue is
 * broadcast state — what a reader needs is that pictures are riding with it.
 */
export interface QueuedMessage {
  /** How many images ride with it; absent when none do. */
  images?: number;
  queueId: string;
  /** What was typed, before the harness folded pastes or images into the turn. */
  text: string;
  /** When the harness took it, ISO-8601. */
  timestamp: string;
}

/**
 * The `system` subtype announcing an enqueue — a message the session was too
 * busy to start. Carries the {@link QueuedMessage} fields flat, the way every
 * other system subtype carries its own.
 */
export const MESSAGE_QUEUED = "message_queued";

/** And the one announcing the moment it was consumed: `queueId` alone. */
export const MESSAGE_DEQUEUED = "message_dequeued";

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
  is_error: boolean;
  num_turns?: number;
  raw?: unknown;
  result?: string;
  session_id?: string;
  stop_reason?: string | null;
  subtype: string;
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
  // hook_response
  hook_name?: string;
  images?: number;
  last_tool_name?: string;
  mcp_servers?: { name: string; status: string }[];
  // init
  model?: string;
  patch?: { description?: string; status?: string; error?: string };
  permissionMode?: PermissionMode;
  // message_queued / message_dequeued — the harness's own input queue, made
  // observable ({@link QueuedMessage}). `queueId` is on both; the rest only on
  // the announcement.
  queueId?: string;
  raw?: unknown;
  session_id?: string;
  skills?: string[];
  slash_commands?: string[];
  // status — the session's own word (`compacting`/`requesting`/null), and the
  // task-notification status (`completed`/`failed`/`stopped`), which the SDK
  // also names `status`. Kept as one loose field; the folder reads it per subtype.
  status?: NeutralStatus | string;
  stderr?: string;
  stdout?: string;
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

/* -------------------------------------------------------------- aliases — */
/*
 * One-release aliases. The dashboard imported these names from the SDK's
 * re-export; they are now the neutral types above and mean the same shapes, so
 * the folding layer's imports did not all have to move at once. The `SDK`
 * prefix will go in the coordinated rename.
 */
export type SDKMessage = NeutralMessage;
export type SDKAssistantMessage = NeutralAssistantMessage;
export type SDKUserMessage = NeutralUserMessage;
export type SDKSystemMessage = NeutralSystemMessage;
export type SDKResultMessage = NeutralResultMessage;
export type SDKCompactBoundaryMessage = NeutralSystemMessage;
export type SDKHookResponseMessage = NeutralSystemMessage;
export type SDKStatus = NeutralStatus;

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
