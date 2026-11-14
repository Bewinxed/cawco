/** Named frame shapes keep schema and generated-client names independent of union order. */

import type { AccountBorrowFrame } from "./accounts";
import type { ActionsFrame } from "./actions";
import type { ArtifactKind } from "./artifact-kinds";
import type { ArtifactNeedsFrame } from "./artifact-needs";
import type { AskAnswer, SourceFacts } from "./asks";
import type {
  BrowserFrame,
  BrowserHandedBackFrame,
  BrowserKey,
  BrowserListFrame,
  ListedBrowser,
} from "./browser";
import type { CommandQueueFrame, CutCommand } from "./commands/controls";
import type {
  FleetConvergeFrame,
  FleetPlugin,
  FleetSkillMeta,
  FleetSyncReport,
  MarketplaceLink,
  MarketplaceRead,
} from "./fleet";
import type { FleetMcpServerView } from "./fleet-secrets";
import type { FleetWatchNoticesFrame } from "./fleet-watch";
import type { HarnessKind } from "./harness/kinds";
import type { HubAuthFrame } from "./hub-auth";
import type { InstallsFrame } from "./install";
import type { LawsBrokenFrame } from "./invariant";
import type { MoveJob, MoveProgressFrame, MovesFrame } from "./move";
import type { DeskAlertFrame, PersonFrame } from "./notifications";
import type { PermissionPresentation } from "./permission-presentation";
import type { PreviewDown, PreviewSource } from "./preview/protocol";
import type { PreviewSettings } from "./preview/routes";
import type {
  AgentRow,
  BuildInfo,
  ContinuationJob,
  DelegateEvent,
  InstanceRow,
  SessionPulse,
  StoredFrame,
  Verb,
  WorkItemSummary,
} from "./protocol";
import type { LastErrorKind } from "./relaunch";
import type { ModeAsk, NeutralMessage, SendRecord } from "./session-messages";
import type { StageCloneFrame, StageFrame, StageState } from "./stage";
import type { StartersChangedFrame } from "./starters";
import type { RelayFrame, RelayJourneyFrame } from "./stream-relay";
import type { TailnetHttps, TailnetOrigin } from "./tailnet-https";
import type { AccountLimits, MachineGoLimits, UsageSpend } from "./usage/types";

interface FleetMcpFrame {
  kind: "fleet_mcp";
  servers: FleetMcpServerView[];
}

/**
 * Machine-originated: the machine's fleet report (what `fleetStatus`
 * answers), sent unasked when a harness's reading of a fleet MCP server moved
 * with no fleet change: a server OpenCode held failed connected when CawCo
 * started it again. The hub keeps it as `agents.fleet`, as it keeps a sync's.
 */
export interface FleetReportFrame {
  /** The generation whose converge has ended on the machine (core `FleetAck`). */
  convergedGeneration: number;
  /**
   * The generation of the fleet's desired state the converge that wrote it
   * reached: the fleet MCP changes the deltas up to it carried are the
   * sessions' to take now. Null for a report read again unasked, which
   * landed no delta.
   */
  generation: number | null;
  instanceId?: undefined;
  kind: "fleet_report";
  report: FleetSyncReport;
}

