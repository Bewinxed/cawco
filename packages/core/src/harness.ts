/**
 * The harness-neutral spine (the 2026-08 rework).
 *
 * CawCo once tunnelled Claude Agent SDK types verbatim — `@cawco/core`
 * re-exported the SDK, the agent spawned `query()` and the dashboard folded SDK
 * messages into view state. Making the product harness-agnostic means the wire,
 * the hub and the dashboard all speak a vocabulary cawco owns, and each
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

/** The harnesses cawco can spawn sessions on. Adding one is a new adapter. */
export type HarnessKind = "claude" | "opencode" | "pi";

/** Recovery is a decided-outcome barrier, never evidence that every session succeeded. */
export interface AgentBusyReport {
  busy: number;
  error?: string;
  instances: string[];
  ready: boolean;
  recovery: "recovering" | "ready" | "failed";
}

/** Reconfigure a retained harness in place; never stop or restart its session. */
export const INSTALL_SESSION_CREDENTIAL = "installSessionCredential";
/**
 * A held session (one this agent attached to rather than launched) proves the
 * credential it already carries: its cawco MCP answers the hub with it, and
 * the hub acknowledges it. The session is not published when it cannot.
 */
export const VERIFY_SESSION_CREDENTIAL = "verifySessionCredential";
/**
 * The hub's word that a session's CawCo tool list changed, for a harness that
 * lists its CawCo tools itself rather than over MCP (pi): it lists them again
 * and replaces them for its next turn.
 */
export const CONTROL_REFRESH_CAWCO_TOOLS = "refreshCawcoTools";
export const LIVE_CREDENTIAL_ENROLLMENT_REFUSAL =
  "Live enrollment refused: this session has other dynamic MCP servers, so installing would restart them. It enrolls on its next fresh start.";

export interface SessionCredentialInstall {
  changedServers?: { name: string; before: string; after: string }[];
  harness: HarnessKind;
  installed: true;
  instanceId: string;
}

export const HARNESSES: readonly HarnessKind[] = ["claude", "opencode", "pi"];

/**
 * How a session answers tool permissions. The union is Claude Code's, plus
 * `fullSend`, CawCo's own: Claude Code's `bypassPermissions` with the host
 * also answering the safety checks the CLI still raises in that mode. Each
 * adapter maps `fullSend` onto its harness; none hands it to an SDK as is.
 */
export type PermissionMode =
  | "default"
  | "acceptEdits"
  | "bypassPermissions"
  | "plan"
  | "dontAsk"
  | "auto"
  | "fullSend";

/**
 * How hard the model thinks, and how much it spends doing it: Claude Code's
 * effort scale, in its own order. Hand-written rather than tunnelled from the
 * SDK — nothing in this file imports a harness SDK, and `@cawco/core` has no
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

/**
 * The effort a session actually sends, as its instance row records it: a level,
 * or {@link EFFORT_NONE} when it sends no effort parameter at all (a model
 * without effort, or effort switched off). A row with no value has not been
 * read yet.
 */
export const EFFORT_NONE = "none";
export type SessionEffort = EffortLevel | typeof EFFORT_NONE;

/** Whether a stored or wire value is one of the {@link EFFORT_LEVELS}. */
export const isEffortLevel = (value: unknown): value is EffortLevel =>
  EFFORT_LEVELS.includes(value as EffortLevel);

/**
 * The `system` subtype an agent says a session's effort in, read back from the
 * harness rather than remembered from a request: `effort` is the level the
 * session will send on its next request, or `null` when it sends none. Said
 * when the session opens, after every effort or model switch, and at each
 * turn's end. The hub writes it on the session's row; it never reaches a
 * screen.
 */
export const EFFORT_READ = "effort";

/**
 * The `system` subtype an agent says, for a Claude session it attached to,
 * that the session's CLI runs a boundary hook that fails open (the form
 * before the workspace's hook script, naming cawco's versioned binary): said
 * at the attach when no turn is running, and at each of its turns' ends. The
 * hub relaunches the session onto its conversation at that turn boundary
 * when it is idle, so it comes back with the hook that refuses instead. It
 * never reaches a screen.
 */
export const BOUNDARY_RELAUNCH = "boundary_relaunch";

