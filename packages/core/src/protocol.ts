// The registry of CawCo's environment variables, in a file of its own that
// imports nothing (cawco-env.ts), read here by the readers below it.

import type { ACTIVITIES } from "./activity";
import type { ArtifactDoes, ArtifactKind } from "./artifact-kinds";
import type { MayStart } from "./delegate-types";
import type { FleetSyncReport } from "./fleet";
import type { MachineHarnessReport } from "./harness";
import type { LastErrorKind } from "./relaunch";
import type { ToolStatus } from "./tools";
import type { WORK_ITEM_STATES } from "./work-items";

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
  | "usage"
  | "launch"
  | "admission";

/**
 * `admission`, hub → agent, on the machine socket only (hub hub-auth.ts):
 *
 * - `challenge`: the first frame on every connection. The register answers
 *   it with `proof`, `HMAC(machineKey, nonce ‖ hubId ‖ machineId)` (core
 *   machine-key.ts), when the machine holds a key.
 * - `waiting`: the hub requires paired devices and this connection proved no
 *   key: it is held, and hears nothing more, until the person admits or
 *   refuses the machine.
 * - `admitted`: the person admitted the machine (or turned pairing on while
 *   it was connected): its key, sent this once over this socket. A waiting
 *   machine writes it and connects again with its proof; a connected one
 *   writes it and carries on.
 * - `refused`: the person refused the machine: said on its waiting
 *   connection just before the hub closes it, so the machine's install,
 *   waiting on that answer, ends with it (core machine-key.ts
 *   `refusalSince`).
 */
export type AdmissionPayload =
  | { kind: "challenge"; hubId: string; nonce: string }
  | { kind: "waiting"; message: string }
  | { kind: "admitted"; key: string }
  | { kind: "refused"; message: string };

/**
 * `launch`, agent → hub: a launch the hub sent this machine is starting now,
 * and asks for what it runs on ({@link LaunchGrant}), by the process
 * generation its spawn named. Asked as the agent starts its process, however
 * long the spawn was held (custody, an update, a queue), so what it carries
 * is the hub's as of that moment.
 */
export interface LaunchAsk {
  processGeneration: string;
}

/**
 * `launch`, hub → agent, under the ask's `requestId`: the launch's session
 * credential, minted now, and the account it runs on as its row says now;
 * or why it may not run, a sentence for the person, which its start fails
 * with once.
 */