export interface PreviewFrame {
  /**
   * The artifact the session's panel shows (Projects spec §5.10), with its
   * title, the head's name, and its ask, the head's line under it, from the
   * first frame, while its page is still on its way. `name` is its slug,
   * never shown; no ask on one made before asks were kept.
   */
  artifact: {
    ask?: string;
    id: string;
    kind: ArtifactKind;
    name: string;
    title: string;
  };
  /**
   * Every artifact the session holds, by id, newest first: republished when
   * one is removed, so a panel's open list drops it at once.
   */
  artifacts?: string[];
  instanceId: string;
  kind: "preview";
  /**
   * Host mode's whole origin for the session (`scheme://name[:port]` from
   * the fleet's pattern, whose scheme is how those names are served, not how
   * the client reached the hub), beside `port` ({@link PreviewAddress}).
   */
  origin?: string;
  /**
   * The session's own preview port, listened on in either mode: a client
   * that reached the hub by any address but one under host mode's domain
   * loads the preview from it ({@link previewRoute}).
   */
  port?: number;
  /**
   * The project whose origin serves what the panel shows: a project's page
   * (Projects spec §5.8), served on its project's origin alone, at
   * `/__cawco/page/<artifact id>/` there ({@link projectPagePlace}). Then
   * `port`, `origin` and `tailnet` are that origin's. Absent for
   * anything served on the session's own origin.
   */
  project?: string;
  /** Identifies one successful open, including a rebuild of the same source. */
  revision: string;
  /**
   * Identifies the show: new with each show of an artifact (artifact_show,
   * artifact_create, the person's own open), kept while that show is only
   * published anew at a new `revision` (an update's re-show, the preview
   * mode set again). A tab's Close holds until it moves (dashboard
   * preview/closed-here.ts).
   */
  show: string;
  source?: PreviewSource;
  /**
   * A sheet's stage, or a workspace preview's server (`serve`), as its doc
   * keeps it (`meta.stage`), the frame published
   * again at the same revision on each change: for a panel that holds no doc
   * of its own (the app's), as the dashboard's pane reads it from the doc.
   */
  stage?: StageState;
  state: "open" | "closed";
  /** The session's origin on the tailnet name while the hub serves HTTPS there ({@link PreviewAddress}). */
  tailnet?: TailnetOrigin;
}

/**
 * Everything that tab reads of its session, whole, on open and again on
 * every change of it.
 */
export interface ArtifactSessionFrame {
  /**
   * The session's open browser ask for the browser its panel shows (its
   * artifact or its key), whole as it parks and gone as it settles: the tab
   * alone carries its reason. Null while none is open.
   */
  ask: { browserAsk: BrowserAskFrame; requestId: string } | null;
  /**
   * The browser the session's panel shows, as the hub lists it, whole on
   * each change of it: null while the panel shows no browser, or its machine
   * has reported none for that key.
   */
  browser: ListedBrowser | null;
  /** Every machine of the fleet: the session's own is named in the pane's states, and a page's place picker offers the online ones. */
  machines: {
    hostname: string;
    machineId: string;
    online: boolean;
    os: string;
  }[];
  /** The session's panel, open; null while it shows nothing. */
  preview: PreviewFrame | null;
  /** The session's row; null once the hub lists it no more. */
  session: {
    cwd: string;
    id: string;
    machineId: string;
    projectId: string | null;
    title: string | null;
  } | null;
  type: "artifact.session";
  /** The session is in a turn, its delegates' included: a pin its last send carried shows it live. */
  working: boolean;
}

interface MessageFrame {
  harness: HarnessKind;
  instanceId: string;
  keepAlive?: true;
  kind: "frame";
  message: NeutralMessage;
}

interface SendFrame {
  instanceId: string;
  keepAlive?: true;
  /** Hub-originated: a send's record, as it stands after its latest change. */
  kind: "send";
  record: SendRecord;
}

/**
 * Daemon-originated: a send the machine was handed and no process took: it
 * found no live process for its session, or the process it was handed to went
 * away (slept, exited, failed, relaunched, refused by the session keeper)
 * before reading it. Whole, as it was sent, under the hand-off it was given
 * (`SendPayload.delivery`); the hub owes it to the session's next process.
 */
interface HeldSendFrame {
  instanceId: string;
  kind: "held_send";
  send: import("./protocol").SendPayload;
}

/**
 * Daemon-originated: a send handed over again that its session has taken
 * already (agent taken-sends.ts). No turn started on it; its record is read,
 * and no turn follows that read.
 */
interface TakenSendFrame {
  instanceId: string;
  kind: "taken_send";
  uuid: string;
}

interface RejectedFrame {
  error: string;
  instanceId: string;
  /** Daemon-originated: one send did not go; its record fails and the session goes on. */
  kind: "rejected";
  uuid: string;
}

