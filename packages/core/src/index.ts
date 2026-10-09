import { CAWCO_MCP_DEFAULT_PORT, type FleetSyncReport } from "./fleet";
import type { HarnessReport } from "./harness";
import type { ToolStatus } from "./tools";

// A project's views: CawCo's A2UI catalog, a view's file, and the data it binds to.
// biome-ignore lint/performance/noBarrelFile: this is the package's public API surface — packages/core's consumers (hub, cli, dashboard) import from "@cawco/core" as one module, not per-file.
export * from "./a2ui-catalog";
// Accounts: several sign-ins per provider, and which one a session runs on.
export * from "./accounts";
// "Continue in new session": the size rules the hub and the dashboard share.
export * from "./archive";
// Files and texts a turn carries, and the line naming each attached file.
export * from "./attachments";
// Claude Code's dir names, as a screen, a message or a shell script names them (paths.ts owns the paths).
export * from "./claude-dirs";
export * from "./continuation";
// Delegate types: named presets the `delegate` tool's `type` param resolves,
// so routing is by description instead of a raw model string.
export * from "./delegate-types";
// Fleet MCP + skills desired state, sync reports, and the `/` menu (NEW.md §11).
export * from "./fleet";
export * from "./frames";
// The harness-neutral spine (2026-08 rework). CawCo owns these types; the
// harness adapters (claude, opencode, pi) translate their native events into
// them, the hub peeks them, the dashboard folds them. See harness.ts for the
// rules. The `SDK*` names are kept for one release so the dashboard's imports
// did not all have to move at once; they are neutral types, not the SDK's.
export * from "./harness";
// Hooks the fleet keeps: the lifecycle event, the matcher, and the script the
// machines run. The matcher's three-way reading lives here so the editor's test
// box previews exactly what Claude Code will do with it, and `hookProblem` is
// shared so the hub and the form refuse the same drafts for the same reasons —
// this is the one row whose convergence executes code, so it is gated twice.
export * from "./hooks";
export * from "./injected";
// Adding a machine: the join routes' shapes and the install script's step
// prefix, which `cawco binary-install agent` prints and the hub reads back off SSH output.
export * from "./join";
// Moving a project to a machine without a checkout of it: the hub-owned job,
// its estimate and request, and the hub ↔ machine controls that run its steps.
export * from "./move";
// What a permission prompt says on every surface, stamped by the hub as it
// parks the ask: the summary, who asked, the change it makes, its fields.
export * from "./permission-presentation";
// A session's plan: its steps, its spec, its task's to-dos, and their live frames.
export * from "./plan";
// Which projects a session lists in: the rail and the hub's forget read one rule.
export * from "./project-membership";
// How an `AskUserQuestion` answer is shaped, wherever it is answered from —
// the dashboard, a parent session's `answer_delegate`, the Telegram bridge.
// Shared because the tool's schema is unforgiving: the answers go back inside
// the tool's own input or the call fails validation.
export * from "./question";
// The bounded replay ring behind the Ledger Protocol — SessionRing, lifted
// from packages/hub/src/stream.ts so sessiond's per-child ring (see
// sessiond.ts) can reuse the identical class.
export * from "./ring";
// Standing instructions the hub enforces on every session: a phrase to watch
// for and a reply to send back. The matcher lives here so the hub and the
// editor's test box decide identically.
export * from "./rules";
// The Ledger Protocol: canonical session streams + acknowledged commands.
export * from "./stream";
// A project's threads with its Caw: rows, messages and their frames.
export * from "./threads";
// The workflow-tool catalog and its status/policy shapes (NEW.md §10).
export * from "./tools";
// Transcripts: the hub folds each session's frames into blocks once
// (TranscriptBuilder) and every client renders what it serves.
export { TRANSCRIPT_PAGE, TranscriptBuilder } from "./transcript";
export {
  COMPACT_SUMMARY_KIND,
  getToolGlance,
  interruptLine,
  transcriptUserText,
} from "./transcript-rules";
export * from "./transcript-types";
// Usage, cost & limits (USAGE-SPEC.md §4). Pure types/math only.
export * from "./usage";

// sessiond's protocol types are deliberately NOT re-exported here. That module
// reaches for `node:os` and `node:path` to derive its endpoint, and this barrel
// is imported by the dashboard — a browser bundle, where Vite externalises
// `node:*` and the first property access throws, taking the whole client module
// down with it. Import them from `@cawco/core/sessiond` instead; the subpath
// export exists for exactly that, as `./usage/opencode-go` already does.

// How a session with no given title names itself: its first user message,
// cleaned. Shared so the hub's derived title and the dashboard's transcript
// title are the same string, character for character.
export * from "./title";

/** The whole agent↔hub↔dashboard protocol. Adding a verb is a design decision. */
export type Verb =
  | "register"
  | "heartbeat"
  | "spawn"
  | "send"
  | "stop"
  | "control"
  | "frames"
  | "fs"
  | "usage";

/**
 * Every message on every hop. `payload` is whatever the verb carries — a neutral
 * message, a harness option object, a control call — passed through. The hub
 * routes on the envelope fields and peeks only what harness.ts names.
 */
export interface Envelope<T = unknown> {
  instanceId?: string;
  machineId: string;
  payload: T;
  /** The `requestId` when the payload correlates to a permission or control reply. */
  requestId?: string;
  verb: Verb;
}

/**
 * `spawn`: start a session on a harness. `harness` chooses the adapter (absent
 * means `claude`, for every caller written before harnesses existed); `options`
 * rides through to that adapter verbatim — only the callbacks the agent must own
 * itself (`canUseTool`/permission hooks, abort) are filled in on arrival, since
 * functions do not survive the wire. `resume` is the harness-neutral way to
 * re-open or fork a stored session; `persistSession: false` asks for a session
 * that is never stored (a spin-off's transcript).
 */
