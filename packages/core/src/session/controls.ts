/** The control verbs the hub calls on a live session or on its machine for that session, with their answers. */

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

/** What became of one fleet MCP server at the hub. */
export type FleetMcpChangeKind =
  | "signed-in"
  | "signed-out"
  | "config"
  | "added"
  | "removed"
  | "enabled"
  | "disabled";

export interface FleetMcpChange {
  kind: FleetMcpChangeKind;
  name: string;
}

/**
 * Fleet MCP servers changed at the hub (arg: `FleetMcpChange[]`), sent to
 * every live session on a machine once that machine's fleet sync has written
 * the change to its harness files. The session takes it in place: its
 * conversation stays and no new session starts. Answers
 * {@link FleetMcpTakeAnswer}: what each named server reads in the session
 * afterwards. A connect ask's call is answered from it (hub connect-asks.ts).
 */
export const CONTROL_MCP_FLEET_CHANGED = "fleetMcpChanged";

/** What one fleet MCP change came to in one session. */
export interface FleetMcpTaken {
  error?: string;
  /**
   * The server's tools are in the session's tool list now, or connecting
   * where the harness's tool search waits for them: Claude Code's ToolSearch
   * and pi's `tool_search` and codemode wait on a server still connecting.
   */
  holds: boolean;
  kind: FleetMcpChangeKind;
  name: string;
  /** The harness's word for it afterwards, `gone`, or why it was kept as it was. */
  status: string;
  tools?: number;
}

/** {@link CONTROL_MCP_FLEET_CHANGED}'s answer, one entry per change. */
export interface FleetMcpTakeAnswer {
  servers: FleetMcpTaken[];
}
/**
 * Every fleet server the hub proxies that the session holds failed, or
 * connected with fewer tools than the proxy lists (none), or not at all, is
 * taken again as a sign-in would take it (arg: the server names to read, or
 * none for every one). Asked by the machine of a live Claude Code session at
 * its attach and after each fleet sync, unnamed; and by the hub of any
 * session, named, for a connect ask on a server it is signed in to already
 * (hub connect-asks.ts). Answers {@link FleetMcpTakeAnswer}: each named
 * server as the session holds it afterwards, or, unnamed, each it took again.
 */
export const CONTROL_MCP_FLEET_HEAL = "fleetMcpHeal";
/**
 * The machine's own ask of one live Claude Code session, at its attach and
 * after each fleet sync: its flag settings made again from the harness set
 * (the fleet's hooks and Claude Code settings placed at its folder, agent
 * fleet-harness-set.ts), each top-level key that moved applied. Answers
 * `{ applied }`, the keys it applied.
 */
export const CONTROL_FLEET_SETTINGS = "fleetSettings";
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
 * Instance-scoped: what a session's process holds for later that ending it
 * would lose, and no resume brings back (a background command, a one-time
 * wake-up), answered {@link WorkInFlight}, or null when it holds none or has
 * no process. What a continuation that ends the process waits for (hub
 * continuations.ts `waitStep`), as an account move waits (`waitForLater`).
 */
export const CONTROL_WORK_IN_FLIGHT = "workInFlight";

/** What {@link CONTROL_WORK_IN_FLIGHT} answers. */
export interface WorkInFlight {
  /** Since when it has run, epoch ms: its oldest background command's start; null when not known. */
  since: number | null;
  /** In the machine's words: `waiting for work in flight to end: 1 command running`. */
  why: string;
}

/**
 * The live-session controls nothing sent after them depends on. A daemon runs
 * each after whatever is already on its way to the session, but nothing waits
 * for it — `reloadSkills` re-reads every skill (0.7 s measured), and a send
 * behind it sat in the daemon, never reaching the harness, for as long as
 * that took. A fleet MCP change or heal connects servers, which takes as
 * long as their servers take to answer.
 */
export const CONTROL_QUERIES: ReadonlySet<string> = new Set([
  CONTROL_CONTEXT_USAGE,
  CONTROL_WORK_IN_FLIGHT,
  CONTROL_SUPPORTED_MODELS,
  CONTROL_SUPPORTED_COMMANDS,
  CONTROL_RELOAD_SKILLS,
  CONTROL_MCP_STATUS,
  CONTROL_MCP_FLEET_CHANGED,
  CONTROL_MCP_FLEET_HEAL,
]);

