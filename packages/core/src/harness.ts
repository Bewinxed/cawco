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

import {
  ACT_ORIGIN,
  ARTIFACT_ORIGIN,
  ASK_ORIGIN,
  type HarnessKind,
  type ModelInfo,
  type OfferedMode,
  PERMISSION_MODES,
  type PermissionMode,
  PLAN_ORIGIN,
  permissionModeNamed,
} from "./harness/kinds";
import type { AuthState, NeutralOrigin } from "./session-messages";
import { harnessWords } from "./words/harness";

/**
 * Each harness's CLI, by its tool catalog id (core tools.ts `TOOL_CATALOG`):
 * what installing or updating the harness puts on a machine.
 */
export const HARNESS_TOOL: Record<HarnessKind, string> = {
  claude: "claude",
  opencode: "opencode",
  pi: "pi",
};

/**
 * How long one part of a machine's report may take before the agent gives
 * it up for this beat (agent daemon.ts `readPart`), a harness's report among
 * them. Longer than the slowest read that answers (a Claude account's probe
 * waits up to 60 s for initialize, agent accounts.ts); a part past it is a
 * read that will not answer, which held the whole first report back and so
 * the machine's sign-ins with it. The hub waits on a starting machine's
 * harness reports no longer than this (hub server.ts first fleet sync).
 */
export const MACHINE_PART_MS = 90_000;

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
 * The hub's word that it has revoked these session credentials, by the
 * hashes it names them by (hub session-identity.ts): `args[0]`, a list of
 * SHA-256 hex digests. A machine control, sent to every connected machine as
 * the hub revokes them; the machine's redaction store lets them go (agent
 * redaction.ts `forgetRevoked`), as it does those a register's ack names
 * (stream.ts `RegisterAckPayload.revokedCredentials`). An agent from before it
 * answers that it does not know the control, and keeps them.
 */
export const CONTROL_FORGET_CREDENTIALS = "forgetCredentials";
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

/**
 * Why `harness` can't start a session clean (core `SpawnPayload.clean`), or
 * undefined when it can. Claude Code and pi start each session with what its
 * launch says (setting sources and memory off; pi's resource loader without
 * context files, skills or extensions); OpenCode's server is an account's,
 * shared by its sessions, and reads the global and project `AGENTS.md` into
 * every one of them. A harness that can't is refused, never started half
 * clean.
 */
export const cleanStartRefusal = (harness: HarnessKind): string | undefined =>
  harness === "opencode" ? harnessWords.openCodeNotClean : undefined;

/**
 * `mode` as one CawCo offers, or none when none was named. One it does not
 * offer throws, in words that list what it does: a session is never started
 * in a mode other than the one asked for.
 */