export interface SpawnPayload {
  /**
   * The account the session must run on, picked by whoever started it (the
   * dashboard, `delegate`, `start_session`). The hub refuses a pick the
   * session's machine, project or task does not allow, and never forwards
   * this field: what reaches the machine is {@link accountDir}.
   */
  account?: string;
  /**
   * The account the hub placed the session on, and so the store it runs
   * from on the machine: Claude Code in the account's own
   * `~/.cawco/accounts/<id>/claude`, never the machine's `~/.claude`; pi on a
   * runtime whose `openai-codex` sign-in is the account's
   * `~/.cawco/accounts/<id>/pi/auth.json`; OpenCode in the account's own
   * server, whose `XDG_DATA_HOME` (and so OpenCode's own store, holding the
   * account's credential alone) is `opencode-accounts/<id>` beside the
   * session credentials, hidden from every workspace boundary.
   * Set by the hub on every launch of a session on an account — the first and
   * every revive, restore and relaunch — and never by a client. A Claude
   * launch without one (or a {@link homeLoginMove}) is refused on the
   * machine; a pi or OpenCode launch without one runs from the machine's own
   * stores.
   */
  accountDir?: { accountId: string };
  /**
   * Start from a repository instead of a directory that is already there: the
   * agent clones `repo` — `owner/name`, or any URL git understands — into a
   * subdirectory of `baseDir` and runs the session in the clone.
   */
  bootstrap?: { repo: string; baseDir: string };
  /**
   * Whether this session may spawn sessions of its own (`delegate` and
   * `start_session`). Set by the `delegate` tool's `can_delegate` param; a
   * delegate that is not granted it is a leaf: claude and pi never give it the
   * spawning tools, and the hub refuses any spawn naming it as parent. Absent
   * on a session nobody delegated (a mainline session may always delegate).
   */
  canDelegate?: boolean;
  /**
   * "CawCo's to-dos" for this session whatever the fleet says: its delegate
   * type's `cawcoTodos`. The agent adds {@link cawcoTodosDenied} when this or
   * the fleet's choice is on.
   */
  cawcoTodos?: boolean;
  cwd: string;
  /**
   * The delegate type it was started as: its name, and the project whose
   * catalog it came from (none: the fleet's). The hub keeps both on the row.
   */
  delegateType?: { name: string; projectId?: string };
  /**
   * Tools this session may never call, beyond whatever the harness already
   * denies. Set by a resolved {@link DelegateType}'s own `denyTools`; the
   * claude adapter merges it into the `disallowedTools` it already assembles.
   */
  denyTools?: string[];
  /**
   * How hard that model thinks, and how much it spends doing it. Hoisted for
   * the same reason again — and it is the third setting a `setEffort`
   * {@link ControlPayload} can still move mid-session. Absent leaves the level
   * to the harness, which is not the same as asking for its default: only the
   * model knows which stops it has.
   */
  effort?: import("./harness").EffortLevel;
  /** Which harness runs the session. Absent = `claude`. */
  harness?: import("./harness").HarnessKind;
  /**
   * The machine's own Claude Code login is moving into this account
   * (`POST /api/accounts/move-login`) and has not moved yet, so this Claude
   * session runs on that login: Claude Code with no `CLAUDE_CONFIG_DIR`, in
   * the machine's own store, where the credential still is. Set by the hub
   * alone, on a Claude launch with no {@link accountDir}, and only while
   * that move is pending. A machine that has moved the login by the time the
   * launch starts runs the session in the account's dir instead.
   */
  homeLoginMove?: { accountId: string };
  /** Hub ingest cursor for a recovery sent after the registration handover. */
  ingested?: import("./stream").IngestMark;
  instanceId: string;
  /** The in-flight maintenance send a surviving Claude process is answering. */
  keepAliveTurn?: string;
  /**
   * This spawn is a project's Caw (a `lead` row): the machine gives it
   * CawCo's MCP server and no other. Set by the hub alone, on every launch
   * of a lead row, and never taken from a caller.
   */
  lead?: true;
  /**
   * Which model answers, from the session's first turn. Hoisted for the same
   * reason as `permissionMode`. Absent leaves the choice to the harness.
   */
  model?: string;
  /** Harness-specific spawn options, passed through verbatim. */
  options?: unknown;
  /**
   * The session this spawn is a delegate of: the child nests under it in every
   * rail, and `toolUseId` names the delegating tool call so the parent
   * transcript can render the round trip.
   */
  parent?: { instanceId: string; toolUseId?: string };
  /**
   * How the session answers tool permissions. Hoisted out of `options` because
   * it is the one option the user keeps choosing — and the only one they can
   * still change afterwards, with a `setPermissionMode` {@link ControlPayload}.
   */
  permissionMode?: import("./harness").PermissionMode;
  /** `false` asks the harness never to store this session's transcript. */
  persistSession?: boolean;
  /** Hub-owned launch identity, retained when reattaching a surviving process. */
  processGeneration?: string;
  /** The project this session was started from, when it was started from one. */
  projectId?: string;
  /** Existing custody only: `busy` recovers active turns; `inspect` only reports them. */
  reattachOnly?: boolean | "busy" | "inspect";
  /**
   * The process the session runs in is replaced, though the spawn resumes
   * its own conversation: it moves to another account. Without it, a resume
   * for a session the machine carries is a recovery of that process, and
   * the process is kept.
   */
  relaunch?: true;
  /**
   * Correlates the `control_result` frame the agent answers the spawn with, once
   * the session is in place.
   */
  requestId?: string;
  /**
   * Re-open (or fork) a stored session. `sessionKey` is the harness's own
   * session id; `fork` reads the origin conversation into a new one; `atMessage`
   * resumes through that assistant turn in Claude; OpenCode reverts from
   * the selected user turn. A fork includes its anchor in either harness.
   */
  resume?: { sessionKey: string; fork?: boolean; atMessage?: string };
  /**
   * The toolset the session runs in, written on its row at this first spawn
   * and kept there: a project's Caw is `lead`, a delegate type's `role` its
   * work item's. Absent: the hub derives it (`delegate` or `worker`).
   */
  role?: import("./delegate-types").SessionRole;
  /**
   * A spin-off (NEW.md §1): throwaway work. `worktree` runs the session in a
   * detached git worktree of `baseCwd` (the spawn's `cwd` when absent) so the
   * experiment cannot touch the checkout the mainline session is using.
   */
  scratch?: { worktree?: boolean; baseCwd?: string };
  scratchWorktree?: ScratchWorktree;
  /** Hub-minted session credential: delivery only, never transcript or instance metadata. */
  sessionCredential?: string;
  /**
   * Skill names to load natively before the first prompt. Each harness loads
   * them via its own mechanism — opencode sends `/skill` commands, claude pushes
   * them into the input stream — so the delegate session sees the skill the same
   * way it would if the user had typed the slash command.
   */
  skills?: string[];
  /**
   * The session that asked for this spawn — provenance, not nesting. Unlike
   * {@link parent}, it neither nests the child nor routes reports; it is what
   * the hub checks {@link canDelegate} against, so a leaf cannot `start_session`
   * its way around the rule.
   */
  spawnedBy?: { instanceId: string };
  /**
   * What the session is for, one line — a delegate's brief headline. Display
   * only.
   */
  title?: string;
  workflowRunId?: string;
  workflowStepId?: string;
  /**
   * The workspace whose boundary every shell command of this session runs
   * inside. Set on each spawn of a work item's session — the first, and every
   * restore, revive and relaunch after it — and on no other session. A
   * machine that cannot hold the boundary refuses the spawn and says why.
   */
  workspace?: import("./harness").WorkspaceRef;
}

/** One repository a machine can {@link SpawnPayload.bootstrap} from. */
export interface RepoInfo {
  description: string;
  nameWithOwner: string;
  updatedAt: string;
  visibility: "PUBLIC" | "PRIVATE" | "INTERNAL";
}

