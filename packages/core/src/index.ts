import { CAWCO_MCP_DEFAULT_PORT, type FleetSyncReport } from "./fleet";
import type { MachineHarnessReport } from "./harness";
import type { ToolStatus } from "./tools";

// Accounts: several sign-ins per provider, and which one a session runs on.
// biome-ignore lint/performance/noBarrelFile: this is the package's public API surface — packages/core's consumers (hub, cli, dashboard) import from "@cawco/core" as one module, not per-file.
export * from "./accounts";
// Connections: outside services the hub signs in to and calls for sessions.
export * from "./actions";
// "Continue in new session": the size rules the hub and the dashboard share.
export * from "./archive";
// What waits on the person among the artifacts: Needs you's artifact items.
export * from "./artifact-needs";
// Files and texts a turn carries, and the line naming each attached file.
export * from "./attachments";
// Pages are blocks: a project page's arrangement, kept by the hub.
export * from "./blocks";
// A project's browser: its key, the agent's ports, the daemon's frame and the hub's commands.
export * from "./browser";
// An artifact's `state`: one entry per choice or field, and its bounds.
export * from "./choices";
// Claude Code's dir names, as a screen, a message or a shell script names them (paths.ts owns the paths).
export * from "./claude-dirs";
export * from "./connections";
export * from "./continuation";
export * from "./continuation-read";
// Delegate types: named presets the `delegate` tool's `type` param resolves,
// so routing is by description instead of a raw model string.
export * from "./delegate-types";
// A task's deliverables by kind, and a post task's `*.post.json`.
export * from "./deliverables";
// A checkout's JavaScript dependencies from its root lockfile: a workspace's
// cut and the repository's scripts, never the landing gate.
export * from "./deps";
// Finding things across the fleet: what /api/find answers (find.ts).
export * from "./find";
// Fleet MCP + skills desired state, sync reports, and the `/` menu (NEW.md §11).
export * from "./fleet";
// Fleet watch: its signals, limits, words and frames (Projects spec §5.3).
export * from "./fleet-watch";
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
export * from "./hub-auth";
export * from "./injected";
// Adding a machine: one install, kept by the hub from its start to the
// person's act on its outcome (hub installs.ts), and its window's steps.
export * from "./install";
// The system's laws, named and checked in the running product: `invariant()`.
export * from "./invariant";
// Adding a machine: the join routes' shapes and the install script's step
// prefix, which `cawco binary-install agent` prints and the hub reads back off SSH output.
export * from "./join";
// The hub's `.local` name and the dashboard's address at it.
export * from "./local-name";
// Moving a project to a machine without a checkout of it: the hub-owned job,
// its estimate and request, and the hub ↔ machine controls that run its steps.
export * from "./move";
// Where the owner is (presence) and which notifications are over (clears):
// the hub holds a session's notifications while a client has it in front.
export * from "./notifications";
// What a permission prompt says on every surface, stamped by the hub as it
// parks the ask: the summary, who asked, the change it makes, its fields.
export * from "./permission-presentation";
// A session's plan: its steps, its spec, its task's to-dos, and their live frames.
export * from "./plan";
// A project's landing gate as its gate.md declares it: the hub reads it, Settings draws it.
export type {
  DeclaredStep,
  ProjectGate,
  RunsOnCapability,
} from "./project-gate";
// Which projects a session lists in: the rail and the hub's forget read one rule.
export * from "./project-membership";
// How an `AskUserQuestion` answer is shaped, wherever it is answered from —
// the dashboard, the app, a parent session's `answer_delegate`.
// Shared because the tool's schema is unforgiving: the answers go back inside
// the tool's own input or the call fails validation.
export * from "./question";
export * from "./references";
export * from "./relays";
// The bounded replay ring behind the Ledger Protocol — SessionRing, lifted
// from packages/hub/src/stream.ts so sessiond's per-child ring (see
// sessiond.ts) can reuse the identical class.
export * from "./ring";
// Standing instructions the hub enforces on every session: a phrase to watch
// for and a reply to send back. The matcher lives here so the hub and the
// editor's test box decide identically.
export * from "./rules";
// What reads as a credential in text: a memory note's words, a file a place's first commit would take.
export * from "./secret-text";
// A project's starters: what its empty board and Caw's panel offer to say to him.
export * from "./starters";
// The Ledger Protocol: canonical session streams + acknowledged commands.
export * from "./stream";
// The fleet's stream relay: its ports, the daemon's frame, the hub's commands and the relay step's words.
export * from "./stream-relay";
// HTTPS on the hub machine's tailnet name: its state, and a preview's origin there.
export * from "./tailnet-https";
// A project's threads with its Caw: rows, messages and their frames.
export * from "./threads";
// The workflow-tool catalog and its status/policy shapes (NEW.md §10).
export * from "./tools";
// Where a project's tasks live (Projects spec D2): CawCo's files, GitHub Issues or Linear.
export * from "./trackers";
// Transcripts: the hub folds each session's frames into blocks once
// (TranscriptBuilder) and every client renders what it serves.
export { TRANSCRIPT_PAGE, TranscriptBuilder } from "./transcript";
export {
  COMPACT_SUMMARY_KIND,
  getToolGlance,
  interruptLine,
  personWords,
  transcriptUserText,
} from "./transcript-rules";
export * from "./transcript-types";
// Usage, cost & limits (USAGE-SPEC.md §4). Pure types/math only.
export * from "./usage";
// A project's custom views: their files, and the view tools' inputs and
// outputs. The OpenUI library itself is `@cawco/core/views-library`.
export * from "./views";

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
      /**
       * The project's memory documents for the place the session runs in
       * (`FleetConfig.placedMemory`'s copies for that place), written there
       * before the session starts: a workspace opened for this launch is
       * placed in the same step, so the sync its place set off may land
       * after the session has read its rules.
       */
      placedMemory?: import("./fleet").FleetPlacedMemoryDoc[];
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
   * Whether this session may spawn sessions of its own (`delegate` and
   * `start_session`). Set by the `delegate` tool's `can_delegate` param; a
   * delegate that is not granted it is a leaf: claude and pi never give it the
   * spawning tools, and the hub refuses any spawn naming it as parent. Absent
   * on a session nobody delegated (a mainline session may always delegate).
   */
  canDelegate?: boolean;
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
  effort?: import("./harness").EffortLevel;
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
  harness?: import("./harness").HarnessKind;
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
  /** Hub ingest cursor for a recovery sent after the registration handover. */
  ingested?: import("./stream").IngestMark;
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
   * This spawn is a project's Caw (a `lead` row): the machine puts each of
   * his shell and edit calls to the hub as a permission ask
   * (`LEAD_GATED_TOOLS`), whatever his mode, and answers none of them
   * itself; the hub's gate decides each (hub lead-gate.ts). Set by the hub
   * alone, on every launch of a lead row, and never taken from a caller.
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