export type LaunchGrant =
  | (Pick<SpawnPayload, "accountDir" | "homeLoginMove" | "instructions"> & {
      sessionCredential: string;
    })
  | { refusal: string };

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
 * `spawn`: start a session on a harness. `harness` chooses the adapter; `options`
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
   * A launch learns it as it starts, from the hub's {@link LaunchGrant}, and
   * runs on that alone; a reattach is sent it, as the account its process
   * already runs on. Never set by a client. A Claude launch without one (or
   * a {@link homeLoginMove}) is refused on the machine; a pi or OpenCode
   * launch without one runs from the machine's own stores.
   */
  accountDir?: { accountId: string };
  /**
   * Start from a repository instead of a directory that is already there: the
   * agent clones `repo`, a git URL on any host ({@link isGitUrl}), with plain
   * git into a subdirectory of `baseDir` and runs the session in the clone.
   */
  bootstrap?: { repo: string; baseDir: string };
  /**
   * Start the session clean: its model sees the harness's own base prompt,
   * the tools it needs to work in CawCo and its first message, and none of
   * the instruction context (the fleet's and the repository's instruction
   * files, CawCo's memory documents and server instructions, skills,
   * plugins, hooks and the harness's own memory). A starter asks for it (the
   * New session form, `delegate`); the hub keeps it on the session's row
   * ({@link InstanceRow.clean}) and puts it, with {@link fence}, on every
   * spawn of that row, whatever the caller sent. A harness that cannot start
   * clean is refused (core `cleanStartRefusal`).
   */
  clean?: true;
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
   * {@link ControlPayload} can still move mid-session. Named, it is the
   * session's chosen effort from then on ({@link InstanceRow.chosenEffort});
   * absent, the hub starts the process at the one already chosen, or, when
   * nobody chose, leaves the level to the harness, which is not the same as
   * asking for its default: only the model knows which stops it has.
   */
  effort?: import("./harness/kinds").EffortLevel;
  /**
   * This spawn is a project's memory curator or a fleet-watch triage run (a
   * `curator` or `overseer` row): the machine gives it CawCo's MCP server
   * and no other. Set by the hub alone, on every launch of such a row, and
   * never taken from a caller.
   */
  fence?: true;
  /**
   * Which harness runs the session. Every start names it: the hub refuses one
   * that does not (`enforceRowSessionKey`), and the agent starts none without
   * it. Optional on the wire only until TestFlight 20261015, 20261015.3,
   * 20261017 and 20261018 are expired (the app they hold declares it
   * optional); then it is required here.
   */
  harness?: import("./harness/kinds").HarnessKind;
  /**
   * The machine's own Claude Code login is moving into this account
   * (`POST /api/accounts/move-login`) and has not moved yet, so this Claude
   * session runs on that login: Claude Code with no `CLAUDE_CONFIG_DIR`, in
   * the machine's own store, where the credential still is. Granted by the
   * hub alone, as a Claude launch with no {@link accountDir} starts
   * ({@link LaunchGrant}), and only while that move is pending. A machine
   * that has moved the login by the time the launch starts runs the session
   * in the account's dir instead.
   */
  homeLoginMove?: { accountId: string };
  /**
   * A host-scope work item's session (hub work-items.ts `startHost`): the id
   * of its host workspace, whose scratch dir (core paths.ts
   * `workspaceScratchDir`) the machine makes, `outputs/` in it, and gives its
   * commands as `TMPDIR`, though they run on the host with no boundary.
   * What it leaves in `$TMPDIR/outputs/` the hub copies into its project's
   * folder (core harness.ts `CONTROL_HOST_OUTPUTS`). Set on each
   * spawn of such a session, as {@link workspace} is on a bounded one's, and
   * on no other.
   */
  hostScratch?: string;
  /** Hub ingest cursor for a recovery sent after the registration handover. */
  ingested?: import("./protocol").IngestMark;
  instanceId: string;
  /**
   * The fleet's role-scoped memory documents this session loads, in path
   * order: the hub picks them for its role and project as it grants the
   * launch ({@link LaunchGrant}), and the harness puts them in the session's
   * own instructions. Never set by a client; a reattach launches nothing and
   * keeps what its process started with.
   */
  instructions?: import("./fleet").SessionInstruction[];
  /** The in-flight maintenance send a surviving Claude process is answering. */
  keepAliveTurn?: string;
  /**
   * The delegate types this session may start ({@link MayStart}): `["any"]`
   * an orchestrator's; any other list a leaf's, which never gets the
   * spawning tools but `delegate` (for a list that names a type), and whose
   * every other start the hub refuses. Set by the `delegate` call's
   * `may_start`, else its type's. Absent on a session nobody delegated (a
   * mainline session may always delegate).
   */
  mayStart?: MayStart;
  /**
   * Which model answers, from the session's first turn. Hoisted for the same
   * reason as `permissionMode`. Absent leaves the choice to the harness.
   */
  model?: string;
  /** Harness-specific spawn options, passed through verbatim. */
  options?: unknown;
  /**
   * The session that started this spawn (a delegate's parent, or the caller
   * of `start_session`): the child nests under it in every rail, and
   * `toolUseId` names the delegating tool call so the parent transcript can
   * render the round trip. Absent on a spawn a person asked for.
   */
  parent?: { instanceId: string; toolUseId?: string };
  /**
   * How the session answers tool permissions. Hoisted out of `options` because
   * it is the one option the user keeps choosing — and the only one they can
   * still change afterwards, with a `setPermissionMode` {@link ControlPayload}.
   */
  permissionMode?: import("./harness/kinds").PermissionMode;
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
   * its own conversation: it moves to another account, or starts again on a
   * permission mode its harness only takes at launch. Without it, a resume
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
   * and kept there: a delegate type's `role` is its work item's. Absent: the hub derives it (`delegate` or `worker`).
   */
  role?: import("./delegate-types").SessionRole;
  /**
   * A schedule this session makes that would outlive it goes to its parent:
   * it is refused `routine_create` (hub roles.ts `makesRoutines`), so Claude
   * Code's durable CronCreate, which writes `<cwd>/.claude/scheduled_tasks.json`
   * and fires in whichever session next runs in that folder, is refused too,
   * with words that send it to its parent (agent claude.ts). Set by the hub
   * alone, from the session's row, on every spawn of it.
   */
  schedulesToParent?: true;
  /**
   * A spin-off (NEW.md §1): throwaway work. `worktree` runs the session in a
   * detached git worktree of `baseCwd` (the spawn's `cwd` when absent) so the
   * experiment cannot touch the checkout the mainline session is using.
   */
  scratch?: { worktree?: boolean; baseCwd?: string };
  scratchWorktree?: ScratchWorktree;
  /**
   * Skill names to load natively before the first prompt. Each harness loads
   * them via its own mechanism — opencode sends `/skill` commands, claude pushes
   * them into the input stream — so the delegate session sees the skill the same
   * way it would if the user had typed the slash command.
   */
  skills?: string[];
  /**
   * The session a hub job spawns for (a continuation's summariser and its
   * new session, on the person's ask): provenance for account placement,
   * not nesting. Unlike {@link parent}, it neither nests the child nor
   * routes reports, since no session started it.
   */
  spawnedBy?: { instanceId: string };
  /**
   * The exact skills and MCP servers the session starts with
   * ({@link import("./delegate-types").StartingSet}): its delegate type's
   * set, with CawCo's own skills and server and the skills its start named
   * ({@link skills}) joined. Set by the hub alone: resolved as its row first
   * opens, kept on that row, and put on every spawn of it, so a wake or
   * restore starts with the set its first spawn had. Absent: everything
   * installed.
   */
  startingSet?: import("./delegate-types").StartingSet;
  /**
   * What the session is for, one line — a delegate's brief headline. Display
   * only.
   */
  title?: string;
  /**
   * The workspace whose boundary every shell command of this session runs
   * inside. Set on each spawn of a work item's session — the first, and every
   * restore, revive and relaunch after it — and on no other session. A
   * machine that cannot hold the boundary refuses the spawn and says why.
   */
  workspace?: import("./workspace/controls").WorkspaceRef;
}

const TRAILING_SLASHES = /\/+$/u;
const URL_SCHEME_AND_HOST = /^[a-z][a-z0-9+.-]*:\/\/[^/]+\//iu;
const SCP_LIKE_HOST = /^[^/]+@[^:]+:/u;
const DOT_GIT_SUFFIX = /\.git$/u;

/** A URL with a scheme: `https://`, `ssh://`, `git://`, `file://`, any `<scheme>://`. */
const SCHEME_URL = /^[a-z][a-z0-9+.-]*:\/\/\S+$/iu;
/** git's scp-like form, `[<user>@]<host>:<path>`: "only recognized if there are no slashes before the first colon". */
const SCP_LIKE_URL = /^[^/\s:]+:\S+$/u;

/**
 * Whether `repo` is a git URL, in git's own syntaxes (git-scm.com/docs/git-clone,
 * "GIT URLS"): a `<scheme>://` URL or the scp-like `[<user>@]<host>:<path>`,
 * on any host. A spawn's {@link SpawnPayload.bootstrap} clones only one, by
 * plain git; a bare `owner/name` names no host, so it is none.
 */
export const isGitUrl = (repo: string): boolean =>
  SCHEME_URL.test(repo.trim()) || SCP_LIKE_URL.test(repo.trim());

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
  /** The session it goes to. */
  instanceId: string;
  /** The user turn, under the uuid it keeps everywhere it is shown. */
  message: import("./session-messages").SentMessage;
  /**
   * Which page and tab sent it (the dashboard's `submitCommand`): the page's
   * client id and its tab's presence, which the hub's send line names, so a
   * send that landed on the wrong session is read against what its own tab
   * showed.
   */
  provenance?: { clientId?: string; presenceId?: string };
}