/**
 * What the machine-scoped `listRepos` control answers with. The GitHub CLI is
 * the machine's own credential store — cawco never holds a token.
 */
export type ReposResult =
  | RepoInfo[]
  | { error: "gh-missing" | "gh-unauthenticated" };

const TRAILING_SLASHES = /\/+$/;
const URL_SCHEME_AND_HOST = /^[a-z][a-z0-9+.-]*:\/\/[^/]+\//i;
const SCP_LIKE_HOST = /^[^/]+@[^:]+:/;
const DOT_GIT_SUFFIX = /\.git$/;

/** `owner/name`, however the repository was written. */
export const repoPath = (repo: string): string =>
  repo
    .trim()
    .replace(TRAILING_SLASHES, "")
    .replace(URL_SCHEME_AND_HOST, "")
    .replace(SCP_LIKE_HOST, "")
    .replace(DOT_GIT_SUFFIX, "");

/** `send`: one turn of input for a live session's prompt stream. */
export interface SendPayload {
  /**
   * Text the user pasted rather than typed, kept out of `message` so the agent
   * can fold it into the turn as quoted material the model won't mistake for
   * the sentence around it; and files, by the hub's reference, which the
   * agent fetches onto the session's machine and names by path in `message`.
   */
  attachments?: import("./attachments").SendAttachment[];
  /**
   * This hand-off of the send to its machine, stamped by the hub each time it
   * hands the send on. A machine handing the send back (`held_send`) names
   * it, so a hand-back a later hand-off overtook is not owed twice.
   */
  delivery?: string;
  /** The instance a fleet-originated send claims as its caller. */
  from?: string;
  /** Images the turn carries: base64, with no `data:` URI prefix. */
  images?: { mediaType: string; data: string }[];
  instanceId: string;
  /** The user turn, under the uuid it keeps everywhere it is shown. */
  message: import("./harness").SentMessage;
  /**
   * Force delivery: a busy claude session reads it mid-turn via `streamInput`;
   * opencode/pi interrupt the turn and deliver it as the immediate next one. The
   * hub honours urgency only when the target is `from`'s own delegate; otherwise
   * it downgrades to a normal queued send.
   */
  urgent?: boolean;
}

/**
 * `heartbeat`: the daemon's 15s pulse. `instances` is the supervisor's live
 * instance-id list (`SessionSupervisor.instanceIds`), sent on every beat so the
 * hub can reconcile session truth continuously rather than only at `register` —
 * a session the daemon has quietly dropped (crash, OOM kill, a restart that
 * never came back) stops appearing here well before any human notices, and one
 * a register missed because it raced a spawn shows up on the very next beat.
 */
export interface HeartbeatPayload {
  at: number;
  /** The machine's binary update state, live on every beat. */
  binaryUpdate?: import("./binary-updates").BinaryUpdateState;
  /** Fresh sessiond custody after an owner-named stop or register recovery. */
  custody?: SessionCustody;
  custodyComplete?: true;
  /**
   * What each harness adapter on the machine can do, and whether it is
   * installed and authenticated. Rides one beat per connection, sent the
   * moment the daemon's probes finish, and never the 15s cadence: the probes
   * spawn processes (claude's starts a real Claude Code), and a register that
   * waited for them kept the machine out of the hub's registry for seconds
   * after every hub restart. Sent again only when a sign-in it reports
   * changed (pi's default provider, a Claude Code dir's login); absent from
   * every other beat.
   */
  harnesses?: HarnessReport[];
  /**
   * A fingerprint of the machine's own pi and OpenCode credential stores
   * (never their contents). Rides the beat `harnesses` rides, and again
   * whenever it changed: the hub moves what they hold into accounts each
   * time it differs from the last one it heard on this connection.
   */
  homeStores?: string;
  instances: string[];
  /**
   * Every account of a provider other than Claude's with a store on the
   * machine (`~/.cawco/accounts/<id>/credential.json`), and who it is signed
   * in as there: the one credential every harness on the machine uses for
   * that provider. Rides the beat `harnesses` rides, and again whenever one
   * changed.
   */
  providerAccounts?: import("./accounts").AccountReport[];
  /**
   * The providers an account can be for on this machine: pi-ai's joined with
   * OpenCode's ({@link import("./accounts").joinProviders}). Rides the beat
   * `harnesses` rides.
   */
  providers?: import("./accounts").ProviderInfo[];
  /**
   * When each conversation in a catalog read from a harness's server
   * (OpenCode's) last changed, ms epoch, by session id. Rides one beat per
   * connection, once that catalog is read: reading it starts the server, and
   * a cold OpenCode start took 72s with no internet, so the register carries
   * only the catalogs read from disk.
   */
  resumableAt?: Record<string, number>;
  /** Exact server-session addresses; an empty array also declares the acknowledgement contract. */
  sessionAddresses?: SessionAddress[];
  /**
   * What the machine has of the tool catalog (NEW.md §10), so the hub can send
   * an install for whatever its policy requires and this machine lacks. Rides
   * the same beat as `harnesses`, for the same reason.
   */
  tools?: ToolStatus[];
}

/**
 * The hub's answer to a `heartbeat`. `keepAwake` is every session the beat
 * listed that the hub holds something for which only the hub knows of and
 * which needs the session's process: today, a prompt cache its keep-alive is
 * pinging to keep warm. The whole list on every beat, so the machine replaces
 * what it held; it puts none of them to sleep.
 */
export interface HeartbeatAckPayload {
  keepAwake: string[];
  ok: true;
}

/** `stop`: interrupt and close a live session. */
export interface StopPayload {
  /** Addresses claimed by other rows; only unclaimed server runners make a legacy read ambiguous. */
  claimedSessionIds?: string[];
  cwd?: string;
  /** Explicitly abort unadopted custody too, then tear down spin-off resources. */
  discard?: boolean;
  /** The instance a fleet-originated stop claims as its caller; the hub honours the call only when the target is that instance's own delegate. */
  from?: string;
  /** Row-owned coordinates for ending server custody without adoption. */
  harness?: import("./harness").HarnessKind;
  instanceId: string;
  /** The row's launch identity, including a held process not yet attached. */
  processGeneration?: string;
  /** Correlates the `control_result` frame confirming stop/discard or its failure. */
  requestId?: string;
  scratchWorktree?: ScratchWorktree;
  sessionId?: string;
  /** Connection-local hub order, echoed by reads begun after receipt. */
  stopSequence?: number;
}

/**
 * `control`: invoke a named method on a live session, or on the machine when
 * `instanceId` is absent. The method is one of the neutral names in harness.ts
 * ({@link CONTROL_INTERRUPT}, …) plus {@link RESOLVE_PERMISSION}; the reply
 * comes back as a `control_result` frame carrying the same `requestId`.
 *
 * Machine-scoped, `method` names either a session-catalog operation — routed to
 * whichever harness owns the id (`harness`, or merged across all when listing)
 * — or a machine feature (`listRepos`, `installTool`, the fleet controls). With
 * no `instanceId` and no `harness`, `listSessions` merges every harness.
 */