/** Machine-scoped session-catalog controls, answered by whichever harness owns the id. */
export const CONTROL_LIST_SESSIONS = "listSessions";
export const CONTROL_GET_SESSION_INFO = "getSessionInfo";
export const CONTROL_GET_SESSION_MESSAGES = "getSessionMessages";
/**
 * What a stored session ran with: args `[sessionKey, dir?]`; answers a
 * {@link StoredRun}, empty for a session its harness has no record of.
 */
export const CONTROL_STORED_RUN = "storedRun";
/**
 * A window of a stored conversation, as it was said: args
 * `[sessionKey, { dir?, window: WindowAsk }]`; answers a `TranscriptWindow`
 * (transcript-types.ts). What the hub builds a transcript from, a window at
 * a time from the newest back, so opening or paging one costs its machine
 * the window and never the file.
 */
export const CONTROL_READ_TRANSCRIPT_WINDOW = "readTranscriptWindow";
export const CONTROL_READ_SESSION_CONTEXT = "readSessionContext";
/**
 * What a spin-off's worktree would take with it if it were discarded, read
 * on its machine now: the commits on its HEAD that no branch or remote of
 * its repository has, and its `git status` entries (untracked files
 * included). A discard saves them to a carry in `~/.cawco/carries` before
 * the worktree goes. Args `[instanceId]`; answers {@link SpinOffHeld}, or
 * null for a spin-off with no worktree of its own. Machine-scoped.
 */
export const CONTROL_SPIN_OFF_HELD = "spinOffHeld";

/** What {@link CONTROL_SPIN_OFF_HELD} answers. */
export interface SpinOffHeld {
  ahead: number;
  dirty: number;
  /** In words: "2 commits on no remote, 3 changed files". */
  holds: string;
  path: string;
}

/** Full-text search across all transcripts on a machine (daemon-scoped). */
export const CONTROL_SEARCH_TRANSCRIPTS = "searchTranscripts";

/**
 * The hub stopped waiting for a read it asked a machine (its deadline
 * passed, or the person's Find asked something newer): args `[requestId]`,
 * the read's own. The machine stops that read where it runs (agent
 * session.ts `registerAbandonable`: {@link CONTROL_SEARCH_TRANSCRIPTS},
 * {@link CONTROL_TRANSCRIPT_TURNS} and {@link CONTROL_TRANSCRIPT_PLACES}),
 * and answers `{ stopped }`, whether it
 * held it. Machine-scoped.
 */
export const CONTROL_ABANDON = "abandon";

/**
 * A conversation's turns as a machine's transcript index holds them
 * (daemon-scoped): args `[TranscriptTurnsQuery]` (core find.ts), answers
 * `TranscriptTurns`.
 */
export const CONTROL_TRANSCRIPT_TURNS = "transcriptTurns";

/**
 * Every place in one conversation where the words stand, as a machine's
 * transcript index holds them (daemon-scoped): args
 * `[TranscriptPlacesQuery]` (core find.ts), answers `TranscriptPlace[]`,
 * oldest first. The person's find in that conversation reads it.
 */
export const CONTROL_TRANSCRIPT_PLACES = "transcriptPlaces";

/** One Claude session the hub has a machine carry into the dir its row names. */
export interface CarrySessionRequest {
  /** The account it is to run on; null for none (the machine's own Claude Code dir). */
  accountId: string | null;
  /**
   * The move has waited its bound for the work this session holds for later
   * (core `RESTART_WAIT_CAP_MS`): its process ends with that work, and the
   * outcome says what ended ({@link MoveEnded}), for the session to hear
   * once it runs on the new account. Only with `stop`.
   */
  endLater?: true;
  /** Its row, whose process the carry stops first when `stop` is set. */
  instanceId: string;
  sessionId: string;
  /**
   * End the session's process first when it is between turns: what a move
   * to another account does before it relaunches the session there with its
   * conversation. A turn running, an ask parked or a send it has not read
   * keep it (`live`), and the move waits for that turn's end. So does work
   * it holds for later (a background task it started, a wake-up its resume
   * would not bring back: `live` with `later`), unless `endLater` is set.
   * Without `stop`, a session whose process runs is left where it is.
   */
  stop?: boolean;
}