/**
 * One record of a machine's that is on disk and does not parse (NULs a
 * crash left, a cut-off write): the file, why, and what it belongs to. What
 * it belongs to does not run until the person removes it; everything else
 * runs on.
 */
export interface DamagedRecordReport {
  file: string;
  /** The session it is a record of (its wake-ups), when it is one session's. */
  instanceId?: string;
  reason: string;
  /** The workspace it is a record of (`create.json`, `accounts.json`, `boundary.json`), when it is one workspace's. */
  workspaceId?: string;
}

/**
 * What the hub lays over a session row whose record, or whose workspace's
 * record, is damaged on its machine ({@link DamagedRecordReport}): the file,
 * why, and the way out that removes it (`archive`: archive workspace
 * `workspaceId`; `end`: end the session).
 */
export interface DamagedRow {
  file: string;
  reason: string;
  remedy: "archive" | "end";
  workspaceId?: string;
}

/**
 * A record of the hub's own that it read at start and found damaged: the
 * feature it belongs to is off until the person resets it (hub
 * `notices.ts`, `binary-updates.ts`). Nothing reads it as empty meanwhile.
 */
export interface DamagedHubRecord {
  file: string;
  reason: string;
}

/** The hub features whose one record can be damaged and reset, by what the person calls them. */
export type HubRecordFeature = "notices" | "update policy";

/**
 * `heartbeat`: the daemon's 15s pulse. `instances` is the supervisor's live
 * instance-id list (`SessionSupervisor.instanceIds`), sent on every beat so the
 * hub can reconcile session truth continuously rather than only at `register` —
 * a session the daemon has quietly dropped (crash, OOM kill, a restart that
 * never came back) stops appearing here well before any human notices, and one
 * a register missed because it raced a spawn shows up on the very next beat.
 */
export interface HeartbeatPayload {
  /**
   * The machine's activity as its desktop reads it (agent activity.ts): in
   * use, idle, locked or asleep, and how long since its last input. On
   * every 15s beat and on a beat of its own when it changes, only while the
   * person has said yes to this machine's report (`reportActivity`);
   * absent before, and where the machine has no desktop source.
   */
  activity?: import("./notifications").MachineActivity;
  /**
   * This machine has a desktop its agent could read (a Mac, a Linux
   * graphical session), said whether or not it reads it, so the presence
   * menu offers its switch. Nothing of the desktop itself.
   */
  activityReadable?: boolean;
  at: number;
  /** The machine's binary update state, live on every beat. */
  binaryUpdate?: import("./binary-updates").BinaryUpdateState;
  /** Fresh sessiond custody after an owner-named stop or register recovery. */
  custody?: SessionCustody;
  custodyComplete?: true;
  /**
   * Every record of the machine's that is on disk and cannot be read
   * ({@link DamagedRecordReport}), found by the agent's sweep as it starts or
   * by a reader since. The whole list on every 15s beat, empty when there is
   * none, so the hub replaces what it held; absent from the other beats.
   */
  damagedRecords?: DamagedRecordReport[];
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
  harnesses?: MachineHarnessReport[];
  /**
   * A fingerprint of the machine's own pi and OpenCode credential stores
   * (never their contents). Rides the beat `harnesses` rides, and again
   * whenever it changed: the hub moves what they hold into accounts each
   * time it differs from the last one it heard on this connection.
   */
  homeStores?: string;
  instances: string[];
  /**
   * What the machine has installed (git, claude, opencode, pi, node, a
   * browser, a service manager) and at which version. Rides one beat per
   * connection, once its probe finishes, for the reason `harnesses` does:
   * the probe asks each tool for its version.
   */
  machineCapabilities?: import("./capabilities").MachineCapabilities;
  /**
   * Every account of a provider other than Claude's with a store on the
   * machine (`~/.cawco/accounts/<id>/credential.json`), and who it is signed
   * in as there: the one credential every harness on the machine uses for
   * that provider. Rides the beat `harnesses` rides, and again whenever one
   * changed.
   */
  providerAccounts?: import("./accounts").AccountReport[];
  /**
   * The providers an account can be for on this machine, as each harness
   * lists them ({@link import("./accounts").MachineProviderLists}); the hub
   * joins them ({@link import("./accounts").joinProviders}). Rides the beat
   * `harnesses` rides.
   */
  providers?: import("./accounts").MachineProviderLists;
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
  /**
   * The hub's delivery mark for each instance the beat names
   * (stream.ts `DeliveryMark`): what the agent may stop keeping.
   */
  delivered: Record<string, import("./protocol").DeliveryMark>;
  keepAwake: string[];
  /**
   * Every workspace on the machine with a live work item (starting or
   * running), the whole list on every beat: the machine keeps each one's
   * boundary up whatever else holds it (agent boundary.ts `liveWhy`), and
   * closes none until it has heard this once.
   */
  liveWorkspaces: string[];
  ok: true;
  /**
   * The person said yes to this machine's activity report (the presence
   * menu, its onboarding step): its agent reads its desktop and says it on
   * its beats while this is true, and reads nothing while it is absent or
   * false. Off stops the reading at the next beat's answer; the hub uses
   * none of it from the moment it is turned off.
   */
  reportActivity?: boolean;
  /**
   * The fleet's session limits as the hub holds them now ({@link SessionLimits}),
   * on every beat: the machine replaces what it held, and the next process
   * its keeper starts runs under them.
   */
  sessionLimits?: SessionLimits;
  /**
   * The tailnet name and addresses the hub serves HTTPS on now, absent while
   * it doesn't (tailnet-https.ts `TailnetServing`), on every beat: the
   * agent's loopback carries to the hub by it (agent hub-loopback.ts).
   */
  tailnetHttps?: import("./tailnet-https").TailnetServing;
}

/**
 * The memory and CPU each session's process may use, set on the hub
 * (`/api/session-limits`) for every machine. Each is a percent of the machine
 * it runs on: its RAM, and its cores. Absent is no limit, which is the
 * default; the task limit every session runs under is the keeper's own and is
 * not set here (sessiond cgroup.ts `CHILD_TASKS`). Linux only: a keeper
 * writes them to the process's cgroup (`memory.max`, `cpu.max`) when it
 * starts it, and macOS has no cgroups.
 */