const TRAILING_SLASHES = /\/+$/;
const URL_SCHEME_AND_HOST = /^[a-z][a-z0-9+.-]*:\/\/[^/]+\//i;
const SCP_LIKE_HOST = /^[^/]+@[^:]+:/;
const DOT_GIT_SUFFIX = /\.git$/;

/** A URL with a scheme: `https://`, `ssh://`, `git://`, `file://`, any `<scheme>://`. */
const SCHEME_URL = /^[a-z][a-z0-9+.-]*:\/\/\S+$/i;
/** git's scp-like form, `[<user>@]<host>:<path>`: "only recognized if there are no slashes before the first colon". */
const SCP_LIKE_URL = /^[^/\s:]+:\S+$/;

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
  instanceId: string;
  /** The user turn, under the uuid it keeps everywhere it is shown. */
  message: import("./harness").SentMessage;
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

/** What a {@link DamagedRow} says to the person: what happened, and the way out (WORDS.md's error formula). */
export const damagedWords = (damaged: DamagedRow): string =>
  damaged.remedy === "archive"
    ? `This workspace's record is damaged: ${damaged.file} (${damaged.reason}). Archive workspace ${damaged.workspaceId ?? ""} to remove it. Every other workspace runs as before.`
    : `This session's record is damaged: ${damaged.file} (${damaged.reason}). Its wake-ups are not known until its next turn ends, which writes the record whole again. Stop the session to remove it.`;

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

/** What a damaged hub record says to the person, and its way out (WORDS.md's error formula). */
export const damagedHubRecordWords = (
  feature: HubRecordFeature,
  damaged: DamagedHubRecord
): string =>
  `This hub's ${feature} record is damaged: ${damaged.file} (${damaged.reason}). ${feature === "notices" ? "Notices are off" : "Updates are off"} until you reset it; Reset writes a fresh record.`;

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
   * every 15s beat and on a beat of its own when it changes; absent where
   * the machine has no desktop source (no GUI session, no logind).
   */
  activity?: import("./notifications").MachineActivity;
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
  delivered: Record<string, import("./stream").DeliveryMark>;
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
  /**
   * The upstream guard's rules as the hub holds them now (upstream-guard.ts
   * `UpstreamRules`), on every beat: each workspace's shims judge the next
   * call by them (agent boundary.ts `takeUpstreamRules`).
   */
  upstream?: import("./upstream-guard").UpstreamRules;
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
  harness: import("./harness").HarnessKind;
};