/**
 * The `system` subtype an agent passes a Claude session's `rate_limit_event`
 * on in, its `rate_limit_info` as Claude Code reported it. The hub reads it as
 * the session's account's limit reading; it never reaches a screen.
 */
export const RATE_LIMIT_READ = "rate_limit";

/**
 * The `system` subtype an agent says, once per Claude session start, what the
 * session's Claude Code answered at initialize (`initializationResult()`):
 * who it is signed in as, its plan, and the models it offers. The hub keeps
 * it as the session's account's catalog and plan; it never reaches a screen.
 */
export const ACCOUNT_READ = "account";

/**
 * The `system` subtype of the line the hub writes into a session's transcript
 * when its account reached its limit and the hub moved it, held it until the
 * reset, or continued it from a summary: `move` says which, on what account,
 * and what it cost ({@link import("./accounts").accountMoveWords}). Drawn as a
 * hairline divider of its own.
 */
export const ACCOUNT_MOVE = "account_move";

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
  /**
   * The effort the CLI applies when a spawn omits effort, measured by the
   * harness. Null when the model takes none; absent when not measured.
   */
  defaultEffort?: EffortLevel | null;
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
 * Whether a machine's daemon can actually start sessions for a harness. For
 * Claude: whether any CawCo account is signed in on the machine.
 * `unreadable-credentials` is macOS's own failure: Claude Code keeps an
 * account's credentials in the login keychain, and a daemon outside the GUI
 * session is refused the secret (`errSecInteractionNotAllowed`). Generalized:
 * every harness reports its own auth word through the same three states.
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
   * with `summary: true`; pi: a `compaction` entry's `summary`, where the
   * compaction happened, with the tail it kept named by {@link keptFrom}.
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
  keepAlive?: true;
  /**
   * On a compaction summary whose harness kept entries from before it in
   * context: the uuid of the first entry it kept. pi stores its compaction
   * where it happened and names the entry its kept tail starts at, so what
   * the model holds is this summary, the entries from here up to it, and
   * everything after. Absent where the summary is itself the start (Claude,
   * opencode).
   */
  keptFrom?: string;
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
  /**
   * An assistant entry of the message its model ended the turn with, of its
   * own accord: Claude's `stop_reason` `end_turn`/`stop_sequence`, opencode's
   * completed message with `finish` `stop`, pi's `stopReason` `stop`. Absent
   * on a message still being written, one that stopped for a tool call, and
   * one cut short (length, error, abort) — so a turn whose last assistant
   * entry carries this is a finished answer.
   */
  turnEnd?: true;
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
  /** opencode's todos carry one; Claude Code's ledger does not. */
  priority?: "high" | "medium" | "low";
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
      /**
       * The picture as the harness takes it (`base64`), or as the hub's
       * transcript and `send` records carry it: a reference into its media
       * store (`url`), fetched when the picture is shown.
       */
      source:
        | { type: "base64"; media_type: string; data: string }
        | { type: "url"; media_type: string; url: string };
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
   * CawCo's own word, not the user's and not another session's: today, a rule
   * that fired. `name` is what fired it, e.g. `rule:Honest caveat`. Kept apart
   * from `peer` so a transcript can say who is really talking — a model that
   * mistakes a rule for the user apologises to nobody.
   */
  | { kind: "system"; name?: string };