export interface SessionLimits {
  /** Of the machine's cores, 1 to 100. */
  cpuPercent?: number;
  /** Of the machine's RAM, 1 to 100. */
  memoryPercent?: number;
}

/** A start that names its harness: what the hub builds and sends a machine. */
export type NamedSpawn = SpawnPayload & {
  harness: import("./harness/kinds").HarnessKind;
};

/** A stop that names its row's harness: what the hub sends a machine. */
export type NamedStop = StopPayload & {
  harness: import("./harness/kinds").HarnessKind;
};

/**
 * A `stop` a dashboard or a fleet session asks the hub for: the hub sends the
 * machine the {@link NamedStop} the session's row names.
 */
export type StopRequest = Pick<
  StopPayload,
  "discard" | "from" | "instanceId" | "requestId"
>;

/** `stop`: interrupt and close a live session, as the hub sends it to its machine. */
export interface StopPayload {
  /** Addresses claimed by other rows; only unclaimed server runners make a legacy read ambiguous. */
  claimedSessionIds?: string[];
  cwd?: string;
  /** Explicitly abort unadopted custody too, then tear down spin-off resources. */
  discard?: boolean;
  /**
   * The hub forgets the session once this stop is confirmed (its end is a
   * delete or a transcript delete): the machine lets go of what it kept for
   * the session to be reattached, its browser door among it.
   */
  forget?: true;
  /** The instance a fleet-originated stop claims as its caller; the hub honours the call only when the target is that instance's own delegate. */
  from?: string;
  /**
   * The row's harness, which ends its process and its server custody without
   * adoption. The hub names it on every stop it sends a machine, and the
   * agent ends nothing without it; a dashboard's or an app's ask is a
   * {@link StopRequest}. Optional on the wire only until TestFlight 20261015,
   * 20261015.3, 20261017 and 20261018 are expired (the app they hold sends
   * this type); then it is required here.
   */
  harness?: import("./harness/kinds").HarnessKind;
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
 * — or a machine feature (`installTool`, the fleet controls). With
 * no `instanceId` and no `harness`, `listSessions` merges every harness.
 */
export interface ControlPayload {
  args?: unknown[];
  /** The instance a fleet-originated control claims as its caller; the hub honours the call only when the target is that instance's own delegate. */
  from?: string;
  /** The harness the machine-scoped call is addressed at; session calls route by instance. */
  harness?: import("./harness/kinds").HarnessKind;
  instanceId?: string;
  method: string;
  requestId: string;
}

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
 * The most an `fs media` read carries: one picture or video the transcript
 * card reads off a machine in a single frame (`send_to_user`, `show_image`).
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
  auth: import("./session-messages").AuthState | "unknown";
  binaryUpdate?: import("./binary-updates").BinaryUpdateState;
  /**
   * The cawco build this machine's daemon is running (NEW.md §12).
   */
  build?: BuildInfo;
  /**
   * The permission mode the person last started each harness's session in
   * on this machine, from any device (the hub's `chosen_modes`): the mode the
   * New session form opens on there. Absent for a harness never started.
   */
  chosenModes?: Partial<
    Record<
      import("./harness/kinds").HarnessKind,
      import("./harness/kinds").PermissionMode
    >
  >;
  /** Last register's sessiond read, distinct from an available empty list. */
  custody?: SessionCustody;
  /**
   * Last-known fleet-config sync report (NEW.md §11).
   */
  fleet?: FleetSyncReport;
  /**
   * Each fleet item as the machine's harnesses converge it (core fleet.ts
   * `FleetConvergeFrame`), by item id. Absent until the machine has said.
   */
  fleetItems?: Record<string, import("./fleet").FleetItemStatus>;
  /**
   * What became of the last fleet sync the hub sent it: sent, applied,
   * failed in the machine's words, or unanswered. Absent until the hub has
   * sent it one.
   */
  fleetSync?: import("./fleet").FleetSyncOutcome;
  /** What each installed harness can do, as the daemon reported at register. */
  harnesses?: import("./harness").HarnessReport[];
  /** The machine's home folder, absolute, as its daemon reported at register; absent until one that says so has. */
  home?: string;
  hostname: string;
  /** The hub runs on this machine, as the hub reads it: live, never stored. */
  hostsHub?: boolean;
  /** A `Date` inside the hub, the ISO string it serialises to everywhere else. */
  lastSeenAt: string | number | Date | null;
  /**
   * Since when (epoch ms) the hub has heard nothing from this machine, once
   * that has lasted `MACHINE_LOST_MS` with sessions on it (hub
   * machine-contact.ts): Needs you's item. Null while it answers. Live, as
   * `status` is: never stored.
   */
  lostAt?: number | null;
  machineCapabilities?: import("./capabilities").MachineCapabilities;
  machineId: string;
  os: string;
  /**
   * The owner paused the machine until this time (epoch ms): CawCo starts
   * nothing on it until then, though its agent stays connected. Null when it
   * is not paused.
   */
  pausedUntil: number | null;
  /**
   * What the pause stopped as it began, as said ({@link stoppedWords}):
   * "stopped 1 running check". Null when it stopped nothing, or is not paused.
   */
  pauseStopped: string | null;
  /**
   * Until when (epoch ms, the hub's clock, as `lostAt`) the hub reads this
   * machine as on its way back after its agent's link went: a read off it
   * answers so then (`Retry-After`), and offline after. Null while it is
   * connected or once it is offline. Live, as `status` is: never stored.
   */
  reconnectingUntil?: number | null;
  status: string;
  /**
   * Last-known tool status by tool id (NEW.md §10).
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
  "stop" | "discard" | "delete" | "delete-transcript";

/** Creation provenance, stored by the agent and carried durably on its hub row. */
export interface ScratchWorktree {
  dir: string;
  path: string;
  root: string;
}

/**
 * What a command the hub runs on a machine is, as a pause that stops it
 * counts it: one of an item's merge checks (the iOS build among them), or
 * any other.
 */
export type RunKind = "merge check" | "command";

/** How many of each kind a machine's pause stopped as it began. */
export type StoppedCommands = Partial<Record<RunKind, number>>;

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
 * - `sleeping` — no live process, but it runs again: on the session id its
 *   harness picks back up from, or fresh under its id when it never named
 *   one ({@link relaunchOf}). `sleeping` rows carry `lastError: null` — nothing
 *   went wrong, there's just nothing running.
 * - `stopping` — an end (stop, discard, or a delete that waits on its
 *   process) is recorded and owed to its machine, which has not yet
 *   confirmed the process is gone. It may still be running. Its machine's
 *   confirmation files it `stopped` (or `discarded`); an away machine leaves
 *   it here until it is back and confirms. For everything that asks whether
 *   the person ended it (filters, the Finished list, wake and resume
 *   gating), it is ended; for everything that asks whether a process
 *   remains, it is not gone yet.
 * - `stopped` — deliberate: the operator (or a `stop` call) ended it, and its
 *   machine confirmed the process gone.
 * - `error` — an actual failure. `lastError` is required here, and this is
 *   where {@link RESTART_LOST} still lands (`lastErrorKind` `restart-lost`): a
 *   restart with nothing to resume from is a real loss, not a nap.
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
  | "stopping"
  | "stopped"
  | "discarded"
  | "unknown"
  | "error";

/**
 * Statuses of a session its person, parent or the hub ended: confirmed gone
 * or still being stopped. What asks "was it ended?" reads this set; what asks
 * "is its process gone?" reads `stopped`/`discarded` alone.
 */
export const ENDED_STATUSES: ReadonlySet<InstanceStatus> = new Set([
  "stopping",
  "stopped",
  "discarded",
]);

/**
 * Statuses of a session that is over: ended ({@link ENDED_STATUSES}), or
 * failed. Its process is gone or going, or its end is decided; whether a
 * process still runs is its machine's custody to say.
 */
export const OVER_STATUSES: ReadonlySet<InstanceStatus> = new Set([
  ...ENDED_STATUSES,
  "error",
]);

/**
 * A continuation in a new session the hub is carrying, as every dashboard
 * follows it: the source files its open items (a person's Continue), is
 * summarised, then a new session starts seeded with the summary and those
 * items. The hub owns it from the POST that starts it to its end; its Cancel
 * (`DELETE /api/continuations/:id`) stops it in any stage before `started`.
 */
export interface ContinuationJob {
  error?: string;
  id: string;
  /**
   * Never sent: no job goes on in place now. Declared only because the
   * TestFlight builds 20261015 and 20261015.3 read it, which the hub's wire
   * check holds to (packages/hub/scripts/openapi.ts); it goes in the change
   * that expires them.
   */
  inPlace?: true;
  sourceInstanceId: string;
  /**
   * `waiting`: the source's process holds work in flight ending it would
   * lose ({@link waiting}), and the job goes on by itself once that ends;
   * `filing`: the source's turn filing its open items (a person's Continue);
   * `starting`: the new session is starting.
   */
  stage:
    | "waiting"
    | "filing"
    | "summarising"
    | "starting"
    | "started"
    | "failed"
    | "cancelled";
  /** Absent when the source is short enough that nothing is summarised. */
  summariserInstanceId?: string;
  targetInstanceId: string;
  /**
   * While `waiting`: what for, in the machine's words (`waiting for work in
   * flight to end: 1 command running`), since when it has run (epoch ms;
   * null when not known), and the latest moment it goes on, ending that
   * work (core `RESTART_WAIT_CAP_MS` from when it began to wait).
   */
  waiting?: { since: number | null; until: number; why: string };
}

/**
 * A session the hub knows about — one row of its `instances` table.
 */
/**
 * What the hub says a tab's id names (`POST /api/instances/named`): a tab
 * kept from an earlier visit, or an address, may name a session by its full
 * id, its short id, a former id, its harness key or a stored conversation's
 * key, or name nothing at all.
 * - `session`: the id the session is read by (`id`), the asked one or
 *   another.
 * - `none`: no session, stored conversation or ask goes by it.
 * - `unknown`: the hub can't tell now (the machine it names, or one it had
 *   to ask, is away or did not answer).
 */
export type TabNamed =
  | { asked: string; kind: "session"; id: string }
  | { asked: string; kind: "none" | "unknown" };

/**
 * How many tabs one `POST /api/instances/named` answers for: the hub's
 * bound on a request (a hand-written body cannot turn one into a sweep of
 * the fleet's transcripts), and the size a reader's tabs are asked in, so a
 * strip of more than this many is named whole.
 */
export const TAB_NAMES_PER_ASK = 64;

/**
 * What Recent draws of the transcripts the machines store, kept by the hub
 * off each machine's catalog (hub stored-recent.ts): `GET /api/stored`, then
 * each `stored` frame, whole.
 * - `rows`: the sessions wrapping a stored transcript in a project's folder
 *   that the board no longer lists, where the session at the top of their
 *   chain is the person's own ({@link personsOwn}), each with the sessions
 *   it nests under, as the board hands a row.
 * - `transcripts`: the transcripts in a project's folder that a person
 *   started (`NeutralSessionInfo.startedBy`) and no session of the hub
 *   wraps: transcripts run outside CawCo.
 */
export interface StoredRecent {
  rows: InstanceRow[];
  transcripts: StoredTranscript[];
}

/** A transcript stored on a machine, in a project's folder there ({@link StoredRecent}). */
export interface StoredTranscript {
  info: import("./session-messages").NeutralSessionInfo;
  machineId: string;
  /** The project whose folder holds it most closely (core `projectAt`). */
  projectId: string;
}

/** Hub-originated: Recent's stored transcripts, whole, on each change. */
export interface StoredFrame {
  instanceId?: undefined;
  kind: "stored";
  stored: StoredRecent;
}

/** What a session's `init` says about its MCP servers and tools. */
export interface SessionTooling {
  servers: { name: string; status: string }[];
  tools: string[];
}

/** What a session's `init` lists behind `/`: its command names, and which of them are skills. */
export interface SessionCommands {
  names: string[];
  skills: string[];
}

/**
 * Who started a session, stamped by the hub as it starts from who asked,
 * never from what the start carried: `person`, a person's own start (the
 * New session form, a move); `delegate`, a `delegate` call (a work item,
 * a routine's run and a design check among them); `project`, started by
 * its project's events (the session they reach); `check`, an agent's `start_session`, a start
 * from a page in an agent's own browser, and the hub's own workers. Only a
 * person's sessions stand at a project's top in the rails; every other one
 * nests under the session that started it.
 */
export type SessionOrigin = "person" | "delegate" | "project" | "check";

/**
 * The person's own work: a session they started, or one they wrote in. The
 * one rule for whose sessions a list holds (the dashboard's Recent, the
 * hub's {@link StoredRecent}).
 */
export const personsOwn = (row: {
  origin?: SessionOrigin | null;
  wroteAt?: unknown;
}): boolean =>
  row.origin === "person" ||
  (row.wroteAt !== null && row.wroteAt !== undefined);

export interface InstanceRow {
  /**
   * The account the session runs on (`instances.account_id`): placed once as
   * it starts and kept for its whole life. Null on a harness without accounts
   * and on a session from before accounts existed.
   */
  accountId?: string | null;
  /**
   * The effort the operator chose for the session: its spawn's level, or the
   * last `setEffort` sent it. The hub starts every process of the session at
   * it, whatever brings it back; a reading never moves it. Null: nobody
   * chose, and the harness runs its model's default.
   */
  chosenEffort?: import("./harness/kinds").EffortLevel | null;
  /**
   * Started clean ({@link SpawnPayload.clean}): written by its first spawn
   * and kept, so every launch of it is clean and a comparison can tell it
   * from a session started with its context.
   */
  clean?: boolean;
  /**
   * The session a continuation moved this one's work item to: this one never
   * runs again ({@link relaunchOf} refuses it), and what is sent to it goes
   * there. Null on every other session.
   */
  continuedInto?: string | null;
  /** When the hub first opened its row: when it was started. */
  createdAt?: string | number | Date | null;
  /** The directory the session was launched in; see `launchDir`. */
  cwd: string;
  /**
   * Its record, or its workspace's, is damaged on its machine
   * ({@link DamagedRow}): laid over by the hub from the machine's last beat,
   * never stored. `lastError` says the same in words.
   */
  damaged?: DamagedRow;
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
   * When the person pressed Done on it (an archive), on the hub's clock: off
   * the sidebar's Recent list until they write to it again. Null otherwise.
   */
  doneAt?: string | number | Date | null;
  /**
   * The effort the session actually sends, as its agent last read it back from
   * the harness ({@link import("./harness").EFFORT_READ}): a level, `none` when
   * it sends no effort, null until the first reading lands. What its chip
   * shows; never what a launch of it asks for ({@link chosenEffort}).
   */
  effort?: import("./harness/kinds").SessionEffort | null;
  /** Which harness owns {@link sessionId} — what a resume and a catalog read route on. */
  harness: import("./harness/kinds").HarnessKind;
  /** First-hand custody on the current agent connection, never stored liveness. */
  held?: { since: number; reason: string };
  id: string;
  keepAlive?: KeepAlive;
  /** `mainline`, `scratch` for a spin-off, or `summariser`, never on the board. */
  kind: string;
  /** What killed the session, on a row the agent reported as `error`: words a person reads. */
  lastError?: string | null;
  /**
   * What `lastError` was, typed where it was found; null when no producer
   * typed it. What every decision about the row reads, `relaunchOf` first.
   */
  lastErrorKind?: LastErrorKind | null;
  lastRequestAt?: string | number | Date | null;
  /**
   * Whether `cwd` is the launch directory: `known`; `unread`, still to be read
   * from its machine; `unknown`, its machine has no record of its conversation,
   * so `cwd` may be a folder its CLI wandered into and the session is named by
   * its title (hub `sessionLabel`) and cannot be resumed.
   */
  launchDir: "known" | "unread" | "unknown";
  machineId: string;
  /**
   * The delegate types the session may start ({@link MayStart}): `["any"]`
   * an orchestrator's, any other list a leaf's (the empty one by default).
   * Null on a session nobody delegated, which may start any.
   */
  mayStart?: MayStart | null;
  model?: string | null;
  /**
   * Who started it ({@link SessionOrigin}), as the hub stamped it at its
   * start. A row the hub sends always has it.
   */
  origin?: SessionOrigin;
  /**
   * The account a person moved it to that it moves to at its next launch,
   * as the hub keeps it (its `owed_moves`), until the move lands: what it
   * waits on, its turn's end, the background work its process holds ending,
   * or its machine connected again. Absent when it owes none.
   */
  owedMove?: { accountId: string; waits: "turn" | "work" | "machine" };
  /**
   * The session that started this one (`delegate`, `start_session`), which every rail nests it under; absent on a
   * session a person started. A delegate is told from a session merely
   * started by {@link workItemId}, never by where it stands.
   */
  parentInstanceId?: string | null;
  /** The delegating tool call, so the parent transcript can render the round trip. */
  parentToolUseId?: string | null;
  /**
   * How the session answers tool permissions and which model answers, as of its
   * last spawn, switch or `init`. Null on a session that has never said.
   */
  permissionMode?: string | null;
  /**
   * Its one project, written by the hub as it started: the project it was
   * started in, its parent's for a delegate, Caw's work or a check, else
   * the project whose place holds its folder most closely. Null when none
   * does. The rails list a session under this project and no other.
   */
  projectId?: string | null;
  /**
   * The sends waiting for it (accepted, not yet read by its session; a keep-
   * alive ping aside): one starts its next turn. Laid over by the hub from
   * its send records, never stored; absent at none. The sidebar counts a
   * session with one as still working.
   */
  queuedSends?: number;
  /**
   * The toolset it runs in, when its spawn named one; null: derived from
   * how it started.
   */
  role?: import("./delegate-types").SessionRole | null;
  /** Hub-derived count of live delegated work items, including descendants and checks. */
  runningDelegates?: number;
  /**
   * When the owner last looked at it (its tab in front, after it ended) or
   * archived it off Finished, on any device, or the end of a turn that had
   * nothing for them when nothing before it was unseen. Null on one never
   * seen.
   */
  seenAt?: string | number | Date | null;
  /** The harness's own session id, once the session has named itself. */
  sessionId: string | null;
  /**
   * The session is stopped at its account's limit (or on its refused
   * sign-in), in words, as the hub's at-limit controller holds it (hub
   * at-limit.ts `stall`): what happened and when it carries on; `until`,
   * epoch ms, the moment it does. Absent while it runs. Its row, its head and
   * its transcript show it as an error with the way out: another account
   * from its menu.
   */
  stalled?: { until?: number; words: string };
  /**
   * The skills and MCP servers it started with ({@link
   * SpawnPayload.startingSet}): written by its first spawn and kept, so every
   * launch of it starts with the same set. Null: everything installed.
   */
  startingSet?: import("./delegate-types").StartingSet | null;
  status: InstanceStatus;
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
  /**
   * When its latest turn ended, on the hub's clock, as `seenAt` is: the
   * two together say whether it ended since the owner last looked. Null on
   * one whose turn never ended.
   */
  turnEndedAt?: string | number | Date | null;
  /** When the row last moved. */
  updatedAt?: string | number | Date | null;
  /**
   * Its latest turn ended with work of its own that will start it again
   * (harness.ts `waitsOnItself`: a background command, a monitor, a wake-up
   * it set itself). The sidebar counts it as still working.
   */
  wakesItself?: boolean;
  /**
   * The work item this session runs: every delegate is one, and a session
   * never runs more than one. Null on a session nobody delegated, and on a
   * delegate from before work items existed.
   */
  workItemId?: string | null;
  /**
   * The workspace of its own its work item runs in (a delegate's clone), as
   * the board reads it off that item: what the session menu's Archive
   * workspace names (dashboard LiveSessionMenu). Null on a session with no
   * work item.
   */
  workspaceId?: string | null;
  /**
   * When the person last wrote to it (a send of theirs the hub accepted,
   * harness.ts `byPerson`), on the hub's clock. Null when they never did.
   */
  wroteAt?: string | number | Date | null;
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
  /**
   * While its landing waits between `finish_item` and its outcome (the
   * merge checks' shared machine slot, a machine's pause, its turn to land):
   * "queued for the Mac's build slot behind …", and since when (epoch ms);
   * null otherwise. Named for the checks it once was: shipped iOS builds
   * decode it under this key.
   */
  checkQueue: { words: string; since: number } | null;
  createdAt: number;
  dismissedAt: number | null;
  /** Why the reader dismissed it, in their words; null unless dismissed with a reason. */
  dismissReason: string | null;
  endedAt: number | null;
  /**
   * The glance of each: what it was asked, what it reported (its
   * `finish_item` headline whole, else its report's first line), why it
   * failed (first lines).
   */
  firstLines: { brief: string; result: string; error: string };
  id: string;
  instanceId: string;
  /**
   * While the machine its workspace is on is paused: "Omars-MacBook-Pro is
   * paused until 00:57". Its session runs no turn until then. Null otherwise.
   */
  machinePaused: string | null;
  parentInstanceId: string;
  /**
   * While it waits to start: the files it owns, which a live item owns too
   * (`src/theme/**`), and the pause of the machine it starts on ("obelisk is
   * paused until 00:57"), when that is what it waits for; null once it has
   * started.
   */
  queued: { owns: string[]; paused: string | null } | null;
  /** The later item of the same tray the reader said took over its work; null otherwise. */
  replacedBy: string | null;
  /**
   * While its account's limit (or a refused sign-in) has stopped its
   * session: "Stopped at A's limit; continues on B", "…; continues at
   * 15:40" (core `accountsWords.stalled`). It runs no turn until then; null
   * otherwise.
   */
  stalled: string | null;
  // Indexed off the owner: the apps' schema names this field's enum by the hub's `WorkItemState`.
  state: (typeof WORK_ITEM_STATES)[number];
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
 * hub — a `delegate_events` row (packages/hub `db/schema.ts`), summed up per
 * delegate over `POST /api/delegate-summaries` ({@link DelegateSummary}),
 * paged over `GET /api/delegate-events` and pushed as a `delegate_event`
 * frame. The hub is the system of record: the transcript markers say the
 * same things, but only for a reader who was watching, and only as text to
 * be parsed back.
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
        /** The delegate's one-or-two-sentence outcome, when it finished with `finish_item`. */
        headline?: string;
        /**
         * The hub's own word about the delegate's work, not the delegate's
         * report (core injected.ts `reportMarker`, its outcome `notice`):
         * its workspace held, or retired with its commits in a carry (hub
         * work-items.ts `workspaceNotice`). Absent on a report.
         */
        notice?: true;
        /**
         * The files its finish copied into its project's folder, as paths
         * from the folder's root (`assets/tsk-12/plan.md`); absent when it
         * handed in none.
         */
        outputs?: string[];
        resultId?: string;
        completedAt?: string;
      };
    });