export const offeredMode = (
  mode: PermissionMode | undefined
): OfferedMode | undefined => {
  if (mode === undefined) {
    return;
  }
  const offered = permissionModeNamed(mode);
  if (!offered) {
    throw new Error(harnessWords.modeNotOffered(mode, PERMISSION_MODES));
  }
  return offered;
};

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
 * The `system` subtype an agent says for a Claude session whose process ran
 * a manual `/compact`, at the end of each turn it is at rest after it (no
 * turn, no ask, nothing a resume would not bring back). The hub relaunches the
 * session onto its conversation, as for {@link BOUNDARY_RELAUNCH}, so the
 * next `/compact` runs in a process that never held the epoch before it.
 *
 * Why: a second manual `/compact` in one Claude Code process writes every
 * row before the first boundary to the session's `.jsonl` again, with their
 * original uuids; each later one in the same process repeats more
 * (https://github.com/anthropics/claude-code/issues/92089, "a later
 * `/compact` in the same process first re-appends … a copy of every
 * message the process has held"). Claude Code 2.1.309 in a probe session:
 * two compactions in one process wrote 19 rows twice (6.2 MB); with the
 * process resumed after each, none. `CLAUDE_CODE_DISABLE_PRECOMPACT_SKIP`
 * does not stop it (20 rows twice). An automatic compaction leaves no
 * epoch behind to replay: in one process an auto one followed by a manual
 * one wrote 2 rows twice, two auto ones 4, each the prompt that set off an
 * auto compaction and its attachment, written again beside its boundary,
 * the first one in a fresh process too; so none asks for a relaunch. A
 * manual one followed by an auto one replays (21 rows), and is relaunched
 * by the manual one's ask. It never reaches a screen.
 */
export const COMPACT_RELAUNCH = "compact_relaunch";

/**
 * The `system` subtype an agent says for a session whose process names
 * another MCP gateway port than the agent serves on (core
 * `mcpGatewayPort`): one launched before an update moved the default, which
 * reaches none of CawCo's tools. Said at the attach when no turn is running,
 * and at each of its turns' ends; the hub relaunches it onto its
 * conversation between turns, as for {@link BOUNDARY_RELAUNCH}, and the new
 * process names the gateway's port. It never reaches a screen.
 */
export const GATEWAY_RELAUNCH = "gateway_relaunch";

/**
 * The `system` subtype an agent passes a Claude session's `rate_limit_event`
 * on in, its `rate_limit_info` as Claude Code reported it. The hub reads it as
 * the session's account's limit reading; it never reaches a screen.
 */
export const RATE_LIMIT_READ = "rate_limit";

/**
 * The `system` subtype an agent says, once per Claude session start, what the
 * session's Claude Code answered at initialize (`initializationResult()`):
 * who it is signed in as and its plan (core `SessionAccountRead`). The hub keeps
 * the plan as its account's, and reads the account's catalog afresh when it
 * is stale (hub accounts.ts `refreshCatalog`); it never reaches a screen.
 */
export const ACCOUNT_READ = "account";

/**
 * The `system` subtype an agent says, at every Claude launch once its data is
 * in place and before its CLI starts, which account's dir the session's own
 * data is in now (`account_id`, null for the machine's own `~/.claude`): the
 * launch carried it there. The hub's row says that account only from this
 * word on, so no reader with the row looks in a dir before the data arrives;
 * it never reaches a screen.
 */
export const SESSION_DIR_READ = "session_dir";

/**
 * The `system` subtype of the line the hub writes into a session's transcript
 * when its account reached its limit and the hub moved it, held it until the
 * reset, or continued it from a summary: `move` says which, on what account,
 * and what it cost ({@link import("./accounts").accountMoveWords}). Drawn as a
 * hairline divider of its own.
 */
export const ACCOUNT_MOVE = "account_move";

/**
 * The `ui.system_note` subtype of an artifact's responses event: one quiet
 * line naming the artifact, which opens it, and whether the agent has read
 * it yet. Never the person's bubble.
 */
export const ARTIFACT_RESPONSES = "artifact_responses";

/**
 * The `ui.system_note` subtype of a notice: a message CawCo put into the
 * session's conversation for its agent, on a `system` origin no other row
 * reads (a leak, a carry-on, a wake, a restart). `noteTitle` is its line
 * (core words/notices.ts `noticeLine`), `content` the text the agent read,
 * `notice` its kind. The person's transcript draws it as one quiet CawCo
 * row that opens to that text, a run of them with no turn between as one;
 * never as the person's message (transcript-rules.ts `sendRow`).
 */
export const CAWCO_NOTICE = "cawco_notice";

/**
 * Whether a send is the person's own act: their words, their picks or
 * comments on one of the session's artifacts ({@link ARTIFACT_ORIGIN}),
 * their answer to its ask ({@link ASK_ORIGIN}), their changes to a plan
 * ({@link PLAN_ORIGIN}), or another act told in CawCo's words
 * ({@link ACT_ORIGIN}).
 * Any of them may wake a stopped session and reopen finished work.
 */
export const byPerson = (origin: NeutralOrigin): boolean =>
  origin.kind === "human" ||
  (origin.kind === "system" &&
    (origin.name === ARTIFACT_ORIGIN ||
      origin.name === ASK_ORIGIN ||
      origin.name === PLAN_ORIGIN ||
      origin.name === ACT_ORIGIN));

/**
 * The hub's line in a session's transcript where it started again fresh
 * under its id ({@link import("./relaunch").relaunchOf}): its first start never
 * began, so it had no conversation to resume. Drawn as a note titled
 * {@link FRESH_START_LINE}.
 */
export const FRESH_START = "fresh_start";

/**
 * The hub's line that opens the transcript of a session started on a machine
 * its project was moved to for it (core move.ts): what moved, in `content`'s
 * first line, and what stayed, in its second when anything did. Drawn as a
 * note with the done glyph, the conversation's first row.
 */
export const MOVED_HERE = "moved_here";

/**
 * A session whose process its harness's server still holds, which CawCo did
 * not take back after a restart: the agent's signal to the hub, and the
 * hub's line in the session's transcript, which carries why in `content`.
 * Drawn as a note titled by that reason's first sentence, the rest under it.
 */
export const CUSTODY_HELD = "custody_held";

/**
 * A session's process, its workspace or its OpenCode server reached a limit
 * its keeper holds it to: the agent's frame to the hub (`content` says which
 * and what happened, {@link limitSentence}), and the hub's line in the
 * session's transcript, kept on its row. Drawn as a note titled by its first
 * sentence, the rest under it.
 */
export const LIMIT_REACHED = "limit_reached";

/**
 * Something a session started leaks: a process whose memory keeps climbing
 * past its machine's threshold, or processes left running after the command
 * that started them ended (agent leak-watch.ts). The agent's frame to the hub
 * (`content` names what, where and the measurement; `uuid` names the leak, so
 * one said again is told once), and the hub tells the session in its own
 * word, a message it reads (hub server.ts `tellSession`). Nothing is stopped.
 */
export const LEAK_FOUND = "leak_found";

/**
 * A leak the agent told of has ended: every process it named is gone, or
 * the process climbing in memory fell back under the machine's threshold
 * (agent leak-watch.ts). The agent's frame to the hub (`uuid` names the
 * leak, as its {@link LEAK_FOUND} did), and the hub sets the notice it sent
 * for it to `ended` on its record, so its row says so, live and read back
 * (hub server.ts `endLeak`). Nothing is said to the session.
 */
export const LEAK_ENDED = "leak_ended";

/**
 * What a {@link LEAK_FOUND} frame found, as the facts its row's line is
 * made of (the frame's `leak`; core words/notices.ts): how many processes
 * were left running, or which process climbs in memory and how high.
 */
export type LeakFound =
  | { kind: "left"; count: number }
  | { kind: "memory"; command: string; resident: string };

/**
 * A session ended, and the containers its work started were stopped with it
 * (agent session-containers.ts): the agent's frame to the hub (`content`
 * names each container and what was done to it; `uuid` names this ending,
 * so one said again is told once). The hub tells the session that delegated
 * it, else the session itself, in its own word (hub server.ts
 * `tellContainersEnded`).
 */
export const CONTAINERS_ENDED = "containers_ended";

/**
 * A session reaches a container runtime with no door of CawCo's (a
 * `tcp://` or `ssh://` endpoint), so what it starts there does not stop
 * with it (agent session-containers.ts). The agent's frame to the hub as the
 * session launches (`uuid` names it, so one said again is told once), and
 * the hub tells the session, in its own word.
 */
export const CONTAINERS_UNTRACKED = "containers_untracked";

/**
 * A session's start waits for its machine's memory: the machine's room on
 * memory (agent machine-room.ts `measureMemoryRoom`: Linux's memory available
 * and the room under its keeper's cgroup limit; the Mac's pressure level)
 * fails, so its process is not started yet. The
 * agent's frame to the hub (`content`, {@link roomHeldSentence}), and the
 * hub's line in the session's transcript, kept on its row. Drawn as a note
 * titled by its first sentence, the readings under it. The start goes on by
 * itself once the room is back.
 */
export const ROOM_HELD = "room_held";

/**
 * A Claude session's process runs a Claude Code other than its machine's
 * (one launched before a `claude update`), and is not at rest yet: the
 * agent's frame to the hub, once per process and machine version (`content`
 * says both, and that it sleeps once at rest and wakes on the machine's),
 * and the hub's line in the session's transcript, kept on its row. Drawn as
 * a note titled by its first sentence, the rest under it.
 */
export const CLI_OUTDATED = "cli_outdated";

/**
 * CawCo stopped a session's process, and says why in `content`, in the
 * error formula (DESIGN.md, Voice: what happened, why, what starts it again): the
 * agent's frame, a line of the session's transcript. Drawn as an error
 * titled by its first sentence, the rest under it.
 */
export const SESSION_STOPPED = "session_stopped";

/**
 * The hub's line in a session's transcript for what fleet watch did about it
 * (core fleet-watch.ts): a triage's decision, or a notice it raised for you,
 * in the watched session and in its steward's. `content`'s first line is the
 * line ("Same Bash call 3 times in a row · nudged Caw"); the rest, the
 * triage's reason, under it. Drawn as a note; never sent to the session.
 */
export const FLEET_WATCH = "fleet_watch";

/**
 * The hub's line in a project conversation's transcript for one of its
 * notes to the person (hub caw.ts `notice`, core project-conversation.ts `ProjectNote`):
 * `content` is the note as JSON, drawn as a note titled by its title, its
 * body under it, with what its event offers (a made routine's Keep, a design
 * or LFS offer) under that. Never sent to the session.
 */
export const PROJECT_NOTE = "project_note";

/**
 * The hub's line in a session's transcript about its context (core
 * context-filing.ts `ContextLine`): it filed its open items at its
 * compaction policy's threshold, or its harness compacted it, and whether a
 * filing came first. `content` is the line as JSON, drawn as a note titled
 * by what happened, its detail under it. Never sent to the session.
 */
export const CONTEXT_LINE = "context_line";

/** Which limit a keeper's child reached: its task limit, or its memory limit (an OOM kill inside it). */
export type ChildLimit = "tasks" | "memory";

/** What ran into the limit, as a session's own transcript names it. */
export type LimitHolder = "session" | "workspace" | "opencode-server";

const SENTENCE_END = /[.?!](\s|$)/u;

/** A text's first sentence, its full stop kept, and the rest; the whole as the first when it is one sentence. */
export const firstSentence = (text: string): [string, string] => {
  const end = SENTENCE_END.exec(text);
  if (!end) {
    return [text.trim(), ""];
  }
  const at = end.index + 1;
  return [text.slice(0, at).trim(), text.slice(at).trim()];
};

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

/** One of a machine's own sign-ins its provider refused ({@link HarnessReport.signInFaults}). */
export interface SignInFault {
  /** When the refusal came, epoch ms. */
  at: number;
  /** The provider's id in the harness (`anthropic`). */
  provider: string;
  /** What the home says, whole: what was refused, and the fix ({@link opencodeSignInFaultWords}). */
  words: string;
}

/** How the OpenCode on a machine can sign in to a provider again, as its integration's methods say ({@link opencodeSignInFaultWords}). */
export interface OpencodeRenewal {
  /** The credential that does not work is an OAuth (subscription) sign-in, not a key. */
  heldOAuth: boolean;
  /** The integration's id, which `opencode auth login` and `logout` take (`anthropic`). */
  integration: string;
  /** The integration offers an OAuth method: OpenCode can sign in to it again. Without one it takes only a key (Anthropic's on 2.0.28). */
  offersOAuth: boolean;
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
  /**
   * Why a session of this harness cannot start here, without credential
   * data: pi's sign-in unavailable or unchecked, or OpenCode's server
   * refusing to start (and not tried again until its inputs change). The
   * home says it as this machine's word.
   */
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
   * Absent (not empty) from a harness whose catalog could not be read, which
   * then says why ({@link modelsUnread}), and from Claude, whose catalog is
   * each account's (the hub's account catalogs); empty means it was asked and
   * offered nothing.
   */
  models?: ModelInfo[];
  /**
   * Why this harness's catalog could not be read on this read, in the
   * machine's words: OpenCode's server would not start or answer, pi's
   * registry failed. Set exactly when an installed harness that reports its
   * catalog has no {@link models}; a picker says it instead of an empty list.
   */
  modelsUnread?: string;
  /**
   * Why the machine refuses every start of this harness's CLI, its sentence
   * in {@link authReason}: `not-installed`, or `version` (not a version the
   * harness's catalog entry runs: below Claude Code's or pi's floor, not
   * OpenCode's one version, or no version said). Claude's gate is agent
   * claude-version.ts `claudeToStart`; OpenCode's and pi's tools.ts
   * `toolGate`. Absent when it runs. Where the dashboard puts the refusal in
   * place of what it blocks, with the catalog's install of the harness's
   * tool ({@link HARNESS_TOOL}) as its one press (`HarnessBlock`).
   */
  refused?: "not-installed" | "version";
  /**
   * OpenCode only: each of the machine's own OpenCode sign-ins (not a CawCo
   * account) whose provider refused it the last time a session here used
   * it, until a turn on that provider succeeds. The home says each on the
   * machine's row, with the fix ({@link opencodeSignInFaultWords}).
   */
  signInFaults?: SignInFault[];
  /**
   * Claude only: the account dirs (`~/.cawco/accounts/<id>/claude`) Claude
   * Code gave no answer for on this read: its `auth status` ran out of time
   * or printed nothing it could mean. Neither signed in nor out: the hub
   * keeps what it last had for each, and does not read them as gone.
   */
  unreadAccounts?: string[];
  /** The CLI/SDK version, when it can be read. */
  version?: string;
}

/**
 * A harness's report as its machine's agent sends it ({@link
 * HeartbeatPayload.harnesses}). Claude's leaves `auth` out when no account
 * dir answered signed in and some gave no answer ({@link
 * HarnessReport.unreadAccounts}): those dirs have not said, so the machine
 * has no new word. The hub keeps its last one: it files the report with the
 * `auth` of the last it kept of that harness, and keeps none while it has
 * none (the harness then reads as not reported).
 */
export type MachineHarnessReport = Omit<HarnessReport, "auth"> & {
  auth?: AuthState;
};

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
