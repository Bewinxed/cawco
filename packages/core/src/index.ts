import type { FleetSyncReport } from "./fleet";
import type { HarnessReport } from "./harness";
import type { ToolStatus } from "./tools";

// "Continue in new session": the size rules the hub and the dashboard share.
// biome-ignore lint/performance/noBarrelFile: this is the package's public API surface — packages/core's consumers (hub, cli, dashboard) import from "@whiffle/core" as one module, not per-file.
export * from "./continuation";
// Delegate types: named presets the `delegate` tool's `type` param resolves,
// so routing is by description instead of a raw model string.
export * from "./delegate-types";
// Fleet MCP + skills desired state, sync reports, and the `/` menu (NEW.md §11).
export * from "./fleet";
// The harness-neutral spine (2026-08 rework). Whiffle owns these types; the
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
// prefix, which `whiffle join` prints and the hub reads back off SSH output.
export * from "./join";
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
// for, a reply to send back, and an acknowledgement that has to come from the
// session before the rule goes quiet. The matcher lives here so the hub and the
// editor's test box decide identically.
export * from "./rules";
// The Ledger Protocol: canonical session streams + acknowledged commands.
export * from "./stream";
// The workflow-tool catalog and its status/policy shapes (NEW.md §10).
export * from "./tools";
// Usage, cost & limits (USAGE-SPEC.md §4). Pure types/math only; `limits.ts`
// reads credentials with node:fs and lives under the `@whiffle/core/usage/limits`
// subpath instead.
export * from "./usage";