/** The three things a delegate and its parent ever say to each other. */
export type DelegateEventKind = DelegateEvent["kind"];

/** What each kind carries: the ask's own input, the answer, the turn's report. */
export type DelegateEventPayload = DelegateEvent["payload"];

/**
 * How many delegates one `POST /api/delegate-summaries` names at most: a
 * screen of cards, never a sweep of everything a parent ever ran. A reader
 * with more asks in batches of this size.
 */
export const DELEGATE_SUMMARIES_LIMIT = 64;

/**
 * What a delegate's card in its parent's transcript draws of its traffic
 * with that parent, as `POST /api/delegate-summaries` answers it: the newest
 * report whole, the asks still waiting whole, and how many of each there
 * were. The rest of its events stay on the hub; the card draws none of them.
 */
export interface DelegateSummary {
  /** How many asks it routed to the parent, answered or not. */
  asks: number;
  instanceId: string;
  /** Its asks still waiting on an answer, oldest first. */
  pending: Extract<DelegateEvent, { kind: "ask" }>[];
  /** Its newest report, or null before its first. */
  report: Extract<DelegateEvent, { kind: "report" }> | null;
  /** How many turns it reported. */
  reports: number;
  /**
   * The highest event id the summary counts. A pushed `delegate_event` at or
   * below it is already in here; one above it came after.
   */
  through: number;
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
  // Indexed off the owner, not `Activity`: the apps' schema names this field's enum.
  /** Coarse now-state the rail draws without frames. */
  activity: (typeof ACTIVITIES)[number];
  /** ms epoch of the last frame that changed this pulse. */
  at: number;
  busy: boolean;
  /** The tool the main loop is inside, addressed as the transcript addresses it. */
  currentTool: { name: string; glance: string; toolId: string } | null;
  instanceId: string;
  runningSubagents: number;
}