export interface ControlPayload {
  args?: unknown[];
  /** The instance a fleet-originated control claims as its caller; the hub honours the call only when the target is that instance's own delegate. */
  from?: string;
  /** The harness the machine-scoped call is addressed at; session calls route by instance. */
  harness?: import("./harness").HarnessKind;
  instanceId?: string;
  method: string;
  requestId: string;
}

/** Settles a parked permission request; args are `[requestId, PermissionResult]`. */
export const RESOLVE_PERMISSION = "resolvePermission";

/**
 * Takes back a parked permission request nobody could be shown; args are
 * `[requestId, message]`. The harness denies it with the message and moves
 * on, as it does when the CLI withdraws an ask itself (an interrupt): it is
 * not the reader's dismissal, because the reader never saw it.
 */
export const WITHDRAW_PERMISSION = "withdrawPermission";

/** How a withdrawn question's message begins; the card that drew it reads "withdrawn" from it. */
export const QUESTION_UNSHOWN = "This question couldn't be shown";

/** What an ask the hub could not show says to the session that asked it, with why. */
export const unshownAskMessage = (question: boolean, why: string): string =>
  `${question ? QUESTION_UNSHOWN : "This permission request couldn't be shown"} (${why}).`;

/**
 * The tool that asks the reader rather than the machine. Its permission request
 * is the question, so it settles through {@link RESOLVE_PERMISSION} like any
 * other: the choices arrive as the request's `input`, and the answer goes back
 * as `updatedInput`.
 */
export const ASK_USER_QUESTION = "AskUserQuestion";

/**
 * `fs`: the machine's files, for the cwd picker and light markdown editing
 * (NEW.md §6) — not a file transfer. `list` answers with {@link FsEntry}[],
 * `read` with the file's text, `write` with the byte count it wrote, `media`
 * with an {@link FsMedia} — the one binary the tunnel carries, so a picture or
 * video an agent pointed at can be looked at without the agent spending tokens
 * on it.
 */
export interface FsPayload {
  /** `write` only: the text the file is replaced with. */
  content?: string;
  op: "list" | "read" | "write" | "media";
  /** Absolute; or, with `root`, relative to that root on the machine. */
  path: string;
  requestId: string;
  /**
   * `claude-home`: `path` is under the machine's user layer, Claude Code's
   * own dir (`~/.claude`), as the machine itself places it (core paths.ts
   * `claudeHome`): no caller has to know a machine's home to reach it.
   */
  root?: "claude-home";
}

/**
 * The most an `fs media` read carries: the Telegram Bot API's ceiling on what
 * a bot uploads, so a file read for `send_to_user` is one Telegram takes
 * (https://core.telegram.org/bots/api, sendVideo: "Bots can currently send
 * video files of up to 50 MB in size"; sendAnimation and sendDocument say the
 * same).
 */
export const MEDIA_LIMIT_BYTES = 50 * 1024 * 1024;

/** What an `fs media` read answers with: the file's bytes, base64, and what they are (a picture or a video). */
export interface FsMedia {
  base64: string;
  mediaType: string;
}

/** One dirent of an `fs list`. `size` is 0 for a directory. */
export interface FsEntry {
  kind: "dir" | "file";
  name: string;
  size: number;
}

/**
 * A machine from the hub's `agents` table — what `GET /api/agents` answers with,
 * and what rides alongside the sessions in an `instances` frame.
 */
export interface AgentRow {
  /** `unknown` until a daemon that probes has registered at least once. */
  auth: import("./harness").AuthState | "unknown";
  binaryUpdate?: import("./binary-updates").BinaryUpdateState;
  /**
   * The cawco build this machine's daemon is running (NEW.md §12).
   */
  build?: BuildInfo;
  /** Last register's sessiond read, distinct from an available empty list. */
  custody?: SessionCustody;
  /**
   * Last-known fleet-config sync report (NEW.md §11).
   */
  fleet?: FleetSyncReport;
  /** What each installed harness can do, as the daemon reported at register. */
  harnesses?: import("./harness").HarnessReport[];
  hostname: string;
  /** A `Date` inside the hub, the ISO string it serialises to everywhere else. */
  lastSeenAt: string | number | Date | null;
  machineCapabilities?: import("./capabilities").MachineCapabilities;
  machineId: string;
  os: string;
  status: string;
  /**
   * Last-known workflow-tool status by tool id (NEW.md §10).
   */
  tools?: Record<string, ToolStatus>;
}

export type SessionCustody =
  | {
      state: "available";
      instances: string[];
      opencode: boolean;
      readStartedAt?: number;
      stopSequence?: number;
      pending?: string[];
    }
  | { state: "unavailable"; error: string };

export interface SessionAddress {
  instanceId: string;
  processGeneration?: string;
  sessionId: string;
}

export type SessionEndIntent =
  | "stop"
  | "discard"
  | "delete"
  | "delete-transcript";

/** Creation provenance, stored by the agent and carried durably on its hub row. */
export interface ScratchWorktree {
  dir: string;
  path: string;
  root: string;
}

/** mDNS and router suffixes: they say "same network", which the fleet already implies. */
const LOCAL_SUFFIXES = [".local", ".lan", ".home"];

/**
 * How the fleet names a machine out loud: its hostname without a local-network
 * suffix ("Omars-MacBook-Pro.local" is "Omars-MacBook-Pro"). The dashboard
 * shows this name, and `start_session` takes it.
 */
export function machineLabel(hostname: string): string {
  const name = hostname.trim();
  const suffix = LOCAL_SUFFIXES.find((s) => name.toLowerCase().endsWith(s));
  return suffix ? name.slice(0, -suffix.length) : name;
}

/** What a daemon reports about the checkout it was started from. */
export interface BuildInfo {
  /** Short git SHA, when the checkout is a git one. */
  commit?: string;
  /** Whether that checkout has uncommitted changes. */
  dirty?: boolean;
  protocol?: { min: number; max: number };
  /** When this daemon started, ms epoch. */
  startedAt: number;
  /** `@cawco/agent`'s package version. */
  version: string;
}

/**
 * What an {@link UPDATE_CAWCO} run did. Every field is what actually
 * happened, not what was asked for.
 */
export interface UpdateReport {
  built: boolean;
  /**
   * The services whose code the update changed: the only ones it rebuilt or
   * restarted, and the only way a deploy leaves the agent owing a restart.
   * Every service when nothing was pulled (an update asked of a current
   * checkout restarts the stack) and for a registry install.
   */
  changed: string[];
  from?: string;
  installed: boolean;
  /** The tail of what git said — 'Already up to date.' included. */
  pulled: string;
  /** Service ids actually restarted. */
  restarted: string[];
  /** Why something asked for did not happen. */
  skipped?: string;
  to?: string;
}