// sessiond's protocol types are deliberately NOT re-exported here. That module
// reaches for `node:os` and `node:path` to derive its endpoint, and this barrel
// is imported by the dashboard — a browser bundle, where Vite externalises
// `node:*` and the first property access throws, taking the whole client module
// down with it. Import them from `@whiffle/core/sessiond` instead; the subpath
// export exists for exactly that, as `./usage/limits` already does.

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
 * that is never stored (a side quest's transcript).
 */
export interface SpawnPayload {
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
  cwd: string;
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
  instanceId: string;
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
  /** The project this session was started from, when it was started from one. */
  projectId?: string;
  /** Existing custody only: `busy` recovers active turns; `inspect` only reports them. */
  reattachOnly?: boolean | "busy" | "inspect";
  /**
   * Correlates the `control_result` frame the agent answers the spawn with, once
   * the session is in place.
   */
  requestId?: string;
  /**
   * Re-open (or fork) a stored session. `sessionKey` is the harness's own
   * session id; `fork` reads the origin conversation into a new one; `atMessage`
   * resumes up to and including that assistant turn (a rewind anchor).
   */
  resume?: { sessionKey: string; fork?: boolean; atMessage?: string };
  /**
   * A side quest (NEW.md §1): throwaway work. `worktree` runs the session in a
   * detached git worktree of `baseCwd` (the spawn's `cwd` when absent) so the
   * experiment cannot touch the checkout the mainline session is using.
   */
  scratch?: { worktree?: boolean; baseCwd?: string };
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
   * its way around the rule. `instanceId` when the caller knows its own row;
   * `sessionKey` (the harness's own session id, on the spawn's machine) when it
   * only knows that — the opencode plugin — and the hub resolves it to the one
   * live row carrying it.
   */
  spawnedBy?: { instanceId?: string; sessionKey?: string };
  /**
   * What the session is for, one line — a delegate's brief headline. Display
   * only.
   */
  title?: string;
  workflowRunId?: string;
  workflowStepId?: string;
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
 * the machine's own credential store — whiffle never holds a token.
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
   * the sentence around it.
   */
  attachments?: { kind: "text"; name: string; content: string }[];
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
  /**
   * Where the machine's deployment clone stands (contract C8), on every beat
   * for the same reason `instances` is: it is a live fact that changes without
   * anybody reconnecting. A clone that diverges at 14:02 must reach the board
   * by 14:02, not at the daemon's next register — which, on a healthy machine,
   * may be days away. Absent from a daemon whose watcher has never ticked.
   */
  deploy?: DeployInfo;
  /**
   * What each harness adapter on the machine can do, and whether it is
   * installed and authenticated. Rides one beat per connection, sent the
   * moment the daemon's probes finish, and never the 15s cadence: the probes
   * spawn processes (claude's starts a real Claude Code), and a register that
   * waited for them kept the machine out of the hub's registry for seconds
   * after every hub restart. Absent from every other beat.
   */
  harnesses?: HarnessReport[];
  instances: string[];
  /**
   * What the machine has of the tool catalog (NEW.md §10), so the hub can send
   * an install for whatever its policy requires and this machine lacks. Rides
   * the same beat as `harnesses`, for the same reason.
   */
  tools?: ToolStatus[];
}

/** `stop`: interrupt and close a live session. */
export interface StopPayload {
  /** Explicitly abort unadopted custody too, then tear down side-quest resources. */
  discard?: boolean;
  /** The instance a fleet-originated stop claims as its caller; the hub honours the call only when the target is that instance's own delegate. */
  from?: string;
  instanceId: string;
  /** Correlates the `control_result` frame confirming stop/discard or its failure. */
  requestId?: string;
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
 * The tool that asks the reader rather than the machine. Its permission request
 * is the question, so it settles through {@link RESOLVE_PERMISSION} like any
 * other: the choices arrive as the request's `input`, and the answer goes back
 * as `updatedInput`.
 */
export const ASK_USER_QUESTION = "AskUserQuestion";

/**
 * `fs`: the machine's files, for the cwd picker and light markdown editing
 * (NEW.md §6) — not a file transfer. `list` answers with {@link FsEntry}[],
 * `read` with the file's text, `write` with the byte count it wrote, `image`
 * with an {@link FsImage} — the one binary the tunnel carries, so a picture an
 * agent pointed at can be looked at without the agent spending tokens on it.
 */
export interface FsPayload {
  /** `write` only: the text the file is replaced with. */
  content?: string;
  op: "list" | "read" | "write" | "image";
  path: string;
  requestId: string;
}

/** What an `fs image` answers with: the file's bytes, base64, and what they are. */
export interface FsImage {
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
  /**
   * The whiffle build this machine's daemon is running (NEW.md §12).
   */
  build?: BuildInfo;
  /**
   * Where this machine's deployment clone stands against the branch it deploys
   * from, as its daemon last said (PLAN.md contract C8). Absent from a daemon
   * that predates the deployment channel and from one whose watcher has never
   * ticked, which a reader must render as *nothing to report* — never as
   * "current". Live, not history: the hub holds it only for as long as it holds
   * the socket that asserted it.
   */
  deploy?: DeployInfo;
  /**
   * Last-known fleet-config sync report (NEW.md §11).
   */
  fleet?: FleetSyncReport;
  /** What each installed harness can do, as the daemon reported at register. */
  harnesses?: import("./harness").HarnessReport[];
  hostname: string;
  /** A `Date` inside the hub, the ISO string it serialises to everywhere else. */
  lastSeenAt: string | number | Date | null;
  machineId: string;
  os: string;
  /**
   * True on exactly the one `instances` frame that follows this machine's
   * daemon coming back up because the deploy poller's idle-gated restart
   * fired (update.ts's `restartAgentNow`) — never for a manual restart, a
   * crash, or a plain boot. The hub deletes its own record of this the
   * instant it is read, so it never rides a later, unrelated broadcast: a
   * reader that was not subscribed for that one frame simply never learns
   * about it, the same as anyone who was not looking at the terminal when it
   * happened. What the dashboard's per-machine toast is keyed on.
   */
  restarted?: true;
  status: string;
  /**
   * Last-known workflow-tool status by tool id (NEW.md §10).
   */
  tools?: Record<string, ToolStatus>;
}

/**
 * Where a deployment clone stands, flattened for the wire. The kinds are
 * `DeployState['kind']` in packages/agent/src/deploy.ts; the rest of that
 * union's fields are already spoken in {@link DeployInfo.detail}, which is what
 * `describeDeploy` produced for this very state.
 */
export type DeployKind =
  | "unmarked"
  | "unreachable"
  | "current"
  | "behind"
  | "ahead"
  | "diverged";

export interface DeployInfo {
  /** One sentence, exactly what `describeDeploy(state)` said about it. */
  detail?: string;
  /** What the update flow threw, if it threw. */
  failure?: string;
  /**
   * `diverged` is the one that must survive the trip intact: it means the clone
   * refused to update because a reset would destroy commits nobody else has,
   * and a refusal nobody is shown is the same as no refusal at all.
   */
  kind: DeployKind;
  /** Whether the last poll actually ran the update flow. */
  updated?: boolean;
}

/** What a daemon reports about the checkout it was started from. */
export interface BuildInfo {
  /** Short git SHA, when the checkout is a git one. */
  commit?: string;
  /** Whether that checkout has uncommitted changes. */
  dirty?: boolean;
  /** When this daemon started, ms epoch. */
  startedAt: number;
  /** `@whiffle/agent`'s package version. */
  version: string;
}

/**
 * What an {@link UPDATE_WHIFFLE} run did. Every field is what actually
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
 * Turns the machine's checkout into the current one: `git pull`, install,
 * rebuild the dashboard, restart the hub and dashboard services.
 */
export const UPDATE_WHIFFLE = "updateWhiffle";

/**
 * Whether this machine's daemon is in the middle of anything — how a restart
 * waits for a good moment instead of cutting a turn in half.
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
 * - `discarded` — a side quest torn down on purpose; gone for good.
 */
export type InstanceStatus =
  | "starting"
  | "running"
  | "sleeping"
  | "stopped"
  | "discarded"
  | "unknown"
  | "error";

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
   * The supervisor's standing autopilot for this session, set from the
   * composer popover. `null` means never configured; disabling keeps the
   * prompt rather than discarding it, so re-enabling does not mean retyping
   * it. Absent on a hub that predates the column.
   */
  autopilot?: { enabled: boolean; prompt: string; updatedAt: number } | null;
  /**
   * Whether the session may spawn delegates of its own — `false` on a leaf
   * delegate (spawned with `can_delegate: false`, the default). Null on a
   * session nobody delegated, or on a hub that predates the column: both read
   * as allowed.
   */
  canDelegate?: boolean | null;
  cwd: string;
  /**
   * The name the session's first user message gave it, derived once by the hub.
   * A listing already answers {@link title} with this when nothing named the
   * row, so a reader never watches the label change as the transcript arrives.
   */
  derivedTitle?: string | null;
  /**
   * The effort level its last spawn or switch asked for. No `init` frame reports
   * effort back, so unlike its two neighbours this row is the only record of it
   * — and what a restart has to read to hand the session back as it was.
   */
  effort?: string | null;
  /** Which harness owns {@link sessionId} — what a resume and a catalog read route on. */
  harness?: string | null;
  /** First-hand custody on the current agent connection, never stored liveness. */
  held?: { since: number; reason: string };
  id: string;
  /** `scratch` for a side quest; absent from a hub that predates the column. */
  kind?: string;
  /** What killed the session, on a row the agent reported as `error`. */
  lastError?: string | null;
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
  /** The harness's own session id, once the session has named itself. */
  sessionId: string | null;
  status: InstanceStatus;
  /**
   * What the session is for, as its {@link SpawnPayload.title} said — a
   * delegate's brief headline. Null on a session that was started without one.
   */
  title?: string | null;
  /**
   * The MCP servers and tool names the session's newest `init` announced,
   * stored by the hub as each one passes. Null for a harness whose `init`
   * carries neither (OpenCode, pi) and for a session that has not started.
   */
  tooling?: SessionTooling | null;
  /** When the row last moved. */
  updatedAt?: string | number | Date | null;
  workflowRunId?: string | null;
  workflowStepId?: string | null;
}

/**
 * One line of the supervisor's intervention log — `supervisor_events`
 * (packages/hub `db/schema.ts`), read over `GET /api/supervisor/events` and
 * pushed as a `supervisor_event` frame. Silent verdicts are recorded too: the
 * log is the only place any of this is visible, so "it looked and did
 * nothing" has to show up the same as "it spoke".
 *
 * `DelegateEvent`, the nearest sibling shape, lives in the dashboard app
 * (`apps/dashboard/src/lib/whiffle/types.ts`) rather than here — but both the
 * hub (which records these rows) and the dashboard (which reads them) need
 * this type, and the hub does not import from the dashboard app. Core is the
 * one home both sides already share.
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
 * `frames`: everything a session produces, flowing agent→hub→dashboard. The
 * `frame` kind is a neutral message; `raw` on it carries the harness's own
 * event verbatim.
 */
export type FramePayload =
  | {
      kind: "preview";
      instanceId: string;
      state: "open" | "closed";
      /** The path on the dashboard's own origin, e.g. `/preview/<id>/`. */
      path: string;
      source?: PreviewSource;
    }
  | {
      kind: "frame";
      instanceId: string;
      harness: import("./harness").HarnessKind;
      message: import("./harness").NeutralMessage;
    }
  | {
      /**
       * Hub-originated: every session it still lists, pushed whenever one of the
       * rows moves.
       */
      kind: "instances";
      instances: InstanceRow[];
      agents: AgentRow[];
      previews?: Extract<FramePayload, { kind: "preview" }>[];
    }
  | {
      /**
       * Hub-originated: what moved since the last publish. A dashboard gets
       * the whole board once, as `instances`, when it connects; after that
       * only the rows that changed ride along — the board is hundreds of rows
       * and a publish usually moves one. Everything else in the frame is the
       * same small snapshot the `instances` frame carries.
       */
      kind: "instances_delta";
      upserts: InstanceRow[];
      removed: string[];
      agents: AgentRow[];
      previews?: Extract<FramePayload, { kind: "preview" }>[];
    }
  | {
      kind: "permission_request";
      instanceId: string;
      harness: import("./harness").HarnessKind;
      requestId: string;
      toolName: string;
      input: Record<string, unknown>;
      suggestions?: import("./harness").PermissionUpdate[];
      /** `tool` for a permission, `question` for an AskUserQuestion-shaped prompt. */
      requestKind?: "tool" | "question";
    }
  | {
      /**
       * Hub-originated: every machine's latest limit reading, pushed on each
       * agent usage report (USAGE-SPEC.md §6.4). Small by design — the heavy
       * aggregates are pulled over REST.
       */
      kind: "usage";
      limits: import("./usage").UsageLimitsReading[];
    }
  | {
      /** Authoritative daemon confirmation, never merely delivery of a stop request. */
      kind: "stopped";
      instanceId: string;
      discard: boolean;
    }
  | {
      /** No `instanceId` when the call it answers was machine-scoped. */
      kind: "control_result";
      instanceId?: string;
      requestId: string;
      ok: boolean;
      result?: unknown;
      error?: string;
    }
  | {
      /** Hub-originated routing failures (e.g. target machine offline). */
      kind: "error";
      instanceId?: string;
      requestId?: string;
      verb?: Verb;
      message: string;
    }
  | {
      /**
       * Daemon-originated: a session pushing text straight to the owner's
       * Telegram, with no ask to settle and nothing to answer. The hub hands it
       * to the bridge; the owner replying to it reaches the session, as with
       * any bridged message.
       */
      kind: "user_message";
      instanceId: string;
      text: string;
      /** Absolute paths of images on the session's machine to send alongside. */
      attachments?: string[];
    }
  | {
      /**
       * Daemon-originated: one instance's coarse now-state, throttled to ~1/sec.
       * Broadcast — every dashboard wants the rail's word on every session, not
       * only the ones it has open.
       */
      kind: "pulse";
      instanceId: string;
      pulse: SessionPulse;
    }
  /** Hub-originated workflow run transition (§7.2). */
  | import("./workflow").WorkflowFrame;

export const WHIFFLE_HUB_PORT = 3456;

export type PreviewSource = { port: number } | { dir: string };

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
 * The session tag a side quest's transcript carries (NEW.md §1). The agent
 * applies it when the session names itself and clears it when the quest is
 * kept; the catalogs the rails read hide what wears it.
 */
export const WHIFFLE_SCRATCH_TAG = "whiffle-scratch";

/**
 * Every environment variable whiffle reads, by the name it is spelled on a
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
export const WHIFFLE_ENV = {
  hubUrl: "WHIFFLE_HUB_URL",
  hubPort: "WHIFFLE_HUB_PORT",
  previewPort: "WHIFFLE_PREVIEW_PORT",
  machineId: "WHIFFLE_MACHINE_ID",
  /** `1` stops the hub advertising itself over mDNS. */
  noMdns: "WHIFFLE_NO_MDNS",
  /**
   * Overrides the socket `sessiondEndpoint()` derives — the daemon listens on
   * it and every client dials it, so both ends must read the same variable.
   */
  sessiondEndpoint: "WHIFFLE_SESSIOND_ENDPOINT",
  /** Where the links the bridge sends point. */
  dashboardUrl: "WHIFFLE_DASHBOARD_URL",
  /** The bot the hub reaches its owner's Telegram on. */
  telegramToken: "WHIFFLE_TELEGRAM_TOKEN",
  /** Telegram's API origin, for pointing the bridge at a proxy. */
  telegramApi: "WHIFFLE_TELEGRAM_API",
  telegramAsrUrl: "WHIFFLE_TELEGRAM_ASR_URL",
  telegramAsrModel: "WHIFFLE_TELEGRAM_ASR_MODEL",
  telegramAsrMode: "WHIFFLE_TELEGRAM_ASR_MODE",
  /** Where the hub's SQLite file lives, overriding the default data dir. */
  dbPath: "WHIFFLE_DB_PATH",
  /** The deployment clone the daemon watches (PLAN.md contract C8). */
  deployRoot: "WHIFFLE_DEPLOY_ROOT",
  /** How often that clone is polled, in seconds. */
  deployPoll: "WHIFFLE_DEPLOY_POLL",
  /** Which service manager the installer targets: `systemd`, `launchd`, … */
  serviceMode: "WHIFFLE_SERVICE_MODE",
  /** The npm registry installs and self-updates go through. */
  registry: "WHIFFLE_REGISTRY",
} as const;

/** One of {@link WHIFFLE_ENV}'s variable names. */
export type WhiffleEnvVar = (typeof WHIFFLE_ENV)[keyof typeof WHIFFLE_ENV];

/**
 * Reads one of whiffle's environment variables. Typed to the registry so a
 * variable cannot escape it as a bare literal again — which is how five of
 * them escaped in the first place.
 *
 * `env` is a parameter so callers that hold a child's environment — the
 * spawner, the installer's rendered unit — can resolve against it too.
 */
export const readEnv = (
  name: WhiffleEnvVar,
  env: Record<string, string | undefined> = process.env
): string | undefined => env[name];

/**
 * The mDNS service the hub advertises and `whiffle` browses for.
 */
export const WHIFFLE_MDNS_TYPE = "whiffle";
export * from "./image-generation";
export * from "./workflow";
export * from "./workflow-compile";