/** One artifact as the panel's list shows it, newest first. */
export interface ArtifactSummary {
  /** The one line the panel's head shows under its title: what the person does here, in their words. Empty on one made before asks were kept. */
  ask: string;
  createdAt: string;
  /** What the person does on it. */
  does: ArtifactDoes;
  id: string;
  kind: ArtifactKind;
  /** Its slug, what the agent's tools and its URLs name it by; never shown to the person. */
  name: string;
  /**
   * What it waits on the person for, as Needs you derives it (core
   * artifact-needs.ts), strongest first; null when nothing is asked of the
   * person.
   */
  pending: import("./artifact-needs").ArtifactPending | null;
  /**
   * The project whose preview origin serves it: a project's page (Projects
   * spec §5.8), loaded at `/__cawco/page/<id>/` there (`projectPagePlace`);
   * absent for anything its session's origin serves.
   */
  project?: string;
  /** Its last promote into the project's folder (`artifact_promote`, the doc's `meta.promoted`); null until one. */
  promoted: ArtifactPromotion | null;
  /** The person pressed Send on it since the session last revised it or changed its ask. */
  sent: boolean;
  /** When it was last brought to the front of the panel. */
  shownAt: string | null;
  /** Its latest picture, served at `GET /api/artifacts/:id/thumbnail/:scheme`; null until a screen drew one. */
  thumbnail: ArtifactThumbnail | null;
  /** What every surface names it by to the person, in the agent's plain words ({@link ARTIFACT_TITLE_LIMIT}). Empty on one made before titles were kept. */
  title: string;
  updatedAt: string;
  /** What it waits on the person for ({@link pending}) stands: its card and its row wear the needs-you dot. */
  waiting: boolean;
}