/**
 * Install now: stage the machine's channel build and apply it, answering with
 * what happened. The same call a person's "Install now" makes; the automatic
 * path runs the same code once the work a restart would cut has drained.
 */
export const UPDATE_CAWCO = "updateCawco";

/**
 * Which of this machine's sessions are mid-turn: what the hub's keep-alive
 * reads before it pings a session, and what a restart of the session keeper
 * waits on (that restart kills the turns). An agent restart does not wait on
 * it: the keeper runs the turns on through one.
 * Answers `{ busy: number; instances: string[] }`.
 */
export const AGENT_BUSY = "agentBusy";

/**
 * What a session row is doing, right now, as the hub last heard it.
 *
 * - `starting` — a spawn went out and hasn't been confirmed live yet.
 * - `running` — the owning daemon currently lists the instance.
 * - `sleeping` — no live process, but resumable: the harness has a session id
 *   to pick back up from. This is what a daemon restart or a quiet drop used
 *   to report as `error` with {@link RESTART_RESUMABLE} in `lastError`; that
 *   encoding conflated "gone but fine" with a real failure, so `sleeping` rows
 *   carry `lastError: null` — nothing went wrong, there's just nothing running.
 * - `stopped` — deliberate: the operator (or a `stop` call) ended it.
 * - `error` — an actual failure. `lastError` is required here, and this is
 *   where {@link RESTART_LOST} still lands: a restart with nothing to resume
 *   from is a real loss, not a nap.
 * - `unknown` — the machine that owns this row can't currently be reached, so
 *   the hub can't say which of the above is true.
 * - `discarded` — a spin-off torn down on purpose; gone for good.
 * - `moving` — its project is moving to its machine for it (move.ts): the hub
 *   holds the row from the move's start, under the id the session starts
 *   under, and the move's start takes it on to `starting`. No process, and
 *   none is claimed: a failed move files it `error`, a cancelled one drops it.
 */
export type InstanceStatus =
  | "moving"
  | "starting"
  | "running"
  | "sleeping"
  | "stopped"
  | "discarded"
  | "unknown"
  | "error";

/** A missing Claude conversation is terminal; restarting cannot recreate its history. */
export const CLAUDE_CONVERSATION_GONE =
  "This Claude Code conversation is gone and cannot be resumed. Start a new session to continue working.";

/**
 * How a session with no process comes back: on its conversation by its key;
 * fresh under the same id when its harness never began one (no key: it never
 * said init), so there is nothing to lose; or not at all when its
 * conversation existed and is gone. The one decision for every revive: the
 * dashboard's (`ensureAlive`) and the hub's wake for a send.
 */
export type Relaunch =
  | { kind: "resume"; sessionKey: string }
  | { kind: "fresh" }
  | { kind: "refused"; reason: string };

export const relaunchOf = (row: {
  lastError?: string | null;
  sessionId: string | null;
}): Relaunch => {
  if (row.lastError === CLAUDE_CONVERSATION_GONE) {
    return { kind: "refused", reason: CLAUDE_CONVERSATION_GONE };
  }
  return row.sessionId
    ? { kind: "resume", sessionKey: row.sessionId }
    : { kind: "fresh" };
};

/**
 * A "continue in new session" the hub is carrying, as every dashboard follows
 * it: summarise the source, then start the target seeded with the summary.
 * The hub owns it from the POST that starts it to its end; only a Cancel
 * (`DELETE /api/continuations/:id`) stops it.
 */
export interface ContinuationJob {
  error?: string;
  id: string;
  /**
   * The new session takes the source's place: its parent, work item, thread
   * and tab. Set when the hub continued a session whose account reached its
   * limit on another account.
   */
  inherits?: true;
  sourceInstanceId: string;
  /**
   * `ending`: a continuation at an account's limit whose new session runs,
   * waiting for its source to be ended before it takes the source's place.
   */
  stage:
    | "summarising"
    | "starting"
    | "ending"
    | "started"
    | "failed"
    | "cancelled";
  /** Absent when the source is short enough that nothing is summarised. */
  summariserInstanceId?: string;
  targetInstanceId: string;
}

/**
 * A session the hub knows about — one row of its `instances` table.
 */
/** What a session's `init` says about its MCP servers and tools. */
export interface SessionTooling {
  servers: { name: string; status: string }[];
  tools: string[];
}

export interface InstanceRow {
  /**
   * The account the session runs on (`instances.account_id`): placed once as
   * it starts and kept for its whole life. Null on a harness without accounts
   * and on a session from before accounts existed.
   */
  accountId?: string | null;
  /**
   * The supervisor's standing autopilot for this session, set from the
   * composer popover. `null` means never configured; disabling keeps the
   * prompt rather than discarding it, so re-enabling does not mean retyping
   * it. Absent on a hub that predates the column.
   */
  autopilot?: { enabled: boolean; prompt: string; updatedAt: number } | null;
  /**
   * Whether the session may spawn delegates of its own — `false` on a leaf
   * delegate (spawned with `can_delegate: false`, the default). Null on a
   * session nobody delegated, which may.
   */
  canDelegate?: boolean | null;
  /**
   * The session that took this one's place when it was continued on another
   * account at its limit. Set: this one never runs again, every listing
   * leaves it out, and whatever names it reaches the session at the end of
   * the chain. Null on every session nothing took the place of.
   */
  continuedInto?: string | null;
  /** The directory the session was launched in; see `launchDir`. */
  cwd: string;
  /** The delegate type its spawn named; null: none. */
  delegateType?: string | null;
  /** The project whose catalog that type came from; null: the fleet's. */
  delegateTypeProject?: string | null;
  /**
   * The name the session's first user message gave it, derived once by the hub.
   * A listing already answers {@link title} with this when nothing named the
   * row, so a reader never watches the label change as the transcript arrives.
   */
  derivedTitle?: string | null;
  /**
   * The effort the session actually sends, as its agent last read it back from
   * the harness ({@link import("./harness").EFFORT_READ}): a level, `none` when
   * it sends no effort, null until the first reading lands. A restart hands a
   * level back to the new process, so it keeps working at the one it was on.
   */
  effort?: import("./harness").SessionEffort | null;
  /** Which harness owns {@link sessionId} — what a resume and a catalog read route on. */
  harness?: string | null;
  /** First-hand custody on the current agent connection, never stored liveness. */
  held?: { since: number; reason: string };
  id: string;
  keepAlive?: KeepAlive;
  /** `scratch` for a spin-off; absent from a hub that predates the column. */
  kind?: string;
  /** What killed the session, on a row the agent reported as `error`. */
  lastError?: string | null;
  lastRequestAt?: string | number | Date | null;
  /**
   * Whether `cwd` is the launch directory: `known`; `unread`, still to be read
   * from its machine; `unknown`, its machine has no record of its conversation,
   * so `cwd` may be a folder its CLI wandered into and the session is named by
   * its title (hub `sessionLabel`) and cannot be resumed.
   */
  launchDir: "known" | "unread" | "unknown";
  machineId: string;
  model?: string | null;
  /** The instance this one is a delegate of; absent for a mainline session. */
  parentInstanceId?: string | null;
  /** The delegating tool call, so the parent transcript can render the round trip. */
  parentToolUseId?: string | null;
  /**
   * How the session answers tool permissions and which model answers, as of its
   * last spawn, switch or `init`. Null on a session that has never said.
   */
  permissionMode?: string | null;
  /** Set when the session was started from a project page. */
  projectId?: string | null;
  /**
   * The toolset it runs in, when its spawn named one (a project's Caw is
   * `lead`); null: derived from how it started.
   */
  role?: import("./delegate-types").SessionRole | null;
  /** Hub-derived count of live delegated work items, including descendants and checks. */
  runningDelegates?: number;
  /**
   * When the owner last looked at it (its tab in front, after it ended) or
   * archived it off Finished, on any device. Null on one never seen.
   */
  seenAt?: string | number | Date | null;
  /** The harness's own session id, once the session has named itself. */
  sessionId: string | null;
  status: InstanceStatus;
  /**
   * The thread with its project's Caw this session works for, when Caw's
   * work started it: the rail nests it under that thread.
   */
  threadId?: string | null;
  /**
   * What the session is called: the owner's rename, else the name the session
   * gave itself (`set_title`) or was spawned under, else {@link derivedTitle}.
   */
  title?: string | null;
  /**
   * Who gave the session its name: `owner` (a dashboard rename, which the
   * session's own `set_title` cannot replace) or `agent`. Null while nobody has.
   */
  titleSource?: "owner" | "agent" | null;
  /** When the row last moved. */
  updatedAt?: string | number | Date | null;
  workflowRunId?: string | null;
  workflowStepId?: string | null;
  /**
   * The work item this session runs: every delegate is one, and a session
   * never runs more than one. Null on a session nobody delegated, and on a
   * delegate from before work items existed.
   */
  workItemId?: string | null;
}