interface InstancesFrame {
  agents: AgentRow[];
  continuations: ContinuationJob[];
  /**
   * The ids sessions had before the hub folded each one's continuations
   * into it (a continuation anything but the person's own Continue asked
   * for, and those of hubs before migration 0128): former id → its id now. A
   * tab or link that names a former id is that session.
   */
  formerIds: Record<string, string>;
  handoffs: Record<string, { from: string; at: number }>;
  hubBuild: BuildInfo;
  /**
   * This hub's run, one value per hub start: the numbering every stream on
   * this socket counts in. A newest transcript page names the run its `seq`
   * came from (`TranscriptPage.hubRun`); a page of this run resumes its
   * stream here from that `seq`, and one of another run is read again.
   */
  hubRun: string;
  instances: InstanceRow[];
  /** Hub-originated: the complete board on every connection, including reconnects. */
  kind: "instances";
  /** Every project move the hub is carrying; each change after this arrives on the `moves` frame. */
  moves: MoveJob[];
  /**
   * The hub's notices record, when it found it damaged at start: notices
   * are off and `noticesSeen` is not a record of anything until it is reset
   * (hub notices.ts). Null when the record reads whole.
   */
  noticesDamaged?: import("./protocol").DamagedHubRecord | null;
  /** The notice ids a person acknowledged, on any tab or device (hub notices.ts). */
  noticesSeen: string[];
  /**
   * The fleet's preview mode (Settings › Previews): a switch moves every
   * preview origin, so a decision page loaded before it loads again, its
   * embeds at their new origins.
   */
  previewSettings: PreviewSettings;
  previews?: PreviewFrame[];
  protocol: number;
  pulses: Record<string, SessionPulse>;
}

interface InstancesDeltaFrame {
  /** Changed machines only; omitted when no machine moved. */
  agents?: AgentRow[];
  continuations?: ContinuationJob[];
  /** Present when it moved: every former id, by its id now ({@link InstancesFrame.formerIds}), whole. */
  formerIds?: Record<string, string>;
  handoffs?: Record<string, { from: string; at: number }>;
  /** Hub-originated: only changed rows and metadata; pulses travel separately. */
  kind: "instances_delta";
  /** Present when it moved: the damaged notices record, or null once it is reset. */
  noticesDamaged?: import("./protocol").DamagedHubRecord | null;
  noticesSeen?: string[];
  /** Present when it moved: the fleet's preview mode ({@link InstancesFrame.previewSettings}). */
  previewSettings?: PreviewSettings;
  previews?: PreviewFrame[];
  removed: string[];
  removedAgents?: string[];
  upserts: InstanceRow[];
}

/**
 * A browser ask (Projects spec §5.11): a session asks the person to take
 * over its project's browser, with one sentence of reason and the page's
 * origin. It parks as a `permission_request` for {@link BROWSER_ASK_TOOL}
 * carrying this beside the tool's input, so it lands in Needs you, the
 * transcript and push as every ask does. Take over answers it as taken
 * (`POST /api/browsers/:key/takeover`, an Approve from an app that has no
 * Take over yet); Decline denies it with the person's words. The tool's
 * call waits on until the person hands back.
 */
export interface BrowserAskFrame {
  /** The browser artifact in the asking session's panel: Take over opens the panel on it. */
  artifactId: string;
  key: BrowserKey;
  /** The machine the browser runs on: the asking session's. */
  machineId: string;
  /** The page's origin the agent named, `scheme://host[:port]`. */
  origin: string;
  /** One sentence: what the person is needed for. */
  reason: string;
}

/**
 * The access a sign-in may ask of its provider: what its scopes let an agent
 * do there. `read` is the server's read scopes alone; `write`, every scope it
 * names.
 */
export type ConnectAccess = "read" | "write";

/** One access a connect ask offers, and the provider's scopes it asks for. */
export interface ConnectAccessSet {
  access: ConnectAccess;
  scopes: string[];
}