/** One background task of a Claude session that a move ended with its process. */
export interface EndedTask {
  description: string;
  /** The last of what it printed (at most 8 KiB), when the CLI could read it. */
  output?: string;
  /** Its output was asked for and not read within this many ms (distinct from no output). */
  outputUnread?: { after: number };
  /** Its id in the conversation the session resumes (a tool_use's background task). */
  taskId: string;
  /** Its kind as Claude Code names it: `local_bash`, `monitor`, `local_agent`, … */
  type: string;
}

/**
 * What a move ended with a session's process ({@link CarrySessionRequest.endLater}):
 * Claude Code restores no background task on resume ("Background Bash and
 * monitor tasks aren't", code.claude.com/docs/en/sessions), and a one-time
 * wake-up only when it was set with CronCreate and its time hasn't passed
 * (a self-paced loop's isn't, code.claude.com/docs/en/scheduled-tasks), so
 * the session is told of each once it runs on the new account.
 */
export interface MoveEnded {
  tasks: EndedTask[];
  /** One-time wake-ups it had scheduled (the Stop hook's `session_crons`, not recurring): CronCreate's or ScheduleWakeup's, which it doesn't say. */
  wakeups: number;
}

/** What one {@link CONTROL_CARRY_SESSIONS} request came to on its machine. */
export type CarrySessionOutcome =
  /**
   * Its data is all in the dir the request named; `entries` were moved there
   * now. `ended`: the work its process held for later, ended with it
   * ({@link CarrySessionRequest.endLater}).
   */
  | { state: "carried"; entries: number; ended?: MoveEnded }
  /**
   * Its process runs, so nothing moved; `why`: what keeps it running, in the
   * machine's words. `later`: only work it holds for later (a background
   * task, a one-time wake-up), which a request with `endLater` ends.
   */
  | { state: "live"; why: string; later?: true }
  /**
   * Nothing moved. `clash`: another carry of the same conversation was
   * copying it at that moment, which passes; nothing says the target's dir
   * is at fault.
   */
  | { state: "failed"; error: string; clash?: true };

/**
 * Machine control (arg: {@link CarrySessionRequest}[]): carries each Claude
 * session's own data into the dir of the account named (core paths/claude.ts
 * `sessionConfigDir`), nothing left in any other. Answered by the machine's
 * supervisor, which knows which sessions run. Answers
 * `Record<instanceId, CarrySessionOutcome>`. The hub sends it before a row
 * says another account, and changes the row only for `carried`.
 */
export const CONTROL_CARRY_SESSIONS = "carrySessions";

/**
 * The models a harness can run on this machine, each with the context window
 * the harness itself reports for it (`ModelInfo[]`). Machine-scoped: answered
 * without a running session, for the hub to check a model's window before it
 * starts one. Harnesses whose models carry no reported window (claude) do not
 * answer it.
 */
export const CONTROL_MODEL_CATALOG = "modelCatalog";

/**
 * The `/` menu a session of a harness would open with in a folder, asked
 * before any session exists there: args `[cwd, account?, model?]`
 * (`account`, a Claude account's id, says whose config dir it is read in;
 * `model`, the one the session would start on: Claude Code's `/effort`
 * names the efforts its model takes); answers
 * {@link SupportedCommands}. Machine-scoped. It is the answer the session's
 * own {@link CONTROL_SUPPORTED_COMMANDS} gives before its MCP servers have
 * connected: the same harness read in the same folder, so the New Session
 * form and the started session's composer list the same commands. An MCP
 * server's prompts join the session's list once its servers connect.
 */
export const CONTROL_FOLDER_COMMANDS = "folderCommands";

/**
 * What git says changed in a directory, for a continuation's artifact index:
 * `git status --porcelain` and `git log --since=<iso> --name-status` — those
 * two commands, nothing else (`GitChanges`). Machine-scoped.
 */
export const CONTROL_GIT_CHANGES = "gitChanges";

/** A directory's git state as {@link CONTROL_GIT_CHANGES} answers it. */
export type GitChanges =
  { repo: false } | { repo: true; status: string; log: string };

/**
 * What an agent answers a machine control it has no function for (agent
 * session.ts): an agent from before a control was added says this of it,
 * and the hub reads it as that agent's word that it holds nothing the
 * control asks of ({@link knowsNotControl}).
 */
export const unknownControlWords = (method: string): string =>
  `unknown session function: ${method}`;

/** Whether `error` is a machine's answer that it has no function for control `method` ({@link unknownControlWords}). */
export const knowsNotControl = (error: unknown, method: string): boolean =>
  error instanceof Error && error.message.includes(unknownControlWords(method));
