/** The harness-neutral message schema: every shape a session reports, as the dashboard folds it and the hub peeks it. */

import type { CutCommand } from "./commands/controls";
import { everyOf } from "./every-of";
import type { EffortLevel, HarnessKind, PermissionMode } from "./harness/kinds";

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
    "connected" | "failed" | "needs-auth" | "pending" | "disabled" | string;
  tools?: { name: string; description?: string }[];
}

/* ------------------------------------------------------------- commands — */

/** What the composer's `/` menu renders. Replaces the SDK's `SlashCommand`. */
export interface SlashCommand {
  aliases?: string[];
  argumentHint: string;
  /**
   * Claude Code's own command, as its SDK marks it (`SlashCommand.builtin`,
   * claude-agent-sdk 0.3.296): "Rows can share a name: when a marked row
   * carries it, /name runs that one, and an unmarked row is the one /name
   * runs only when no marked row shares its name." Absent on every other
   * harness.
   */
  builtin?: boolean;
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
  "userSettings" | "projectSettings" | "localSettings" | "session" | "cliArg";

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
  "authenticated" | "unauthenticated" | "unreadable-credentials";

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
  /** The first prompt as its harness listed it, raw: kept for the shipped app; a reader names the session by {@link firstTitle}. */
  firstPrompt?: string;
  /**
   * The first prompt as a title, derived once where the listing is answered
   * (agent session.ts, core `deriveTitleFromFirstMessage`): what a reader
   * names a session with no given title by, never parsing the prompt itself.
   */
  firstTitle?: string;
  gitBranch?: string;
  harness: HarnessKind;
  lastModified: number;
  sessionId: string;
  /**
   * Who started it, where its harness records that. Claude Code writes its
   * `entrypoint` on every record of a transcript: the terminal, the desktop
   * app and the VS Code extension are a person's; `sdk-ts`, `sdk-py`,
   * `sdk-cli` (`claude -p`) and every other are a program's (agent
   * claude.ts `startedBy`). Absent where nothing recorded says: a Claude
   * transcript from before the field, and every OpenCode and pi session
   * (OpenCode's database holds the same fields for a typed session and
   * for `opencode run`; pi's session header names its folder and its
   * parent, never what started it). A list of a person's work draws a
   * stored transcript only when this says `person` (dashboard
   * recent.svelte.ts); search finds every one.
   */
  startedBy?: "person" | "program";
  summary?: string;
  tag?: string;
  /**
   * When the person last sent a prompt in it (ms epoch), read from the
   * transcript at its source: Claude's last `user` record that holds a
   * prompt, not a tool result; OpenCode's last `user` message; pi's last
   * `user` message. Absent when it holds none. What a stored transcript is
   * placed by, as a listed session is by its `wroteAt`: an agent's reply
   * never moves it, where {@link lastModified} moves on every write.
   */
  wroteAt?: number;
}

/**
 * Where a value a stored session ran with was read from: its transcript,
 * the settings of the folder it ran in, the settings of the user it ran as,
 * or, recorded nowhere, its harness's own default.
 */
export type RanFrom =
  "transcript" | "project-settings" | "user-settings" | "default";

/** One value of a {@link StoredRun}, with where it was read. */
export interface RanValue {
  from: RanFrom;
  value: string;
}

/**
 * What a stored session ran with, read on its machine from its own records
 * ({@link CONTROL_STORED_RUN}; agent claude-stored-run.ts, pi-services.ts,
 * opencode.ts): what a session of CawCo's resumes it with, so it goes on as
 * resuming it in its own harness would. A value recorded nowhere is absent,
 * and the resume names none: the harness takes its own.
 */