/**
 * A connect ask: a session asks the person to sign the hub in to one of the
 * fleet's MCP servers that signs in with OAuth (Configure › MCP), so the
 * session gets its tools. It parks as a `permission_request` for
 * {@link CONNECT_ASK_TOOL} carrying this beside the tool's input. Connect
 * starts the hub's sign-in (`POST /api/fleet/mcp/:name/sign-in` with its
 * `requestId` and `access`) in a tab of its own; the hub keeps the
 * credential, and its sign-in landing answers the call. Not now declines it.
 *
 * It stands as a card in the session's transcript at the call that asked
 * it, and that card becomes the call's record once it is answered.
 */
export interface ConnectAskFrame {
  /**
   * The access Connect asks the provider for: the one the agent named, a
   * reconnect's held from the sign-in that ended, or the server's one; null
   * for a server that names no scopes.
   */
  access: ConnectAccess | null;
  /** Asked again: the server's sign-in ended (`auth.ended`), its access held. */
  again: boolean;
  /** One sentence: why the session needs it. */
  reason: string;
  /** The fleet MCP server, as Configure › MCP names it. */
  server: string;
  /** The provider's sign-in address (its authorization endpoint), shown whole before anything opens. */
  url: string;
}

/** What a connect ask's call is answered with. */
export type ConnectAnswer =
  | {
      outcome: "connected";
      server: string;
      /** As whom the provider signed the hub in, when it said. */
      as: string | null;
      /** The access the sign-in was made with, when it was known. */
      access: ConnectAccess | null;
    }
  | { outcome: "declined"; server: string; words: string };

export interface PermissionRequestFrame {
  /** The hub's own ask this frame stands for (core asks.ts), absent on a session process's own prompt. */
  askId?: string;
  /** A browser ask's browser, reason and origin; absent on every other ask. */
  browserAsk?: BrowserAskFrame;
  /** A connect ask's server, reason, address and access; absent on every other ask. */
  connectAsk?: ConnectAskFrame;
  harness: HarnessKind;
  input: Record<string, unknown>;
  instanceId: string;
  kind: "permission_request";
  /**
   * The session whose conversation made this ask, when the ask is not
   * parked on that session's own row (a memory curator run's proposal,
   * parked under its own id on machine "hub"). The ask is drawn and answered
   * in that session's pane, at `toolUseId`, as its own asks are.
   */
  originInstanceId?: string;
  /**
   * What the ask says on every surface, read once by the hub as it parks it
   * (permission-presentation.ts): the daemon's leg does not carry it, and the
   * hub fills it before anything else reads the frame.
   */
  presentation: PermissionPresentation;
  /** The launch that raised this request; daemon replays retain it verbatim. */
  processGeneration?: string;
  /** When the hub first parked this ask, ms epoch. Absent only on the daemon-to-hub leg. */
  raisedAt?: number;
  requestId: string;
  /** `tool` for a permission, `question` for an AskUserQuestion-shaped prompt. */
  requestKind?: "tool" | "question";
  /** `parent` when the ask is left to the session's parent, not the person. */
  routedTo?: "parent";
  /** Where an install the ask proposes fetches from (hub source-facts.ts). */
  sourceFacts?: SourceFacts;
  /**
   * The harness's own suggested permission updates (Claude's
   * `PermissionUpdate[]`), held as the provider's: passed through whole and
   * never enumerated here, so a destination, type or mode a later release adds
   * cannot make the hub refuse the ask. A reader narrows where it reads.
   */
  suggestions?: unknown[];
  toolName: string;
  /** The tool call the ask gates, as its transcript message names it. */
  toolUseId?: string;
}

/** A parked ask as the hub holds it and every screen reads it (`/api/pending`): an `Envelope` whose payload is its permission request. */
export interface ParkedAsk {
  instanceId?: string;
  machineId: string;
  payload: PermissionRequestFrame;
  requestId?: string;
  verb: Verb;
}

/**
 * A permission request as a daemon sends it to the hub: what the hub stamps
 * as it parks the ask (`presentation`, `raisedAt`) is not on it yet.
 */
export type DaemonPermissionRequestFrame = Omit<
  PermissionRequestFrame,
  "presentation" | "raisedAt"
>;