/**
 * An artifact's latest picture: a page's or preview's thumbnail as the
 * dashboard's pane took it (both schemes, or one when the page draws the
 * same in both), a canvas's own picture. `at` changes with every new one.
 */
export interface ArtifactThumbnail {
  at: string;
  /** Its pixels, as its PNG says: the card is laid out at its shape before it loads. */
  height: number;
  /** The page draws the same in both schemes: `light` is its one picture. */
  single: boolean;
  width: number;
}

/**
 * One of a session's artifacts a Files search matched
 * (`GET /api/instances/:id/artifacts/search`), best first: what matched,
 * and where the words on its page did, the words around the first hit with
 * each hit between 「 and 」 (the finder's excerpt).
 */
export interface ArtifactHit {
  excerpt: string | null;
  id: string;
}

/**
 * One attachment a session's conversation carried, as Files lists them
 * (`GET /api/instances/:id/attachments`, newest first): a text pasted at
 * length, a file the hub stores, or a picture, read off the whole
 * transcript on the hub, whatever pages a reader has loaded.
 */
export interface SessionAttachment {
  /** When its message was, ISO-8601; null when the harness gave no time. */
  at: string | null;
  /** A text's words, for reading it in place. */
  content?: string;
  /** Its message's id and its place within that message: the same however the list grows. */
  id: string;
  kind: "text" | "file" | "image";
  mediaType: string;
  /** The message it rode, for Show in conversation (`?at=`). */
  messageId: string;
  /** A file's or text's name; a picture's is its place among the conversation's pictures ("Picture 3"). */
  name: string;
  /** Where the hub serves a file (`/api/files/<sha256>`); absent when the harness's copy names only part of its hash. */
  ref?: string;
  /** A file's length in bytes. */
  size?: number;
  /** A picture's address. */
  src?: string;
  /** Who sent it: the person, or the session's agent. */
  who: "person" | "agent";
}