export interface KeepAlive {
  cap: number;
  cold: { reason: string; at: number } | null;
  contextReadAt: number | null;
  contextTokens: number | null;
  lastPingUsage: {
    input: number;
    read: number;
    write: number;
    at: number;
  } | null;
  nextAt: number | null;
  on: boolean;
  sent: number;
  state: "off" | "waiting" | "cold" | "paused-usage" | "asleep" | "stopped-cap";
  ttl: "5m" | "1h" | null;
}

/**
 * One delegate's work item as its parent's delegate tray reads it: the hub's
 * `work_items` row cut to what a chip and its panel say, pushed as a
 * `work_item` frame on every change and read back over
 * `GET /api/work-items?parent=`. Times are epoch ms. A `delegate` call that
 * waits for files a live item owns is one too, `starting` with `queued` set,
 * under the ids its item takes when it starts.
 */
export interface WorkItemSummary {
  createdAt: number;
  dismissedAt: number | null;
  endedAt: number | null;
  /** The first line of each: what it was asked, what it reported, why it failed. */
  firstLines: { brief: string; result: string; error: string };
  id: string;
  instanceId: string;
  /**
   * Its project's lead, a co-parent of the item, whose tray lists it beside
   * its parent's; null when the project has none, or the lead is its parent
   * or its own session.
   */
  leadInstanceId: string | null;
  parentInstanceId: string;
  /**
   * While it waits to start: the files it owns, which a live item owns too
   * (`src/theme/**`); null once it has started.
   */
  queued: { owns: string[] } | null;
  state: "starting" | "running" | "done" | "failed" | "cancelled";
  title: string;
  waitReason: string | null;
  /** A declared wait's deadline in epoch ms. */
  waitUntil: number | null;
}

/** An ask's life: parked on the parent, then allowed or refused by it. */
export type DelegateAskStatus = "pending" | "answered" | "denied";

/** What every kind of {@link DelegateEvent} carries, whichever it is. */
interface DelegateEventBase {
  /**
   * When the hub recorded it, as JSON carries a date.
   * @format date-time
   */
  createdAt: string;
  /** The hub's row id — what a fold deduplicates on and orders by. */
  id: number;
  /** The delegate the traffic is about — never the parent, on any of the kinds. */
  instanceId: string;
  parentInstanceId: string;
  /** The permission request an ask and its answer share. Null on a report. */
  requestId: string | null;
  requestKind: "question" | "tool" | null;
  /** An ask's own state; null on an answer and a report, which settle nothing. */
  status: DelegateAskStatus | null;
  toolName: string | null;
}

/**
 * One line of what a delegate and its parent said to each other through the
 * hub — a `delegate_events` row (packages/hub `db/schema.ts`), read over
 * `GET /api/delegate-events` and pushed as a `delegate_event` frame. The hub is
 * the system of record: the transcript markers say the same things, but only
 * for a reader who was watching, and only as text to be parsed back.
 */
export type DelegateEvent =
  | (DelegateEventBase & {
      kind: "ask";
      /** The tool input as the harness asked it — `{filepath, diff}`, `{questions}`, … */
      payload: { input?: Record<string, unknown> };
    })
  | (DelegateEventBase & {
      kind: "answer";
      payload: { behavior: string; answers?: Record<string, unknown> };
    })
  | (DelegateEventBase & {
      kind: "report";
      payload: {
        body: string;
        failed: boolean;
        resultId?: string;
        completedAt?: string;
      };
    });

/** The three things a delegate and its parent ever say to each other. */
export type DelegateEventKind = DelegateEvent["kind"];

/** What each kind carries: the ask's own input, the answer, the turn's report. */
export type DelegateEventPayload = DelegateEvent["payload"];

/**
 * One line of the supervisor's intervention log — `supervisor_events`
 * (packages/hub `db/schema.ts`), read over `GET /api/supervisor/events` and
 * pushed as a `supervisor_event` frame. Silent verdicts are recorded too: the
 * log is the only place any of this is visible, so "it looked and did
 * nothing" has to show up the same as "it spoke".
 */
export interface SupervisorEvent {
  createdAt: number;
  /** The hub's row id — what a fold deduplicates on and orders by. */
  id: number;
  instanceId: string;
  latencyMs: number | null;
  /** Sent into the session (`reply`) or shown to the operator (`escalate`/`ask`); null for the rest. */
  message: string | null;
  /** Which model answered, when one did. */
  model: string | null;
  /** The supervisor's own one-line rationale — logged, never sent to the session. */
  note: string | null;
  /** The rule that fired, for `source: 'rule'`; null for autopilot. */
  ruleId: string | null;
  /** Which mechanism produced the verdict. */
  source: "rule" | "autopilot";
  verdict: "silent" | "reply" | "escalate" | "ask" | "error" | "skipped";
}