interface PermissionSettledFrame {
  /** What won, and where, when the ask was answered (`outcome: answered`) and the hub knows. */
  answer?: AskAnswer;
  instanceId: string;
  /** An ask is over, whoever settled it; every client removes its parked card. */
  kind: "permission_settled";
  outcome?: "answered" | "cancelled";
  /**
   * A cancelled ask's process ended with it open: nobody answered it, and the
   * hub keeps a permission prompt for the session's next process (hub asks.ts
   * `keep`) instead of taking it off every screen.
   */
  processEnded?: boolean;
  processGeneration?: string;
  /**
   * Why a cancelled ask went unanswered, when the hub could say: it could not
   * show it at all (an ask from a session or launch it holds no live row for).
   * Such an ask was never parked on any screen, so this frame is the only
   * word a transcript gets of it.
   */
  reason?: string;
  requestId: string;
  /** The asking tool, for the line a screen writes about an ask it never held. */
  toolName?: string;
}

interface UsageFrame {
  /** Hub-originated: every Claude account's own limits, every machine's Go plan, and the fleet's spend. */
  claude: AccountLimits[];
  kind: "usage";
  openCodeGo: MachineGoLimits[];
  spend: UsageSpend;
}

interface StoppedFrame {
  discard: boolean;
  /** Positive server-session receipt; absent receipts cannot confirm OpenCode. */
  ended?: {
    harness: HarnessKind;
    sessionId?: string;
    resourcesClosed: true;
    reason?: string;
  };
  instanceId: string;
  /** Authoritative daemon confirmation, never merely delivery of a stop request. */
  kind: "stopped";
}

export interface AsleepFrame {
  /**
   * Its process died on a signal while the daemon ran it, and nothing of the
   * daemon's stopped it (an OOM kill, a sessiond restart, a stray `kill`):
   * the signal, and the harness's own words. The hub starts it again with
   * the turn it cut, unless it died so right after the last such start.
   */
  died?: { cut?: CutCommand[]; error: string; signal: string };
  instanceId: string;
  /** The daemon stopped an at-rest session's processes, or one ended of its own accord; its next message wakes it. */
  kind: "asleep";
}

interface RecoveryUnavailableFrame {
  instanceId: string;
  /** Recovery found no live handle; stored conversations remain resumable. */
  kind: "recovery_unavailable";
  reason: string;
}

/**
 * A machine's stored transcripts moved (agent catalog-index.ts): the
 * sessions whose files were written, added or removed since the last such
 * frame. The hub reads the machine's catalog again only when one of them may
 * stand in Recent (hub stored-recent.ts).
 */
export interface CatalogMovedFrame {
  instanceId?: undefined;
  kind: "catalog_moved";
  sessions: string[];
}

/** A harness whose `listSessions` did not answer within its bound: left out of the listing, not read as having none. */
export interface HarnessUnanswered {
  /** The milliseconds it was given. */
  after: number;
  harness: HarnessKind;
}

/** A harness whose `listSessions` refused (threw): left out of the listing with its error, not read as having none. */
export interface HarnessFailed {
  error: string;
  harness: HarnessKind;
}

/**
 * Why a machine's agent refused a control call or an `fs` request, typed
 * where it refused it: `not-running`, the agent runs no process for the
 * session (a session asleep, ended, or not this machine's); `missing`, the
 * path an `fs` request names is not there (its error's `ENOENT`);
 * `unknown`, any other refusal, its message as it was said.
 */
export type ControlRefusal =
  | { kind: "not-running"; message: string }
  | { kind: "missing"; message: string }
  | {
      kind: "unknown";
      message: string;
      /** A preview's start the machine refused: the hop that is down (core preview/protocol.ts `PreviewStartDown`). A daemon from before it said one says it in its words alone (preview proxy.ts `startRefused`). */
      down?: PreviewDown;
    };