/** A session's attachments as Files reads them: the list, and the harness that speaks as the agent. */
export interface SessionAttachments {
  attachments: SessionAttachment[];
  harness: import("./harness/kinds").HarnessKind;
}

/** An artifact's promote: the project folder's commit that holds it, and when. */
export interface ArtifactPromotion {
  at: string;
  commit: string;
}

/**
 * The mDNS service the hub advertises and `cawco` browses for.
 */
export const CAWCO_MDNS_TYPE = "cawco";

/** Pushed by the hub to an online machine when the fleet's update policy changes. */
export const CONFIGURE_BINARY_UPDATES = "configureBinaryUpdates";

/** Returns a machine that is waiting to install back to `available`: the person changed their mind. */
export const CANCEL_BINARY_UPDATE = "cancelBinaryUpdate";

/**
 * The hub's word on how far it has ingested one instance: the last line it
 * turned into a frame. Handed back on the register ack so a reattaching agent
 * replays exactly the gap the hub names — the mark is the hub's own, so the
 * agent's death loses nothing it needs.
 */
export interface IngestMark {
  epoch: string;
  srcSeq: number;
}

/**
 * THE DELIVERY LEDGER: an agent process's own count of the frames it has
 * sent one session (`epoch`, random at the agent's start; `seq`, 1 up), as
 * a frame's `sent` stamp and as the hub's mark of the last one it took.
 *
 * The ingest ledger ({@link IngestMark}) counts sessiond lines, which a
 * returning agent replays from sessiond's ring; it says nothing of a frame
 * the agent made itself, or of a harness with no ring behind it (opencode).
 * This one counts every frame the agent sends, so a link that dropped while
 * both ends stayed up loses none: the agent keeps what the hub has not
 * acknowledged (agent outbox.ts) and sends it again behind the mark the hub
 * hands back, and the hub refuses what it already took
 * ({@link alreadyDelivered}).
 */
export interface DeliveryMark {
  epoch: string;
  seq: number;
}