/** A stop that names its row's harness: what the hub sends a machine. */
export type NamedStop = StopPayload & {
  harness: import("./harness").HarnessKind;
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
 * — or a machine feature (`installTool`, the fleet controls). With
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
 * OpenCode's Code Mode tool: MCP tools are reached through the programs it
 * runs, each of a program's calls its own tool_use frame under the
 * program's (`parent_tool_use_id`).
 */
export const CODE_MODE_TOOL = "execute";

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
  /** The machine's home folder, absolute, as its daemon reported at register; absent until one that says so has. */
  home?: string;
  hostname: string;
  /** A `Date` inside the hub, the ISO string it serialises to everywhere else. */
  lastSeenAt: string | number | Date | null;
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
  "stop" | "discard" | "delete" | "delete-transcript";

/** Creation provenance, stored by the agent and carried durably on its hub row. */
export interface ScratchWorktree {
  dir: string;
  path: string;
  root: string;
}

/** mDNS and router suffixes: they say "same network", which the fleet already implies. */
const LOCAL_SUFFIXES = [".local", ".lan", ".home"];

/**
 * A machine pause's end as the fleet says it (hub machine-pause.ts): the
 * local clock, "00:57", and the weekday too when it is not today ("Fri 08:00").
 */
export function pauseClock(at: number, now = Date.now()): string {
  const end = new Date(at);
  const time = end.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return end.toDateString() === new Date(now).toDateString()
    ? time
    : `${end.toLocaleDateString("en-GB", { weekday: "short" })} ${time}`;
}

/**
 * What a command the hub runs on a machine is, as a pause that stops it
 * counts it: a step of an item's landing gate (the iOS build among them), a
 * workflow's `w.exec`, or any other.
 */
export type RunKind = "landing gate" | "workflow command" | "command";

const COMMAND_NOUNS: Record<RunKind, [string, string]> = {
  "landing gate": ["landing gate step", "landing gate steps"],
  "workflow command": ["workflow command", "workflow commands"],
  command: ["command", "commands"],
};

/** How many of each kind a machine's pause stopped as it began. */
export type StoppedCommands = Partial<Record<RunKind, number>>;

/**
 * "stopped 1 running landing gate step", "stopped 2 running landing gate
 * steps and 1 running command"; undefined when the pause stopped nothing.
 */
export function stoppedWords(stopped: StoppedCommands): string | undefined {
  const parts = (Object.keys(COMMAND_NOUNS) as RunKind[]).flatMap((kind) => {
    const count = stopped[kind] ?? 0;
    const [one, many] = COMMAND_NOUNS[kind];
    return count > 0 ? [`${count} running ${count === 1 ? one : many}`] : [];
  });
  if (parts.length === 0) {
    return;
  }
  const last = parts.pop();
  return `stopped ${parts.length > 0 ? `${parts.join(", ")} and ${last}` : last}`;
}

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

/** What naming a machine reads of it: an agents row, or any row shaped like one. */
export interface NamedMachine {
  hostname: string;
  machineId: string;
}

/** Ordinals a sentence spells out; past them it says "machine number 11". */
const ORDINALS = [
  "first",
  "second",
  "third",
  "fourth",
  "fifth",
  "sixth",
  "seventh",
  "eighth",
  "ninth",
  "tenth",
];

/**
 * A machine as a sentence names it among `fleet`: its {@link machineLabel},
 * else words for a stranger, never its id. Machines that show the same name
 * (machines on one host do, a scratch fleet's all of them) are told apart by
 * their place among those in `fleet`, which the hub lists in join order: the
 * first is "obelisk-of-light", the next "obelisk-of-light (the second
 * machine with that name)". Before 2026-10-18 the next was
 * "obelisk-of-light · 2", which inside a sentence read like a count.
 */
export function machineCalled(
  machineId: string,
  fleet: readonly NamedMachine[]
): string {
  const machine = fleet.find((each) => each.machineId === machineId);
  if (!machine) {
    return "a machine this hub doesn't know";
  }
  const name = machineLabel(machine.hostname);
  const place = fleet
    .filter(
      (other) =>
        machineLabel(other.hostname).toLowerCase() === name.toLowerCase()
    )
    .findIndex((other) => other.machineId === machineId);
  if (place <= 0) {
    return name;
  }
  const nth = ORDINALS[place];
  return `${name} (${nth ? `the ${nth} machine` : `machine number ${place + 1}`} with that name)`;
}

/** Machines as a sentence lists them, each {@link machineCalled} among `fleet`, or `none`. */
export function machinesCalled(
  machines: readonly NamedMachine[],
  fleet: readonly NamedMachine[],
  none = "none"
): string {
  return (
    machines
      .map((machine) => machineCalled(machine.machineId, fleet))
      .join(", ") || none
  );
}

/** A machine's state that keeps a request from it. */
export type MachineFault = "offline" | "silent" | "unknown";

const MACHINE_FAULT_WORDS: Record<MachineFault, [string, string]> = {
  offline: ["isn't connected.", "Try again once it's back."],
  silent: ["didn't answer in time.", "Try again in a moment."],
  unknown: ["isn't on this hub any more.", "Pick another machine."],
};

/**
 * Why a machine could not take a request, as the person reads it (WORDS.md's
 * error formula): the machine by its name, never its id; what to do. `name`
 * is its {@link machineCalled}, undefined when the hub doesn't know the machine.
 * `next: false`, the cause alone, for a reader that says its own next step
 * (a preview pane that tries again by itself).
 */
export function machineFaultWords(
  name: string | undefined,
  fault: MachineFault,
  { next = true }: { next?: boolean } = {}
): string {
  const [cause, step] = MACHINE_FAULT_WORDS[fault];
  return `${name ?? "That machine"} ${cause}${next ? ` ${step}` : ""}`;
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
 * A missing Claude conversation is terminal; restarting cannot recreate its
 * history. The words a person reads; what CawCo decides by is the kind
 * `conversation-gone` ({@link LastErrorKind}).
 */
export const CLAUDE_CONVERSATION_GONE =
  "This Claude Code conversation is gone and cannot be resumed. Start a new session to continue working.";

/**
 * What a session's failure was, typed where it is found, beside the words
 * (`lastError`) a person reads. Every decision about a failed row reads this,
 * never the words:
 * - `conversation-gone` — the conversation it would resume is gone
 *   ({@link CLAUDE_CONVERSATION_GONE}): it never runs on it again;
 * - `restart-lost` — its daemon restarted and it left nothing to resume from
 *   ({@link RESTART_LOST});
 * - `start-refused` — the hub would not restore it: its account or its
 *   settings cannot run on its machine (hub server.ts `restore`). It stays
 *   so, unrestored, until they can.
 * A failure no producer typed has none.
 */
export type LastErrorKind =
  "conversation-gone" | "restart-lost" | "start-refused";

/** An error that carries its {@link LastErrorKind} from where it is made to the row it fails. */
export class KindedError extends Error {
  readonly lastErrorKind: LastErrorKind;
  constructor(lastErrorKind: LastErrorKind, message: string) {
    super(message);
    this.name = "KindedError";
    this.lastErrorKind = lastErrorKind;
  }
}

/** A Claude conversation that is gone: its words, and its kind. */
export const conversationGone = (): KindedError =>
  new KindedError("conversation-gone", CLAUDE_CONVERSATION_GONE);

/**
 * Whether a row the hub refused to restore still stands refused: filed
 * `error` with the kind `start-refused`, whatever words its refusal said
 * then or says now. Its restore fails it once, not on every boot.
 */
export const startRefused = (row: {
  lastErrorKind?: LastErrorKind | null;
  status: string;
}): boolean => row.status === "error" && row.lastErrorKind === "start-refused";

/** Every {@link LastErrorKind}, for a reader of one off the wire. */
const LAST_ERROR_KINDS: ReadonlySet<string> = new Set<LastErrorKind>([
  "conversation-gone",
  "restart-lost",
  "start-refused",
]);

/** `value` as a {@link LastErrorKind}, when it is one. */
export const asLastErrorKind = (value: unknown): LastErrorKind | undefined =>
  typeof value === "string" && LAST_ERROR_KINDS.has(value)
    ? (value as LastErrorKind)
    : undefined;

/** The {@link LastErrorKind} an error carries, when its maker typed it. */
export const lastErrorKindOf = (error: unknown): LastErrorKind | undefined =>
  error instanceof KindedError ? error.lastErrorKind : undefined;

/**
 * How a session with no process comes back: on its conversation by its key;
 * fresh under the same id when its harness never began one (no key: it never
 * said init), so there is nothing to lose; or not at all when its
 * conversation existed and is gone, or a continuation took its work item on
 * ({@link InstanceRow.continuedInto}): two sessions never work one item in
 * one workspace. The one decision for every revive: a relaunch or rewind
 * from the dashboard, the hub's wake for a send, and a relaunch on another
 * account at a limit.
 */
export type Relaunch =
  | { kind: "resume"; sessionKey: string }
  | { kind: "fresh" }
  | { kind: "refused"; reason: string };

/** Why a session whose work a continuation took on never runs again. */
export const continuedWords = (continuedInto: string): string =>
  `This session was continued in session ${continuedInto.slice(0, 8)}, which carries its work on; it doesn't run again. Write to ${continuedInto.slice(0, 8)}.`;

/**
 * Where a continued session's work went, as its page says it in its
 * composer's place (the words before the new session's title, a link to
 * it), and as the hub refuses a person's message to it: a moved
 * conversation points onward, it never takes a message on silently.
 */
export const CONTINUED_IN = "Continued in";

/** {@link CONTINUED_IN} with the new session's title, as one sentence. */
export const continuedInWords = (title: string): string =>
  `${CONTINUED_IN} ${title}`;

export const relaunchOf = (row: {
  continuedInto?: string | null;
  lastErrorKind?: LastErrorKind | null;
  sessionId: string | null;
}): Relaunch => {
  if (row.continuedInto) {
    return { kind: "refused", reason: continuedWords(row.continuedInto) };
  }
  if (row.lastErrorKind === "conversation-gone") {
    return { kind: "refused", reason: CLAUDE_CONVERSATION_GONE };
  }
  return row.sessionId
    ? { kind: "resume", sessionKey: row.sessionId }
    : { kind: "fresh" };
};

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
   * Whether the session may spawn delegates of its own — `false` on a leaf
   * delegate (spawned with `can_delegate: false`, the default). Null on a
   * session nobody delegated, which may.
   */
  canDelegate?: boolean | null;
  /**
   * The effort the operator chose for the session: its spawn's level, or the
   * last `setEffort` sent it. The hub starts every process of the session at
   * it, whatever brings it back; a reading never moves it. Null: nobody
   * chose, and the harness runs its model's default.
   */
  chosenEffort?: import("./harness").EffortLevel | null;
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
   * The effort the session actually sends, as its agent last read it back from
   * the harness ({@link import("./harness").EFFORT_READ}): a level, `none` when
   * it sends no effort, null until the first reading lands. What its chip
   * shows; never what a launch of it asks for ({@link chosenEffort}).
   */
  effort?: import("./harness").SessionEffort | null;
  /** Which harness owns {@link sessionId} — what a resume and a catalog read route on. */
  harness: import("./harness").HarnessKind;
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
  model?: string | null;
  /**
   * The account a person moved it to that it moves to at its next launch,
   * as the hub keeps it (its `owed_moves`), until the move lands: what it
   * waits on, its turn's end, the background work its process holds ending,
   * or its machine connected again. Absent when it owes none.
   */
  owedMove?: { accountId: string; waits: "turn" | "work" | "machine" };
  /**
   * The session that started this one (`delegate`, `start_session`, a
   * workflow's supervisor), which every rail nests it under; absent on a
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
  /**
   * The session is stopped at its account's limit (or on its refused
   * sign-in), in words, as the hub's at-limit controller holds it (hub
   * at-limit.ts `stall`): what happened and when it carries on; `until`,
   * epoch ms, the moment it does. Absent while it runs. Its row, its head and
   * its transcript show it as an error with the way out: another account
   * from its menu.
   */
  stalled?: { until?: number; words: string };
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
  /**
   * When its latest turn ended, on the hub's clock, as `seenAt` is: the
   * two together say whether it ended since the owner last looked. Null on
   * one whose turn never ended.
   */
  turnEndedAt?: string | number | Date | null;
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
  /**
   * While its landing waits between `finish_item` and its outcome (the
   * landing gate's shared machine slot, a machine's pause, its turn to land):
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
   * Its project's lead, a co-parent of the item, whose tray lists it beside
   * its parent's; null when the project has none, or the lead is its parent
   * or its own session.
   */
  leadInstanceId: string | null;
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
        /** The delegate's one-or-two-sentence outcome, when it finished with `finish_item`. */
        headline?: string;
        resultId?: string;
        completedAt?: string;
      };
    });