export interface ControlResultFrame {
  /** A refusal's words, as said; {@link refusal} is what a reader decides on. */
  error?: string;
  /** `listSessions` only, and only when some harness's listing threw: those harnesses, whose sessions `result` leaves out. */
  failed?: HarnessFailed[];
  instanceId?: string;
  /** No `instanceId` when the call it answers was machine-scoped. */
  kind: "control_result";
  ok: boolean;
  /** Why the machine's agent refused the call, typed; absent on an answer, and on a refusal the hub made itself. */
  refusal?: ControlRefusal;
  requestId: string;
  result?: unknown;
  /** `listSessions` only, and only when some harness did not list in time: those harnesses, whose sessions `result` leaves out. */
  unanswered?: HarnessUnanswered[];
}

export interface ErrorFrame {
  /** Internal end-reconciliation evidence; never relayed to a client. */
  endReason?: string;
  instanceId?: string;
  /** Hub-originated routing failures (e.g. target machine offline). */
  kind: "error";
  /** A failed session's typed kind, when what failed typed it (core `KindedError`); `message` is its words. */
  lastErrorKind?: LastErrorKind;
  message: string;
  /** A start that found no permission mode to start its session on: the page asks for one (core `ModeAsk`); `message` is never shown where this is read. */
  modeAsk?: ModeAsk;
  requestId?: string;
  verb?: Verb;
}

interface SessionAddressFrame {
  instanceId: string;
  kind: "session_address";
  processGeneration: string;
  sessionId: string;
}

interface ScratchWorktreeFrame {
  instanceId: string;
  kind: "scratch_worktree";
  processGeneration: string;
  worktree: import("./protocol").ScratchWorktree;
}

interface PulseFrame {
  instanceId: string;
  /** Daemon-originated: a session's coarse now-state, throttled to about once per second. */
  kind: "pulse";
  pulse: SessionPulse;
}

interface WorkItemFrame {
  instanceId: string;
  item: WorkItemSummary;
  /** Hub-originated: a delegate work item's state; `instanceId` is its parent's. */
  kind: "work_item";
}

/**
 * What made the hub offer to make a plain session a project (project-offers.ts);
 * `caw` when nothing did: Caw proposed it in conversation and you said yes.
 */
export type ProjectOfferReason = "delegates" | "days" | "plan" | "repo" | "caw";

/** "Make this a project": offered once, on a plain session that outgrew itself. */
export interface ProjectOfferSummary {
  instanceId: string;
  /** One sentence naming why, ending in the question. */
  line: string;
  offeredAt: number;
  reason: ProjectOfferReason;
}

// What "Create project" on an offer did (hub project-offers.ts): the
// project, and the plan items it filed as proposed tasks. `AcceptResult` is
// the OpenAPI schema's name, which the app's client is generated from, and
// a doc comment here would become that schema's description.
export interface AcceptResult {
  /** A new project's conversation, which sets it up; none when the folder joined one, or it could not start. */
  conversation?: string;
  /** True when the session's folder joined a project that already had its repository. */
  joined: boolean;
  project: { id: string; name: string };
  /** The sessions moved into it: this one, then its delegates. */
  sessions: string[];
  /** Plan items filed as proposed tasks, and the ones the project refused. */
  tasks: { id: string; title: string }[];
  unfiled: { title: string; why: string }[];
}

/** What "Create project" on an offer did, as the dashboard names it. */
export type ProjectOfferAccepted = AcceptResult;

interface ProjectOfferFrame {
  instanceId: string;
  /** Hub-originated: the session's standing offer, or null once it was answered. */
  kind: "project_offer";
  offer: ProjectOfferSummary | null;
}

export interface ProjectCapFrame {
  /** Its project's cap as it stands now; null once it has none. */
  cap: import("./areas").ProjectCap | null;
  instanceId?: undefined;
  /** Hub-originated: a project's spend against its cap moved, or the cap did. */
  kind: "project.cap";
  projectId: string;
}

/**
 * Hub-originated: one session a project's forget asked to stop
 * (`POST /api/projects/:id/stop`) has stopped, as its machine confirmed, or
 * could not be stopped, with the hub's reason, or (`deferred`) its machine is
 * away: its stop is recorded and is carried out when the machine registers
 * again. Never sent `stopped` for the request itself: a session is stopped
 * only once its machine says so.
 */