/**
 * Fired the moment an evaluation actually begins — the transient half of the
 * supervisor's visible life. Every evaluation is guaranteed to terminate in a
 * published {@link SupervisorEvent}, so a consumer can treat that event as
 * this signal's close; nothing here is persisted.
 */
export interface SupervisorStatusSignal {
  at: number;
  phase: "evaluating";
  ruleId: string | null;
  source: "rule" | "autopilot";
}

/**
 * A coarse, now-state the rail draws without frames: what a session is doing
 * right now, folded on the daemon from the frames it is already pumping. It is
 * the *fallback* the dashboard reads for sessions it has not subscribed to —
 * open sessions still render the richer frame-fed state. `activity` is the same
 * three words the fleet view uses; `busy`/`runningSubagents` keep the finer
 * signals separate so a reader can still tell "blocked" from "working".
 */
export interface SessionPulse {
  /** Coarse now-state the rail draws without frames. */
  activity: "working" | "blocked" | "idle";
  /** ms epoch of the last frame that changed this pulse. */
  at: number;
  busy: boolean;
  /** The tool the main loop is inside, addressed as the transcript addresses it. */
  currentTool: { name: string; glance: string; toolId: string } | null;
  instanceId: string;
  runningSubagents: number;
}

/**
 * What the hub records on a session whose daemon restarted out from under it.
 */
export const RESTART_RESUMABLE =
  "The agent restarted; this session did not survive it.";

/** And what it records when there is nothing to go back to. */
export const RESTART_LOST =
  "The agent restarted, and this session left nothing to resume from.";

/**
 * The error an OpenCode session's turn ends with when the server it ran in
 * stopped before finishing it, read back on reattach from the reply the
 * server kept unfinished. The turn did not end: it was cut, and the hub hands
 * it back to the session once.
 */
export const SERVER_STOPPED_MID_TURN =
  "The opencode server stopped before this turn finished; its reply is incomplete.";

/**
 * `frames`: everything a session produces, flowing agent→hub→dashboard. The
 * `frame` kind is a neutral message; `raw` on it carries the harness's own
 * event verbatim.
 */
export type FramePayload =
  | import("./frames").CacheInvalidatedFrame
  | import("./frames").FleetMcpFrame
  | import("./frames").PreviewFrame
  | import("./frames").MessageFrame
  | import("./frames").SendFrame
  | import("./frames").RejectedFrame
  | import("./frames").HeldSendFrame
  | import("./frames").InstancesFrame
  | import("./frames").InstancesDeltaFrame
  | import("./frames").PermissionRequestFrame
  | import("./frames").PermissionSettledFrame
  | import("./frames").UsageFrame
  | import("./frames").StoppedFrame
  | import("./frames").AsleepFrame
  | import("./frames").RecoveryUnavailableFrame
  | import("./frames").ControlResultFrame
  | import("./frames").ErrorFrame
  | import("./frames").SessionAddressFrame
  | import("./frames").ScratchWorktreeFrame
  | import("./frames").UserMessageFrame
  | import("./frames").PulseFrame
  | import("./frames").WorkItemFrame
  | import("./frames").ProjectOfferFrame
  | import("./frames").ThreadUpsertFrame
  | import("./frames").ThreadMessageFrame
  | import("./frames").TasksChangedFrame
  | import("./frames").ProjectsChangedFrame
  | import("./frames").ProjectCapFrame
  | import("./frames").ProjectStopFrame
  | import("./frames").DelegateEventFrame
  | import("./frames").SupervisorEventFrame
  | import("./frames").SupervisorStatusFrame
  /** Hub-originated: every project move, whole, on each change. */
  | import("./move").MovesFrame
  /** Daemon-originated: how far a move's clone or large files are. */
  | import("./move").MoveProgressFrame
  /** Hub-originated workflow run transition (§7.2). */
  | import("./workflow").WorkflowFrame;

export const CAWCO_HUB_PORT = 3456;

/**
 * A preview's start page: a path on the previewed server, one leading slash
 * (never `//host`, which would leave it), no whitespace.
 */
export const PREVIEW_START_PATH = /^\/(?!\/)\S*$/;

/**
 * What a preview shows: a dev server or a folder on the session's machine, or
 * a decision page in a project's hub folder (`decisions/<page>/index.html`),
 * which the hub serves itself. A dev server or folder may name `path`, the
 * page inside it the preview opens at (`/motion/mac-readiness`); the root
 * when absent.
 */
export type PreviewSource =
  | { port: number; path?: string }
  | { dir: string; path?: string }
  | { project: string; page: string };

/**
 * One id's entry in a canvas's choices (Projects spec §5.7): the options
 * picked for a choice, the person's note on it, or a value the page `set`.
 * `pageHash` is the page the person was looking at when it last changed, so
 * a pick made on an earlier revision can be told apart.
 */
export interface ChoiceEntry {
  at: string;
  note: string | null;
  /** Options picked, in the order picked; empty when cleared. */
  options: string[];
  pageHash: string;
  /** What `cawco.set` stored under this id; null when nothing was set. */
  value: unknown;
}

/**
 * The bridge's bounds, the same at both ends: the pane checks what the page
 * posts (wire.ts) and the hub checks what the pane sends. An id is refused
 * past its bound, never cut, since a cut id would be another id.
 */
export const CHOICE_LIMITS = {
  /** A choice's id, or a key `cawco.set` writes. */
  id: 200,
  option: 200,
  /** Options one multiple choice can hold at once. */
  options: 50,
  note: 2000,
  /** A set value, as JSON. */
  value: 2000,
  /** Ids one canvas keeps. */
  perCanvas: 500,
} as const;
/** An id or option: no control characters, no spaces at either end. */
export const CHOICE_ID = /^[^\s\p{Cc}](?:[^\p{Cc}]*[^\s\p{Cc}])?$/u;
export const PAGE_HASH = /^[0-9a-f]{64}$/;

/** One change the page asks for: exactly one of options, note or value. */
export type ChoiceChange = { choice: string; pageHash: string } & (
  | { options: string[] }
  | { note: string }
  | { value: unknown }
);

/** A canvas's choices: what the pane hands the page, and `read_choices` reads. */
export interface CanvasChoices {
  canvas: string;
  choices: Record<string, ChoiceEntry>;
  /** The page's hash when it was last shown with the bridge. */
  pageHash: string | null;
  /** When the person last sent their picks to the session. */
  sentAt: string | null;
}