/** The three things a delegate and its parent ever say to each other. */
export type DelegateEventKind = DelegateEvent["kind"];

/** What each kind carries: the ask's own input, the answer, the turn's report. */
export type DelegateEventPayload = DelegateEvent["payload"];

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

/** What the hub records on a session whose daemon restarted out from under it, with nothing to go back to. */
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
  | import("./frames").FleetMcpFrame
  | import("./frames").FleetReportFrame
  | import("./frames").PreviewFrame
  | import("./frames").MessageFrame
  | import("./frames").SendFrame
  | import("./frames").RejectedFrame
  | import("./frames").HeldSendFrame
  | import("./frames").TakenSendFrame
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
  | import("./frames").PulseFrame
  | import("./frames").WorkItemFrame
  | import("./frames").ProjectOfferFrame
  | import("./frames").ThreadUpsertFrame
  | import("./frames").ThreadMessageFrame
  | import("./frames").TasksChangedFrame
  | import("./frames").DecisionsChangedFrame
  | import("./frames").BlocksChangedFrame
  | import("./starters").StartersChangedFrame
  | import("./frames").ProjectsChangedFrame
  /** Hub-originated: the hub restarts for an update now, and is back within a deadline. */
  | import("./frames").HubRestartFrame
  | import("./frames").FleetUpstreamFrame
  | import("./frames").TailnetHttpsFrame
  | import("./frames").FleetFetchFrame
  | import("./frames").ProjectCapFrame
  | import("./actions").ActionsFrame
  | import("./hub-auth").HubAuthFrame
  /** Hub-originated: every install and the draft, whole, on each change. */
  | import("./install").InstallsFrame
  | import("./frames").ProjectStopFrame
  | import("./frames").DelegateEventFrame
  /** Hub-originated: every open fleet-watch notice, whole, on each change. */
  | import("./fleet-watch").FleetWatchNoticesFrame
  /** Hub-originated: every artifact waiting on the person, and their notices, whole, on each change. */
  | import("./artifact-needs").ArtifactNeedsFrame
  /** Hub-originated: every law the hub caught broken, whole, on each break. */
  | import("./invariant").LawsBrokenFrame
  /** Hub-originated: the person's presence and the machines that count toward it. */
  | import("./notifications").PersonFrame
  /** Hub-originated: something that needs the person, shown on the desk tab they use. */
  | import("./notifications").DeskAlertFrame
  /** Hub-originated: every project move, whole, on each change. */
  | import("./move").MovesFrame
  /** Daemon-originated: how far a move's clone or large files are. */
  | import("./move").MoveProgressFrame
  /** Daemon-originated: a running command's wait for a shared machine slot. */
  | import("./harness").CommandQueueFrame
  /** Daemon-originated: a workspace's stage changed (live components). */
  | import("./stage").StageFrame
  /** Daemon-originated: a place's stage clone is cut and in step (live components). */
  | import("./stage").StageCloneFrame
  /** Daemon-originated: a borrowed sign-in near its expiry, asking for a fresh one. */
  | import("./accounts").AccountBorrowFrame
  /** Daemon-originated: the machine's runtime and every browser on it, whole, on each change. */
  | import("./browser").BrowserFrame
  /** Daemon-originated: a take-over the daemon ended itself (no view for two minutes, or the browser stopped). */
  | import("./browser").BrowserHandedBackFrame
  /** Hub-originated: every browser of the fleet, whole, on each change. */
  | import("./browser").BrowserListFrame
  /** Daemon-originated: the stream relay on the machine, whole, on each change. */
  | import("./stream-relay").RelayFrame
  /** Hub-originated: the stream relay's journey, whole, on each change. */
  | import("./stream-relay").RelayJourneyFrame
  /** Hub-originated workflow run transition (§7.2). */
  | import("./workflow").WorkflowFrame;