export interface ProjectStopFrame {
  /** Why it could not be stopped (`failed` only). */
  error?: string;
  instanceId: string;
  kind: "project.stop";
  outcome: "stopped" | "failed" | "deferred";
  projectId: string;
}

/**
 * Hub-originated: the hub is about to restart for an update, or no longer
 * is. Sent to every dashboard the moment its own machine says it is
 * installing (binary-update.ts `#tellHub`, before the helper restarts it),
 * to each that connects while it does, and with `restart: null` when the
 * install ends without restarting it. `withinMs` is relative, so no two
 * clocks are compared: the dashboard makes it a deadline on its own, and
 * reads the hub as on its way back, not unreachable, until it passes.
 */
export interface HubRestartFrame {
  instanceId?: undefined;
  kind: "hub.restart";
  restart: {
    reason: "update";
    /** The build it restarts onto, when the machine named one. */
    version: string | null;
    /** How long from now it answers again, or the build before it does: the update's trial (UPDATE_TRIAL_MS). */
    withinMs: number;
  } | null;
}

interface ProjectsChangedFrame {
  instanceId?: undefined;
  /**
   * Hub-originated: the projects changed (one was made or forgotten, or a
   * place was added or removed: a checkout joined, a delegate's workspace
   * opened or was archived): read `/api/projects` again.
   */
  kind: "projects.changed";
}

/**
 * Hub-originated: HTTPS on the hub machine's tailnet name changed state (hub
 * tailnet-https.ts): a step came to need the person, they took it, or the
 * name began or stopped answering. Every dashboard takes it at once, so its
 * onboarding row in Needs you shows the step that stands, or ticks.
 */
interface TailnetHttpsFrame {
  instanceId?: undefined;
  kind: "tailnet.https";
  tailnet: TailnetHttps;
}

/**
 * Hub-originated: a download at the hub began (`fetching`) or landed. A fetch
 * runs after the request that asked for it has answered, so this is how
 * every dashboard learns what came of it. Exactly one of the four is set:
 * - `skill`, `plugin`: a fetch of a fleet row's files, the row whole as
 *   `/api/fleet` reads it (files, or the sentence it failed with);
 * - `marketplace`: a read of a marketplace source (its name and offers);
 * - `link`: a link of a marketplace source, linked or refused.
 */
export interface FleetFetchFrame {
  /**
   * The check of every skill's and plugin's source for what it holds now:
   * under way, or done (each row it read came as its own frame).
   */
  check?: { fetching: boolean };
  instanceId?: undefined;
  kind: "fleet.fetch";
  link?: MarketplaceLink;
  marketplace?: MarketplaceRead;
  plugin?: FleetPlugin;
  /**
   * The row was removed while it was fetched; its `error` says so. With
   * `link`: a refused link was let go, and leaves the list.
   */
  removed?: boolean;
  skill?: FleetSkillMeta;
}

interface TasksChangedFrame {
  instanceId?: undefined;
  /**
   * Hub-originated: a project's tasks changed (one was created or moved, or
   * its folder was written), by anyone: read them again.
   */
  kind: "tasks.changed";
  projectId: string;
  /**
   * The one task that changed, when the change named one (a move, a write,
   * a comment); absent, any of them (its folder was written). An open task
   * reads itself again on either: its times are whole seconds, so two
   * changes in one second (a tracker's sync beside you) show no newer time.
   */
  taskId?: string;
}

/**
 * Hub-originated: a session closed one of its questions to the person
 * (`question_close`, taken or withdrawn): what a session's tree asked him
 * moved without anything in Needs you moving, so a screen listing a
 * session's questions (core session-questions.ts) reads them again.
 */
interface QuestionsMovedFrame {
  /** The artifact that asked it. */
  artifactId: string;
  instanceId?: undefined;
  kind: "questions.moved";
}

interface DecisionsChangedFrame {
  instanceId?: undefined;
  /**
   * Hub-originated: a project's decision pages changed (one was built,
   * picked on or sent, its record written, its graph edited): read them
   * again.
   */
  kind: "decisions.changed";
  projectId: string;
}