export interface PreviewElement {
  classes: string[];
  html: string;
  id: string;
  page: { x: number; y: number };
  rect: { x: number; y: number; width: number; height: number };
  selector: string;
  source: {
    file: string | null;
    line: number | null;
    column: number | null;
    framework: "svelte" | "code-inspector" | "react" | "vue";
    of: "self" | `ancestor:${string}`;
    component?: string;
  } | null;
  styles: Record<
    | "color"
    | "backgroundColor"
    | "fontFamily"
    | "fontSize"
    | "fontWeight"
    | "lineHeight"
    | "display"
    | "position"
    | "padding"
    | "margin"
    | "borderRadius",
    string
  >;
  tag: string;
  text: string;
  url: string;
}
export const PREVIEW_START = "previewStart";
export const PREVIEW_STOP = "previewStop";

/**
 * The session tag a spin-off's transcript carries (NEW.md §1). The agent
 * applies it when the session names itself and clears it when the spin-off is
 * kept; the catalogs the rails read hide what wears it.
 */
export const CAWCO_SCRATCH_TAG = "cawco-scratch";

/**
 * Every environment variable cawco reads, by the name it is spelled on a
 * machine. This is the inventory: a variable that is not in here is one nobody
 * will find next time, so add it here first and read it through
 * {@link readEnv}.
 *
 * Four call sites read a name below as a bare literal, and are meant to. Each
 * runs somewhere this module cannot be imported, not somewhere the registry
 * does not apply — being listed here is what keeps them findable:
 * `packages/hub/drizzle.config.ts` (drizzle-kit bundles it with its own loader
 * and never resolves workspace TypeScript), `apps/dashboard/serve.js` and
 * `vite.config.ts` (outside the app bundle), and the opencode handoff plugin
 * source in `packages/agent/src/harnesses/opencode.ts` (a string executed in
 * the opencode child process).
 */
export const CAWCO_ENV = {
  hubUrl: "CAWCO_HUB_URL",
  /**
   * The hub the dashboard's `vite dev` server talks to, and the only one: a
   * dev server reads no other variable and has no default, and refuses to
   * start without it. The fleet exports `CAWCO_HUB_URL` into every session's
   * shell and never this, so a leaf's test pages reach the live hub only
   * when the leaf names it here on purpose. The `--dev` service unit does.
   */
  devHubUrl: "CAWCO_DEV_HUB_URL",
  hubPort: "CAWCO_HUB_PORT",
  previewPort: "CAWCO_PREVIEW_PORT",
  machineId: "CAWCO_MACHINE_ID",
  /** `1` stops the hub advertising itself over mDNS. */
  noMdns: "CAWCO_NO_MDNS",
  /**
   * Overrides the socket `sessiondEndpoint()` derives — the daemon listens on
   * it and every client dials it, so both ends must read the same variable.
   */
  sessiondEndpoint: "CAWCO_SESSIOND_ENDPOINT",
  /** Where the links the bridge sends point. */
  dashboardUrl: "CAWCO_DASHBOARD_URL",
  /** The bot the hub reaches its owner's Telegram on. */
  telegramToken: "CAWCO_TELEGRAM_TOKEN",
  /** Telegram's API origin, for pointing the bridge at a proxy. */
  telegramApi: "CAWCO_TELEGRAM_API",
  telegramAsrUrl: "CAWCO_TELEGRAM_ASR_URL",
  telegramAsrModel: "CAWCO_TELEGRAM_ASR_MODEL",
  telegramAsrMode: "CAWCO_TELEGRAM_ASR_MODE",
  /** Where the hub's SQLite file lives, overriding the default data dir. */
  dbPath: "CAWCO_DB_PATH",
  /**
   * The session a shell belongs to, and its own credential: set in every
   * session's shell, so `cawco tool` there acts as that session and no other.
   */
  instanceId: "CAWCO_INSTANCE_ID",
  sessionCredential: "CAWCO_SESSION_CREDENTIAL",
  /**
   * Inside a workspace's boundary, which reaches none of the owner's
   * machines: the unix socket of the agent's door to the hub's two tool
   * routes, which `cawco tools` and `cawco tool` go through instead of the hub.
   */
  toolSocket: "CAWCO_TOOL_SOCKET",
  /** Which service manager the installer targets: `systemd`, `launchd`, … */
  serviceMode: "CAWCO_SERVICE_MODE",
  /**
   * The port of the agent's MCP gateway ({@link mcpGatewayPort}). Unset on
   * every installed machine; a second agent on one host (a rig, a dev
   * checkout) names its own.
   */
  mcpPort: "CAWCO_MCP_PORT",
} as const;

/** One of {@link CAWCO_ENV}'s variable names. */
export type CawcoEnvVar = (typeof CAWCO_ENV)[keyof typeof CAWCO_ENV];

/**
 * Reads one of cawco's environment variables. Typed to the registry so a
 * variable cannot escape it as a bare literal again — which is how five of
 * them escaped in the first place.
 *
 * `env` is a parameter so callers that hold a child's environment — the
 * spawner, the installer's rendered unit — can resolve against it too.
 */
export const readEnv = (
  name: CawcoEnvVar,
  env: Record<string, string | undefined> = process.env
): string | undefined => env[name];

let gatewayPort: number | undefined;

/**
 * The port this machine's agent serves its MCP gateway on: `CAWCO_MCP_PORT`,
 * else {@link CAWCO_MCP_DEFAULT_PORT}, read once per process. It is the one
 * setting every end that names the gateway reads: the agent's listener, the
 * URL each session's MCP config and OpenCode config carry, the pi host the
 * keeper runs (given it by its agent), and `cawco service`'s restart
 * question. So a second agent on one host runs on a port of its own, with no
 * network namespace; production machines keep the default, which nothing in
 * the installer changes.
 *
 * A session's CLI is started with the gateway URL in its config and keeps it
 * for its whole life, across restarts of its agent (the keeper holds it).
 * Changing the port on a live machine therefore cuts every running session
 * off from CawCo's tools until each is relaunched.
 */
export const mcpGatewayPort = (): number => {
  if (gatewayPort === undefined) {
    const named = readEnv(CAWCO_ENV.mcpPort);
    const port = named === undefined ? CAWCO_MCP_DEFAULT_PORT : Number(named);
    if (!(Number.isInteger(port) && port > 0 && port < 65_536)) {
      throw new Error(
        `${CAWCO_ENV.mcpPort} must be a port number, not "${named}"`
      );
    }
    gatewayPort = port;
  }
  return gatewayPort;
};

/**
 * The mDNS service the hub advertises and `cawco` browses for.
 */
export const CAWCO_MDNS_TYPE = "cawco";
export * from "./image-generation";
export * from "./workflow";
export * from "./workflow-compile";

/** Pushed by the hub to an online machine when the fleet's update policy changes. */
export const CONFIGURE_BINARY_UPDATES = "configureBinaryUpdates";

/** Returns a machine that is waiting to install back to `available`: the person changed their mind. */
export const CANCEL_BINARY_UPDATE = "cancelBinaryUpdate";