export const CAWCO_HUB_PORT = 3456;

/**
 * The dashboard's port on every computer's loopback, beside the hub's
 * (IANA lists 3455 as `prsvp`, a legacy RSVP encapsulation; no dev server
 * defaults to it, unlike 3000): `http://localhost:3455` is the dashboard on
 * the hub's computer, where the dashboard's socket listens on it, and on
 * every other computer running the agent, which carries it to the hub
 * (agent hub-loopback.ts). Loopback is a secure context, so its previews run
 * in a process of their own.
 */
export const CAWCO_LOCAL_DASHBOARD_PORT = 3455;

/**
 * A preview's start page: a path on the previewed server, one leading slash
 * (never `//host`, which would leave it), no whitespace.
 */
export const PREVIEW_START_PATH = /^\/(?!\/)\S*$/;

/**
 * What an artifact shows (Projects spec §5.10): a dev server or a folder on
 * the session's machine (a preview), or a page the hub built and keeps under
 * its data dir at `artifacts/<id>/` and serves itself, named by the page's
 * name. A dev server or folder may name `path`, the page inside it the
 * preview opens at (`/motion/updates`); the root when absent.
 */
export type PreviewSource =
  | {
      port: number;
      path?: string;
      /**
       * A sheet's: the workspace's stage serves the port (core `stage.ts`),
       * its toolchain root `dir` from the clone's root and the sheet's story file
       * `file` from that root. A request for it wakes the stage when it sleeps.
       */
      stage?: { dir: string; file: string };
      /**
       * A workspace preview's server (core `stage.ts` {@link ServeSpec}): the
       * command the workspace's stage runs and keeps up on `port`, in `cwd`
       * from the clone's root. A request for it wakes it when it sleeps.
       */
      serve?: { command: string; cwd: string };
      /** The workspace whose dev server it is: it runs in that workspace's own network. */
      workspace?: string;
    }
  | { dir: string; path?: string }
  | { page: string };