interface BlocksChangedFrame {
  instanceId?: undefined;
  /**
   * Hub-originated: a project's arrangement of blocks changed (a block
   * moved, resized, hidden or shown, a view placed or made a tab): read it
   * again.
   */
  kind: "blocks.changed";
  projectId: string;
}

interface DelegateEventFrame {
  event: DelegateEvent;
  instanceId: string;
  /** Hub-originated: delegate traffic; `instanceId` is the delegate's. */
  kind: "delegate_event";
}

/**
 * `frames`: everything a session produces, flowing agent→hub→dashboard. The
 * `frame` kind is a neutral message; `raw` on it carries the harness's own
 * event verbatim.
 *
 * @socketFrame fromHub
 */
export type FramePayload =
  | FleetMcpFrame
  | FleetReportFrame
  | FleetConvergeFrame
  | PreviewFrame
  | MessageFrame
  | SendFrame
  | RejectedFrame
  | HeldSendFrame
  | TakenSendFrame
  | InstancesFrame
  | InstancesDeltaFrame
  | PermissionRequestFrame
  | PermissionSettledFrame
  | UsageFrame
  | StoppedFrame
  | AsleepFrame
  | RecoveryUnavailableFrame
  | ControlResultFrame
  | ErrorFrame
  | SessionAddressFrame
  | ScratchWorktreeFrame
  | PulseFrame
  | WorkItemFrame
  | ProjectOfferFrame
  | TasksChangedFrame
  | QuestionsMovedFrame
  | DecisionsChangedFrame
  | BlocksChangedFrame
  | StartersChangedFrame
  | ProjectsChangedFrame
  /** Hub-originated: the hub restarts for an update now, and is back within a deadline. */
  | HubRestartFrame
  | TailnetHttpsFrame
  | FleetFetchFrame
  | ProjectCapFrame
  | ActionsFrame
  | HubAuthFrame
  /** Hub-originated: every install and the draft, whole, on each change. */
  | InstallsFrame
  | ProjectStopFrame
  | DelegateEventFrame
  /** Hub-originated: every open fleet-watch notice, whole, on each change. */
  | FleetWatchNoticesFrame
  /** Hub-originated: every artifact waiting on the person, and their notices, whole, on each change. */
  | ArtifactNeedsFrame
  /** Hub-originated: every law the hub caught broken, whole, on each break. */
  | LawsBrokenFrame
  /** Hub-originated: the person's presence and the machines that count toward it. */
  | PersonFrame
  /** Hub-originated: something that needs the person, shown on the desk tab they use. */
  | DeskAlertFrame
  /** Hub-originated: every project move, whole, on each change. */
  | MovesFrame
  /** Daemon-originated: how far a move's clone or large files are. */
  | MoveProgressFrame
  /** Daemon-originated: a running command's wait for a shared machine slot. */
  | CommandQueueFrame
  /** Daemon-originated: a workspace's stage changed (live components). */
  | StageFrame
  /** Daemon-originated: a place's stage clone is cut and in step (live components). */
  | StageCloneFrame
  /** Daemon-originated: a borrowed sign-in near its expiry, asking for a fresh one. */
  | AccountBorrowFrame
  /** Daemon-originated: the machine's runtime and every browser on it, whole, on each change. */
  | BrowserFrame
  /** Daemon-originated: a take-over the daemon ended itself (no view for two minutes, or the browser stopped). */
  | BrowserHandedBackFrame
  /** Hub-originated: every browser of the fleet, whole, on each change. */
  | BrowserListFrame
  /** Daemon-originated: the stream relay on the machine, whole, on each change. */
  | RelayFrame
  /** Hub-originated: the stream relay's journey, whole, on each change. */
  | RelayJourneyFrame
  /** Hub-originated: Recent's stored transcripts, whole, on each change. */
  | StoredFrame
  /** Daemon-originated: the machine's stored transcripts moved. */
  | CatalogMovedFrame;