export interface NeutralAssistantMessage {
  /**
   * This message is a compaction's summary, not an answer: opencode writes
   * its summary in the assistant's role (`summary: true` on the message).
   * Its text is the compaction's brief ({@link SessionMessage.compactSummary}).
   */
  compactSummary?: true;
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
  /**
   * This message is a compaction's summary, in the harness's own words: pi
   * reports one when a compaction ends. Claude's needs no flag — it opens
   * with words the transcript knows it by.
   */
  compactSummary?: true;
  keepAlive?: true;
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
 * A message sent to a session, by the reader or by cawco. `uuid` is its one
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
export type SendState =
  | "pending"
  | "read"
  | "failed"
  | "replaced"
  | "cancelled";

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
   * Its row goes right after that. Absent when the hub knew of nothing the
   * session had said: its row then goes after the last row dated before
   * `acceptedAt`, or first when none is.
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
  keepAlive?: true;
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
 * The `system` subtype saying the harness has now consumed these sends: each
 * named in `read` by its uuid, or by the id the harness stored it under
 * ({@link MESSAGES_STORED}). The hub turns it into the records' `read`; it
 * never reaches a screen.
 */
export const MESSAGES_READ = "read";

/**
 * The `system` subtype saying the provider refused the turn and the harness
 * is waiting to try it again: its own words in `content`, and the same as
 * data in `retry` — what the provider said and when the next attempt is.
 */
export const PROVIDER_RETRY = "provider_retry";

/**
 * The `system` subtype saying the agent stopped a session that failed the same
 * way {@link REPEATED_FAILURE_LIMIT} times in a row with no send in between —
 * a harness looping on its own (opencode's overflow compaction retried a
 * request that could never fit, once fifteen times in ninety seconds). Its
 * `content` is the failure's own words.
 */
export const REPEATED_FAILURE = "repeated_failure";

/** How many identical failures in a row stop a session ({@link REPEATED_FAILURE}). */
export const REPEATED_FAILURE_LIMIT = 3;

/**
 * The `system` subtype saying which id the harness stores each send under
 * (`storedAs`, by the send's uuid), said as soon as the harness knows it.
 */
export const MESSAGES_STORED = "stored";

/**
 * The `system` subtype saying the harness now holds these sends (`held`, by
 * uuid) in a queue of its own, before any transcript shows them: Claude's CLI
 * queuing a command — or, `whole`, every send it has been handed. The hub
 * keeps it on the records; it never reaches a screen.
 */
export const MESSAGES_HELD = "held";

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
  cache?: { read: number; write: number; write5m?: number; write1h?: number };
  /** Claude's real turn began after every known prompt write had finished. */
  cacheReusable?: boolean;
  /**
   * pi and OpenCode: the tokens the turn's last request sent (uncached input
   * plus cache reads and writes, as the harness reports that request's
   * usage), which is the session's context as it stood. Claude's is read off
   * {@link promptCacheUsage}.
   */
  contextTokens?: number;
  errors?: string[];
  /**
   * The sends this error failed, set by the hub: read, and answered by nothing
   * but this error. Their rows carry the error, so it draws no line of its own.
   */
  failedSends?: string[];
  is_error: boolean;
  /** Agent receive time of the last main-loop requesting status, epoch ms. */
  lastRequestAt?: number;
  num_turns?: number;
  raw?: unknown;
  /** Read from stored history during recovery, rather than a newly completed turn. */
  recovered?: boolean;
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

/** Claude reports uncached input separately from cache reads and writes. */
export const promptCacheUsage = (result: NeutralResultMessage) => {
  const { cache = { read: 0, write: 0 } } = result;
  const { usage } = result as NeutralResultMessage & {
    usage?: { input_tokens?: number };
  };
  return {
    input: (usage?.input_tokens ?? 0) + cache.read + cache.write,
    read: cache.read,
    write: cache.write,
  };
};

/**
 * A `system` frame. One loose interface rather than a subtype union: the folding
 * layer switches on `subtype` and reads the fields each subtype carries, and a
 * harness that emits a subtype nothing here names degrades to a generic line.
 */
export interface NeutralSystemMessage {
  // account ({@link ACCOUNT_READ}) — what the session's Claude Code said at
  // initialize: who it is signed in as, its plan, and its models
  account?: import("./accounts").AccountProbe;
  // commands_changed
  commands?: SlashCommand[];
  compact_error?: string;
  // compact_boundary. `result` and `error`: how it ended, on a boundary read
  // back from a harness that stores that (opencode); live, a `status` frame's
  // `compact_result` says it.
  compact_metadata?: {
    trigger?: "manual" | "auto";
    pre_tokens?: number;
    result?: "success" | "failed";
    error?: string;
  };
  compact_result?: "success" | "failed";
  // model_fallback
  content?: string;
  cwd?: string;
  description?: string;
  // effort ({@link EFFORT_READ}) — the level the session sends, null for none
  effort?: EffortLevel | null;
  exit_code?: number;
  fallback_model?: string;
  // held ({@link MESSAGES_HELD}) — the sends the harness now holds
  held?: string[];
  // hook_response — a session-start hook that failed, the one hook frame a
  // transcript draws (its output is otherwise startup noise, and never stored)
  hook_name?: string;
  last_tool_name?: string;
  mcp_servers?: { name: string; status: string }[];
  // init
  model?: string;
  // account_move ({@link ACCOUNT_MOVE}) — what the hub did at the account's limit
  move?: import("./accounts").AccountMove;
  patch?: { description?: string; status?: string; error?: string };
  permissionMode?: PermissionMode;
  // rate_limit ({@link RATE_LIMIT_READ}) — the `rate_limit_info` Claude Code reported
  rate_limit_info?: import("./usage/observed").ObservedRateLimitInfo;
  raw?: unknown;
  // read ({@link MESSAGES_READ}) — the sends the harness has now consumed
  read?: string[];
  /**
   * task_notification: the report a finished task handed back. Claude's live
   * frame carries none; its stored notification (`<result>`) does.
   */
  result?: string;
  /**
   * provider_retry ({@link PROVIDER_RETRY}): the provider's own message, and
   * when the harness makes its next attempt (ms epoch) if it said.
   */
  retry?: { message: string; nextAttemptAt?: number };
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
  /**
   * held ({@link MESSAGES_HELD}): `held` is every send the harness has been
   * handed. Said by an agent taking over a process that outlived the one
   * before it, off the process's own output: a send from before then that is
   * not in it never reached the process.
   */
  whole?: boolean;
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

export type NeutralMessage = (
  | NeutralAssistantMessage
  | NeutralUserMessage
  | NeutralStreamMessage
  | NeutralResultMessage
  | NeutralSystemMessage
  | NeutralRawMessage
) & { keepAlive?: true };

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
  /** Peer-to-peer hand-off tools (`mcp__cawco__*` for claude). */
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
  /**
   * Claude only: every account's config dir on the machine
   * (`~/.cawco/accounts/<id>/claude`) and what `claude auth status` said of
   * it there. The hub reads it as where each account is signed in. The
   * machine's own `~/.claude` is never read.
   */
  accounts?: import("./accounts").AccountReport[];
  auth: AuthState;
  /** Why sign-in is unavailable or could not be checked, without credential data. */
  authReason?: string;
  capabilities: HarnessCapabilities;
  harness: HarnessKind;
  installed: boolean;
  /**
   * pi only: the model each bare model id pi offers resolves to, by pi's own
   * resolver (`resolveCliModel`) with this machine's accounts counted as
   * signed in, as `provider/id`. A name pi cannot resolve is absent. The hub
   * reads the provider, and so the account, of a session started on one of
   * them here. `default` depends on the session's directory and is asked
   * per start ({@link CONTROL_PI_DEFAULT_MODEL}).
   */
  modelNames?: Record<string, string>;
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
export const CONTROL_WITHDRAW_SEND = "withdrawSend";
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
/**
 * Puts a session to sleep now if it is at rest: its machine stops everything
 * the session runs (the harness, the MCP servers it started, their browsers)
 * and says so with an `asleep` frame; its conversation stays, and its next
 * message wakes it. The machine does nothing while stopping would lose
 * something (see `SessionSupervisor.sleep` in the agent). No harness answers
 * this one: the machine's supervisor does. Answers
 * `{ asleep: boolean; awake?: string }`, `awake` being what kept it up.
 */
export const CONTROL_SLEEP = "sleep";
/**
 * Machine control: which of the sessions named (arg: instance ids) are not
 * at rest by {@link CONTROL_SLEEP}'s own test, leaving out the hub's
 * keep-alive, which is the hub's to drop. Stops nothing and asks nothing of
 * any session. Answers `Record<instanceId, why>`, one entry for each session
 * that is not at rest; a session the machine does not carry is at rest.
 */
export const CONTROL_RESTLESS = "restless";

/**
 * The live-session controls that only answer a question: nothing sent after
 * one depends on its answer. A daemon runs each after whatever is already on
 * its way to the session, but nothing waits for it — `reloadSkills` re-reads
 * every skill (0.7 s measured), and a send behind it sat in the daemon,
 * never reaching the harness, for as long as that took.
 */
export const CONTROL_QUERIES: ReadonlySet<string> = new Set([
  CONTROL_CONTEXT_USAGE,
  CONTROL_SUPPORTED_MODELS,
  CONTROL_SUPPORTED_COMMANDS,
  CONTROL_RELOAD_SKILLS,
  CONTROL_MCP_STATUS,
]);

/** Machine-scoped session-catalog controls, answered by whichever harness owns the id. */
export const CONTROL_LIST_SESSIONS = "listSessions";
export const CONTROL_GET_SESSION_INFO = "getSessionInfo";
export const CONTROL_GET_SESSION_MESSAGES = "getSessionMessages";
export const CONTROL_READ_SESSION_CONTEXT = "readSessionContext";
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

/**
 * Makes a delegation workspace: a shared clone (`git clone --shared`) of the
 * repository at `cwd`, at `~/.worktrees/<repo>-<id8>` on a new branch
 * `ws/<id8>` cut from the repository's default branch (what `origin` names as
 * its HEAD, fetched as the clone is cut), its `origin` the
 * repository's own remote — and the workspace's boundary, which every shell
 * command of its work items runs inside. Args `[cwd, workspaceId]`; answers
 * {@link WorkspaceCheckout}. Machine-scoped; a directory that is not in a git
 * repository with an `origin` is refused, and so is a machine that cannot
 * hold the boundary.
 */
export const CONTROL_WORKSPACE_CREATE = "workspaceCreate";

/** Total git budget for cutting a workspace, including its remote fetch and checkout. */
export const WORKSPACE_GIT_TIMEOUT_MS = 300_000;
/** How long a new boundary may take to announce readiness. */
export const WORKSPACE_BOUNDARY_START_TIMEOUT_MS = 15_000;
/** Git and boundary budgets, plus a minute for setup, teardown and control transport. */
export const WORKSPACE_CREATE_TIMEOUT_MS =
  WORKSPACE_GIT_TIMEOUT_MS + WORKSPACE_BOUNDARY_START_TIMEOUT_MS + 60_000;

/** Where {@link CONTROL_WORKSPACE_CREATE} put a workspace. */
export interface WorkspaceCheckout {
  /** The repository's default branch, which the clone was cut from and lands on. */
  base: string;
  /** The boundary's anchor: the process its commands join. */
  boundaryPid: number;
  branch: string;
  /** The clone's root, where every work item of the workspace runs. */
  path: string;
  /** The repository the clone was cut from. */
  repoRoot: string;
}

/** A workspace as the machine that holds it is told about it. */
export interface WorkspaceRef {
  id: string;
  path: string;
}

/**
 * The workspace's boundary, running: started again when it is not (after a
 * reboot, or a sessiond restart). Args `[WorkspaceRef]`; answers the anchor's
 * pid. Refused — with the reason — when the machine cannot hold one.
 */
export const CONTROL_WORKSPACE_BOUNDARY = "workspaceBoundary";

/**
 * Archives a workspace on its machine: its boundary is killed, with every
 * process in it, and its clone is deleted. Args `[WorkspaceRef]`, or `[{ id }]`
 * for an unfiled create: the machine's create record names its clone.
 */
export const CONTROL_WORKSPACE_ARCHIVE = "workspaceArchive";

/**
 * At an agent's start, its machine's active workspaces: each one still a git
 * worktree from before workspaces were clones becomes a shared clone in
 * place — same path, branch, HEAD, index and working files — and the
 * repository it was cut from forgets the worktree. A workspace whose folder
 * is gone is skipped and named in the machine's log. Args `[WorkspaceRef[]]`.
 */
export const CONTROL_WORKSPACE_MIGRATE = "workspaceMigrate";

/**
 * Runs a shell command on a machine, in a directory, killed with its process
 * group after a limit (exit 124). Args `[cwd, command, timeoutMs?, workspace?]`;
 * answers {@link CommandResult}. A command that writes more than 8 MiB across
 * stdout and stderr is killed with its process group and the call fails with
 * an error naming the limit. The hub's one way to run something on a machine:
 * a workflow's `w.exec`, and a work item's acceptance checks. A
 * {@link WorkspaceRef} runs the command inside that workspace's boundary,
 * exactly as its sessions' shell commands run; a machine that cannot start the
 * boundary fails the call with its reason.
 */
export const CONTROL_RUN_COMMAND = "runCommand";

/**
 * What {@link CONTROL_RUN_COMMAND} answers: both streams complete, each
 * decoded as UTF-8 once the command has ended. Never truncated: past 8 MiB
 * across the two, the call fails instead.
 */
export interface CommandResult {
  exitCode: number;
  /** Everything the command wrote to stderr. */
  stderr: string;
  /** Everything the command wrote to stdout. */
  stdout: string;
}