/**
 * The kinds of artifact (WORDS.md): HTML the agent wrote, a drawing, a dev
 * server or folder shown live, a sheet: a story file's stories, each a
 * real component mounted by the project's own toolchain (core `stage.ts`),
 * and the project's browser, listed for every session of the project (or of
 * the machine, for the machine's browser). A browser's source is its key as
 * a page (`{ page: "project:<id>" }`): the hub holds it, no machine's
 * preview listener serves it, and every installed app reads that shape.
 */
export type ArtifactKind =
  "page" | "canvas" | "preview" | "component" | "browser";

/** An artifact's name: lowercase letters, digits and dashes, like `onboarding`. */
export const ARTIFACT_NAME = /^[a-z0-9][a-z0-9-]{0,62}$/;

/** What the person does on an artifact: the reason it is in their panel. */
export const ARTIFACT_DOES = ["pick", "judge", "try", "draw"] as const;
export type ArtifactDoes = (typeof ARTIFACT_DOES)[number];
/** The ask's length: one line in the panel's head. */
export const ASK_LIMIT = 160;
/** Words the owner banned from anything that reaches him. */
export const ASK_BANNED = /\b(tap|poke)(s|ped|ping)?\b/i;
/** A path or a file in the ask: the person's words carry neither. */
export const ASK_PATHLIKE =
  /(^|[\s(])[\w.-]*\/[\w.-]+\.[a-z]{1,5}\b|\b[\w-]+\.(svelte|tsx?|png|webp|jpe?g|oui|html)\b/i;
/** Desk captures one page for judging or picking may hold: past it, the page is a catalogue of pictures drawn at a fraction of their size in the panel. */
export const DESK_CAPTURES_PER_PAGE = 2;
/** A capture wider than this many pixels is a desk capture: the panel is 600px beside the transcript, 390px on a phone. */
export const DESK_CAPTURE_WIDTH = 1600;

/** One artifact as the panel's list shows it, newest first. */
export interface ArtifactSummary {
  /** The one line the panel's head shows under its name: what the person does here, in their words. Empty on one made before asks were kept. */
  ask: string;
  createdAt: string;
  /** What the person does on it. */
  does: ArtifactDoes;
  id: string;
  kind: ArtifactKind;
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
  harness: import("./harness").HarnessKind;
}

/** An artifact's promote: the project folder's commit that holds it, and when. */
export interface ArtifactPromotion {
  at: string;
  commit: string;
}

/**
 * A preview whose page nothing serves: the hop that did not answer, as the
 * proxy's own page names it in a `<meta name="cawco-preview-down">` (core
 * `preview-proxy` `downResponse`), so the pane beside the conversation can
 * draw what happened instead of the proxy's page. `server`: the dev server
 * on the session's machine is not answering its port. `machine`: the
 * machine's preview listener is not answering the hub, or the machine is
 * away. `workspace`: the port is a workspace's, and no boundary of that
 * workspace runs, so nothing in its network can answer. `reach`: the
 * machine could not open the way to the server (its listener did not start,
 * or the bridge into the workspace's network did not open); the page names
 * why in {@link PREVIEW_WHY_META}. `closed`: the session shows no preview
 * now (it was closed, or the session ended).
 */
export type PreviewDown =
  "server" | "machine" | "workspace" | "reach" | "closed";
export const PREVIEW_DOWN_META = "cawco-preview-down";
/** The machine's own words for a `reach` failure, on the proxy's page beside {@link PREVIEW_DOWN_META}. */
export const PREVIEW_WHY_META = "cawco-preview-why";

/**
 * Why a view could not put an artifact on screen, as it tells the hub
 * (`POST /api/instances/:id/artifacts/:artifact/shown`): a hop that did not
 * answer ({@link PreviewDown}), or `page`: something answered, but with no
 * page the panel can show (no CawCo overlay said it was ready).
 */
export const SHOWN_FAILURES = [
  "server",
  "machine",
  "workspace",
  "reach",
  "closed",
  "page",
] as const;
export type ShownFailure = (typeof SHOWN_FAILURES)[number];

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
/** The daemon's control method that weighs a folder preview's folder on its machine (core preview-proxy `folderWeight`). */
export const PREVIEW_WEIGHT = "previewWeight";

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
  /**
   * The ports the hub's preview listeners take, `first-last` (default: the
   * hundred after the hub's own port): one per session whose preview or
   * canvas is in use, so each preview is an origin of its own; in host mode
   * the first one routes every preview by its Host.
   */
  previewPorts: "CAWCO_PREVIEW_PORTS",
  machineId: "CAWCO_MACHINE_ID",
  /** `1` stops the hub advertising itself over mDNS. */
  noMdns: "CAWCO_NO_MDNS",
  /**
   * `1` turns on the hub's debug log lines: per-frame traces a production
   * log should not carry: routines.ts's run sessions' frames, suggest.ts's
   * and meaning.ts's per-call Jev lines, git-remote.ts's per-object LFS
   * lines. Scratch fleets run their hub with it on.
   */
  debug: "CAWCO_DEBUG",
  /**
   * Overrides the socket `sessiondEndpoint()` derives — the daemon listens on
   * it and every client dials it, so both ends must read the same variable.
   */
  sessiondEndpoint: "CAWCO_SESSIOND_ENDPOINT",
  /** Where the links the hub hands out point. */
  dashboardUrl: "CAWCO_DASHBOARD_URL",
  /**
   * The port the dashboard's socket listens on, as the installer wrote it
   * into the hub's unit: the hub's preview ports never take it, and the
   * hub's composed links point at it.
   */
  dashboardPort: "CAWCO_DASHBOARD_PORT",
  /** The dashboard's loopback port on every computer ({@link localDashboardPort}). */
  localDashboardPort: "CAWCO_LOCAL_DASHBOARD_PORT",
  /** The loopback port the hub's relay receiver listens on (default: one the OS picks free). */
  relayPort: "CAWCO_RELAY_PORT",
  /**
   * Days a project's fact line may go unused (no brief admitted it, no note
   * corroborated it) before the curator's run proposes moving it to
   * `knowledge/archive/` (hub memory.ts). Default in hub config.ts.
   */
  memoryArchiveDays: "CAWCO_MEMORY_ARCHIVE_DAYS",
  /**
   * A knowledge file's budget in characters: what one brief carries of it,
   * and the size at which the curator's run is asked to fold it (hub
   * memory.ts). Default in hub config.ts.
   */
  memoryFileChars: "CAWCO_MEMORY_FILE_CHARS",
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
  /**
   * The port of the agent's DevTools gate (browser.ts `browserGatePort`).
   * Unset on every installed machine; a second agent on one host (a rig, a
   * scratch fleet) names its own.
   */
  browserGatePort: "CAWCO_BROWSER_GATE_PORT",
  /**
   * The stream relay journey's stand-ins (hub relay-journey.ts, agent
   * browser/relay.ts), each unset on every installed machine; a scratch
   * fleet names its own so no request leaves the machine: Cloudflare's API
   * origin (`https://api.cloudflare.com/client/v4`), the page listing
   * Cloudflare's IPv4 ranges, the DNS server the name check asks
   * (`host:port`) in place of the system's, the STUN server the agent asks
   * for its router's address, and the router the agent maps ports on: the
   * UPnP gateway's descriptor URL in place of the one SSDP finds, and the
   * NAT-PMP gateway's address in place of the default route's. Either set,
   * the agent asks only the gateways named.
   */
  cloudflareApi: "CAWCO_CLOUDFLARE_API",
  cloudflareIps: "CAWCO_CLOUDFLARE_IPS",
  natPmpGateway: "CAWCO_NAT_PMP_GATEWAY",
  relayDns: "CAWCO_RELAY_DNS",
  stunServer: "CAWCO_STUN_SERVER",
  upnpGateway: "CAWCO_UPNP_GATEWAY",
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
 * The dashboard's loopback port: `CAWCO_LOCAL_DASHBOARD_PORT`, else
 * {@link CAWCO_LOCAL_DASHBOARD_PORT}. The hub names it to every agent in its
 * register answer, and the installer listens on it with the dashboard's
 * socket on the hub's computer; both read it here.
 */
export const localDashboardPort = (): number => {
  const named = readEnv(CAWCO_ENV.localDashboardPort);
  const port = named === undefined ? CAWCO_LOCAL_DASHBOARD_PORT : Number(named);
  if (!(Number.isInteger(port) && port > 0 && port < 65_536)) {
    throw new Error(
      `${CAWCO_ENV.localDashboardPort} must be a port number, not "${named}"`
    );
  }
  return port;
};

/**
 * The mDNS service the hub advertises and `cawco` browses for.
 */
export const CAWCO_MDNS_TYPE = "cawco";
export * from "./image-generation";
// The words the dashboard and the native app share (Words.generated.swift).
export * from "./words/accounts";
export * from "./words/artifacts";
export * from "./words/blocks";
export * from "./words/catalog";
export * from "./words/caw-head";
export * from "./words/configure";
export * from "./words/connection";
export * from "./words/connections";
export * from "./words/decisions";
export * from "./words/delegate-types";
export * from "./words/helpers";
export * from "./words/lfs";
export * from "./words/made";
export * from "./words/mcp";
export * from "./words/memory";
export * from "./words/offers";
export * from "./words/pairing";
export * from "./words/place";
export * from "./words/plan";
export * from "./words/presence";
export * from "./words/preview";
export * from "./words/routines";
export * from "./words/sheet";
export * from "./words/side";
export * from "./words/sidebar";
export * from "./words/skills";
export * from "./words/spend";
export * from "./words/tailnet";
export * from "./words/views";
export * from "./workflow";
export * from "./workflow-compile";

/** Pushed by the hub to an online machine when the fleet's update policy changes. */
export const CONFIGURE_BINARY_UPDATES = "configureBinaryUpdates";

/** Returns a machine that is waiting to install back to `available`: the person changed their mind. */
export const CANCEL_BINARY_UPDATE = "cancelBinaryUpdate";