export interface StoredRun {
  /**
   * The account it resumes on: the one whose folder holds it, or, kept in
   * the machine's own folder, the account signed in on this machine as that
   * folder's login. Null when its login is no account's ({@link signIn}
   * names it): nothing picks one for it. Absent on a harness that keeps no
   * session by account.
   */
  account?: string | null;
  effort?: RanValue;
  model?: RanValue;
  /** Always said by a harness that has modes: a session of CawCo's starts in one. */
  permissionMode?: RanValue;
  /** Who the folder that holds it is signed in as, its email, where it is the machine's own and a login is kept there. */
  signIn?: string;
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
   * CawCo's own word, not the user's and not another session's: a rule that
   * fired, a leak, a wake, a carry-on. `name` is its kind, e.g. `leak` or
   * `rule:Honest caveat`. Kept apart from `peer` so a transcript can say who
   * is really talking — a model that mistakes a rule for the user apologises
   * to nobody. `line` is what the person's transcript says of it in one line
   * (core words/notices.ts), written where it is made, or written again on
   * the send's record when what it tells of changed (an approval that
   * lapsed, hub asks.ts `turnEnded`); the agent never reads it. A transcript draws a `system` send as CawCo's, never as the person's
   * message ({@link CAWCO_NOTICE}). `live`, on a notice of something that
   * runs on (a leak's processes): whether it still does, which the hub sets
   * again on the send's record as it ends ({@link LEAK_ENDED}).
   */
  | {
      kind: "system";
      line?: string;
      live?: "running" | "ended";
      name?: string;
    };

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
/**
 * A notice the harness put in the user's role, as its agent's normaliser
 * read it (agent claude-transcript.ts `harnessNoteOf`): Claude Code's
 * `<task-notification>` block (`task-notification`) and its `[SYSTEM
 * NOTIFICATION …]` line, and a whole `<system-reminder>` block
 * (`system-reminder`). `title` is what a fold says closed, `status` the
 * task's (`completed`, `failed`, `stopped`; empty when it said none), `body`
 * the rest, as markdown. Never the reader's words.
 */
export interface HarnessNote {
  body: string;
  kind: "task-notification" | "system-reminder";
  status: string;
  title: string;
  /** A task notification's Task call, when it names one. */
  toolUseId?: string;
}

export interface NeutralUserMessage {
  /**
   * This message is a compaction's summary, in the harness's own words: pi
   * reports one when a compaction ends. Claude's needs no flag — it opens
   * with words the transcript knows it by.
   */
  compactSummary?: true;
  keepAlive?: true;
  /** `harnessNote`: the message is a notice of the harness's, typed where its normaliser read it ({@link HarnessNote}). */
  message: {
    role: "user";
    content: string | NeutralContentBlock[];
    harnessNote?: HarnessNote;
  };
  origin?: NeutralOrigin;
  parent_tool_use_id?: string | null;
  raw?: unknown;
  /**
   * CawCo's word to the agent about this send (where it came from, which
   * skill applies), kept apart from `message` so the sender's words are the
   * whole of the message: the hub folds it into a `<system-reminder>` block
   * after them each time it hands the send to its machine (hub server.ts
   * `presenced`), and no row, record or Find draws it.
   */
  reminder?: string;
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
 * How a send asks to be read: as a turn of its own, or as a note the next
 * turn folds in (`shouldQuery: false`). Into a running turn, either is read
 * at its next step, a command it is running moved to the background.
 */
export type SendMode = "turn" | "note";

/**
 * Where a send stands, as the hub alone decides it: waiting for the harness
 * (`pending`), taken up by it (`read`), never going to be (`failed`, with
 * why), or sent again as another send (`replaced`).
 */
export type SendState =
  "pending" | "read" | "failed" | "replaced" | "cancelled";

/** Every {@link SendState}. */
export const SEND_STATES = everyOf<SendState>()([
  "pending",
  "read",
  "failed",
  "replaced",
  "cancelled",
]);

/**
 * Why the hub would not hand a send to its session, as the facts the way
 * back is built from: every refusal the hub's input gate gives
 * (`inputRefusal`) and the absent machine.
 *
 * - `account-signed-out`: the session's account is not signed in on its
 *   machine. Signing it in there, or moving the session to an account that
 *   is, lets it run.
 * - `no-account`: no account the session may run on is signed in on its
 *   machine. Signing one in there lets it run.
 * - `machine-away`: the session's machine is not connected.
 * - `item-closed`: finished delegated work, which only its reader, parent or
 *   project's conversation may continue.
 * - `item-superseded`: finished delegated work whose workspace has moved on
 *   to a newer item, the one to message instead.
 * - `workspace-archived`: finished delegated work whose clone is gone.
 *
 * A send whose session has no permission mode to start again on is not one
 * of these: it is a question the page asks ({@link ModeAsk}). The apps in
 * people's hands read this union closed, so a new kind here would break
 * them (hub scripts/wire-compat.ts).
 */
export type SendRefusal =
  | { kind: "account-signed-out"; accountId: string; machineId: string }
  | { kind: "no-account"; machineId: string }
  | { kind: "machine-away"; machineId: string }
  | { kind: "item-closed"; itemId: string }
  | {
      kind: "item-superseded";
      itemId: string;
      latest: { id: string; title: string; instanceId: string | null };
    }
  | { kind: "workspace-archived"; itemId: string; workspaceId: string };

/**
 * A send or a start that has to start its session again (a wake, a rewind)
 * and finds no permission mode it can start it on: its row records none and
 * none was ever chosen for its harness on its machine (the hub's
 * `reviveMode`), or the one it would start on is one its machine doesn't
 * take (`refused`). Not a refusal to show: the page asks for a mode where
 * the person acted, starts the session again on it, and does what was asked.
 */
export interface ModeAsk {
  harness: HarnessKind;
  machineId: string;
  /** The mode it would have started on, which its machine doesn't take; absent when none was named at all. */
  refused?: PermissionMode;
}

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
   * the way to the harness (a worktree line) is not in it.
   */
  body: NeutralUserMessage;
  /**
   * The id the harness stored the send under, where that is not its uuid:
   * opencode's message id, pi's entry id, and — for a send Claude joined into
   * another's record ({@link SessionMessage.joined}) — that record's uuid.
   */
  harnessId?: string;
  /** The session it went to. */
  instanceId: string;
  keepAlive?: true;
  mode: SendMode;
  /** No permission mode to wake its session on: the page asks for one, and it goes again ({@link ModeAsk}). */
  modeAsk?: ModeAsk;
  /** ISO-8601: when its reader read it; absent until then. */
  readAt?: string;
  /** Why it failed, in the harness's words or the hub's. */
  reason?: string;
  /**
   * What refused it, when the hub did: the facts a screen offers the way
   * back from ({@link SendRefusal}). `reason` says it in words.
   */
  refusal?: SendRefusal;
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
 * The `system` subtype saying one of the session's MCP servers did not
 * connect when it started, so the session runs without that server's tools:
 * the server's name in `mcp_server`, the line ({@link mcpNotConnectedLine})
 * in `content`. CawCo's own server not connecting refuses the session
 * instead; this is every other server's.
 */
export const MCP_NOT_CONNECTED = "mcp_not_connected";

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

/**
 * The `system` subtype saying the harness discarded the conversation and goes
 * on in a new one (`session_id` the one it left): Claude Code's
 * `conversation_reset` (SDK `SDKConversationResetMessage`), sent for `/clear`
 * and its aliases, a plan-mode exit that clears the context, a fresh session
 * for an approved plan, and an onboarding re-run. The harness stores no
 * record of it: a session read again draws what its two conversations hold,
 * the send that asked for it and the next conversation's first turn under it
 * (hub `priorEntries`), and nothing for the reset itself. So a transcript
 * draws no row for it live either (core transcript-rules.ts).
 */
export const CONVERSATION_RESET = "conversation_reset";

/**
 * The `system` subtype carrying the reply being written, whole so far: every
 * partial since its message began (`partials`, consecutive deltas joined).
 * An agent sends it as it registers with the hub, for each session part way
 * through a message: what streamed while no hub was listening was dropped,
 * and a hub that started since knows the reply only from what streams after
 * it, while the harness stores a message only once it is written (Claude
 * Code, pi). The hub's transcript draws the running reply from it in place of
 * whatever it painted (`TranscriptBuilder` `restream`), dropping the rows a
 * harness stored of that message while it was being written (`message_id`,
 * opencode). It is never stored, and nothing else reads it.
 */
export const STREAM_SO_FAR = "stream_so_far";

/**
 * The `system` subtype an agent sends a session ahead of what it sends again
 * after a link came back, when it could not keep everything the hub had not
 * acknowledged (agent outbox.ts `OUTBOX_BYTES`): frames between the hub's
 * mark and what it kept are gone. The hub reads the session's transcript
 * from its machine again, so what was stored of them is drawn; what only
 * those frames said (a turn's cost, a report they carried) is lost, said
 * here once. Never stored, and nothing else reads it.
 */
export const FRAMES_LOST = "frames_lost";

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
  /**
   * The id the harness stores the message being written under, where it
   * stores it while it is written (opencode): what {@link STREAM_SO_FAR}
   * names, so a stored copy of the same message is not drawn beside it.
   */
  message_id?: string;
  parent_tool_use_id?: string | null;
  raw?: unknown;
  session_id?: string;
  type: "stream_event";
  uuid?: string;
}

/**
 * What one model spent in one turn. `cacheWrite` is every cache write;
 * `cacheWrite1h` the part of it written with a 1-hour lifetime, absent when
 * the harness does not split it. `costUsd` is the sum of each request's own
 * price (`pricedRequest`, at its prompt's tier and its time), null when
 * the model's provider lists no price for it; a summed turn is never priced.
 */
export interface ModelTurnUsage {
  cacheRead: number;
  cacheWrite: number;
  cacheWrite1h?: number;
  costUsd: number | null;
  input: number;
  model: string;
  output: number;
}

/**
 * One model's entry in a Claude result's `modelUsage`: what the session's
 * process has spent on it so far, restored from the transcript on resume.
 */
export interface ClaudeModelUsage {
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  costUSD: number;
  inputTokens: number;
  outputTokens: number;
}

/**
 * A turn's priced requests summed by model, their costs with them (null once
 * any request of the model went unpriced); a model that spent nothing is left
 * out.
 */
export const usageByModel = (
  requests: Iterable<ModelTurnUsage>
): ModelTurnUsage[] => {
  const byModel = new Map<string, ModelTurnUsage>();
  for (const usage of requests) {
    const held = byModel.get(usage.model);
    if (!held) {
      byModel.set(usage.model, { ...usage });
      continue;
    }
    held.input += usage.input;
    held.output += usage.output;
    held.cacheRead += usage.cacheRead;
    held.cacheWrite += usage.cacheWrite;
    held.costUsd =
      held.costUsd === null || usage.costUsd === null
        ? null
        : held.costUsd + usage.costUsd;
    if (usage.cacheWrite1h !== undefined) {
      held.cacheWrite1h = (held.cacheWrite1h ?? 0) + usage.cacheWrite1h;
    }
  }
  return [...byModel.values()].filter(
    (one) => one.input + one.output + one.cacheRead + one.cacheWrite > 0
  );
};

export interface NeutralResultMessage {
  /**
   * pi and OpenCode: the provider refused the turn at its account's limit,
   * by the structured refusal its harness handed over (core
   * `atProviderLimit`). Claude's is its assistant frame's `error`.
   */
  atLimit?: true;
  /** Prompt-cache tokens the turn read from / wrote to, when the harness reports them. */
  cache?: { read: number; write: number; write5m?: number; write1h?: number };
  /**
   * Where its harness compacts the session on its own, in tokens of context,
   * as its settings and its model stood at the turn's end: Claude Code's
   * auto-compact point, pi's `contextWindow - reserveTokens`, OpenCode's
   * window less its buffer (the agent's harnesses/compaction-points.ts).
   * Absent when the harness compacts on its own at no point it says, or
   * the agent did not say one.
   */
  compactsAt?: number;
  /**
   * pi and OpenCode: the tokens the turn's last request sent (uncached input
   * plus cache reads and writes, as the harness reports that request's
   * usage), which is the session's context as it stood. Claude's is read off
   * {@link promptCacheUsage}.
   */
  contextTokens?: number;
  /**
   * With {@link serverStopped}: the shell commands the turn was running as
   * its server stopped, read off the session's own tool calls (agent
   * session.ts `#shells`), each said interrupted in the turn handed back.
   */
  cut?: CutCommand[];
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
  /**
   * OpenCode: the server the turn ran in stopped before it finished
   * (`session.execution.interrupted` reason `shutdown`, or a reattach that
   * finds the turn unfinished): cut, not ended, so the hub hands it back.
   * `errors` carries the same in words (core `SERVER_STOPPED_MID_TURN`).
   */
  serverStopped?: true;
  session_id?: string;
  stop_reason?: string | null;
  subtype: string;
  /** When the harness stored what it closes on ({@link NeutralAssistantMessage.timestamp}). */
  timestamp?: string;
  total_cost_usd?: number;
  /**
   * OpenCode and pi: the turn's tokens by model, summed over its assistant
   * messages and any compaction it ran. Claude's are read off the change in
   * its cumulative `modelUsage` by the hub.
   */
  turnUsage?: ModelTurnUsage[];
  type: "result";
  uuid?: string;
  /**
   * What the session has arranged to wake itself as the turn ends, set by
   * its harness's adapter on every result it reads ({@link TurnWakes}). The
   * hub pushes a finished turn to the person only when the session waits on
   * nothing of its own (push.ts `turnEnded`).
   */
  wakes?: TurnWakes;
}

/**
 * The work a session started that will wake it later, counted as a turn
 * ends: `background`, its own work still running in the background (a shell
 * command or a monitor, a subagent moved to the background), whose end
 * starts a turn of its own; `scheduled`, the wake-ups it set itself (Claude
 * Code's ScheduleWakeup, CronCreate and `/loop`). Every harness says both:
 * pi and OpenCode schedule nothing, so theirs is 0.
 */
export interface TurnWakes {
  background: number;
  scheduled: number;
}

/** Whether a session whose turn just ended has work of its own that will wake it. */
export const waitsOnItself = (wakes: TurnWakes | undefined): boolean =>
  (wakes?.background ?? 0) + (wakes?.scheduled ?? 0) > 0;

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
 * Whether a request read its prompt from the cache: nearly all of it, as a
 * request whose prefix held does. Under this, it rewrote what it missed.
 */
export const cacheHit = ({
  input,
  read,
}: ReturnType<typeof promptCacheUsage>): boolean =>
  input > 0 && read >= input * 0.9;

/**
 * How a compaction failed, as its harness typed the error it failed on:
 * `kind`, the harness's own sort of it (OpenCode's error `type`, as
 * `provider.timeout`), or `unknown` when it gave none; `status`, the
 * provider's HTTP status when there was one; `message`, its words as said.
 */
export interface CompactionFailure {
  kind: string;
  message: string;
  status?: number;
}

/**
 * A `system` frame. One loose interface rather than a subtype union: the folding
 * layer switches on `subtype` and reads the fields each subtype carries, and a
 * harness that emits a subtype nothing here names degrades to a generic line.
 */
export interface NeutralSystemMessage {
  // account ({@link ACCOUNT_READ}) — what the session's Claude Code said at
  // initialize: who it is signed in as, and its plan
  account?: import("./accounts").SessionAccountRead;
  // session_dir ({@link SESSION_DIR_READ}) — the account whose dir the
  // session's data is in now; null for the machine's own
  account_id?: string | null;
  // commands_changed
  commands?: SlashCommand[];
  /** A failed compaction's words; {@link compact_failure} is what a reader decides on. */
  compact_error?: string;
  /** How a compaction failed, typed ({@link CompactionFailure}); with `compact_result: "failed"`. */
  compact_failure?: CompactionFailure;
  // compact_boundary. `result` and `error`: how it ended, on a boundary read
  // back from a harness that stores that (opencode); live, a `status` frame's
  // `compact_result` says it.
  compact_metadata?: {
    trigger?: "manual" | "auto";
    pre_tokens?: number;
    result?: "success" | "failed";
    error?: string;
    failure?: CompactionFailure;
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
  // mcp_not_connected ({@link MCP_NOT_CONNECTED}) — the server that did not connect
  mcp_server?: string;
  mcp_servers?: { name: string; status: string }[];
  // stream_so_far ({@link STREAM_SO_FAR}) — the id the harness stores the
  // message being written under, when it stores it while it is written
  message_id?: string;
  // init
  model?: string;
  // account_move ({@link ACCOUNT_MOVE}) — what the hub did at the account's limit
  move?: import("./accounts").AccountMove;
  // stream_so_far ({@link STREAM_SO_FAR}) — every partial of the message being
  // written, since it began
  partials?: NeutralStreamMessage[];
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
   * provider_retry ({@link PROVIDER_RETRY}): the provider's own message,
   * when the harness makes its next attempt (ms epoch) if it said, and
   * `atLimit` when the refusal it retries is the account's limit (core
   * `atProviderLimit`).
   */
  retry?: { atLimit?: true; message: string; nextAttemptAt?: number };
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
