/** Named frame shapes keep schema and generated-client names independent of union order. */
import type {
  FleetMcpServer,
  FleetPlugin,
  FleetSkillMeta,
  MarketplaceLink,
  MarketplaceRead,
} from "./fleet";
import type {
  HarnessKind,
  NeutralMessage,
  PermissionUpdate,
  SendRecord,
} from "./harness";
import type {
  AgentRow,
  ArtifactKind,
  BuildInfo,
  ContinuationJob,
  DelegateEvent,
  InstanceRow,
  PreviewSource,
  SessionPulse,
  Verb,
  WorkItemSummary,
} from "./index";
import type { MoveJob } from "./move";
import type { PermissionPresentation } from "./permission-presentation";
import type { ThreadMessage, ThreadSummary } from "./threads";
import type { UsageLimitsReading, UsageSpend } from "./usage";

export interface FleetMcpFrame {
  kind: "fleet_mcp";
  servers: FleetMcpServer[];
}

export interface PreviewFrame {
  /** The artifact the session's panel shows (Projects spec §5.10). */
  artifact: { id: string; kind: ArtifactKind; name: string };
  /**
   * Every artifact the session holds, by id, newest first: republished when
   * one is removed, so a panel's open list drops it at once.
   */
  artifacts?: string[];
  /** Host mode's `name[:port]` beside `origin`: a bridge for readers before it ({@link PreviewAddress}). */
  host?: string;
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
  /** Identifies one successful open, including a rebuild of the same source. */
  revision: string;
  source?: PreviewSource;
  state: "open" | "closed";
}

/**
 * Where a session's preview is served, as the hub reports it: its own port,
 * which the hub listens on in either mode, and in host mode the whole origin
 * the fleet's pattern names it by too. Which one a client loads is its own
 * choice, by where it reached the hub ({@link previewRoute}).
 *
 * `host` is a bridge, not part of the address: host mode's `name[:port]`,
 * the only host-mode field readers built before `origin` (8c9b79c37) decode,
 * nightly 3146's dashboard and TestFlight 20261015 among them. Those readers
 * take `host` over `port`, so they open host-mode names as they did. Every
 * reader now reads `origin`. It goes in the change that expires TestFlight
 * 20261015, once a TestFlight build that reads `origin` has shipped; the
 * wire check refuses it from the moment no shipped reader needs it (hub
 * scripts wire-compat.ts `BRIDGES`).
 */
export interface PreviewAddress {
  /** Host mode's `name[:port]`, beside `origin` alone: the bridge above. */
  host?: string;
  /** Host mode's whole origin for the session. */
  origin?: string;
  /** The session's own preview port, listened on in either mode. */
  port: number;
}

/**
 * The domain host mode's names stand under: the origin's host name less its
 * first label (`p-3459.example.com` → `example.com`); empty for a one-label
 * name.
 */
const hostModeDomain = (origin: string): string => {
  const name = new URL(origin).hostname.toLowerCase();
  const dot = name.indexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1);
};

/** Whether `hostname` is `domain` or a name under it, label by label. */
const under = (hostname: string, domain: string): boolean => {
  const name = hostname.toLowerCase();
  return !!domain && (name === domain || name.endsWith(`.${domain}`));
};

/**
 * Where a client loads a session's previews from, picked by where it
 * reached the hub or dashboard (`at`). Reached under host mode's domain
 * (the dashboard behind the same DNS or proxy as the pattern's names): the
 * origin the hub named, entered with a ticket (`byHost`). Reached any other
 * way (a tailnet name, a LAN address, localhost): that host and scheme on
 * the session's own port, with no ticket. Null when the hub named nothing
 * this client can load.
 */
export const previewRoute = (
  address: { origin?: string; port?: number },
  at: { hostname: string; protocol: string }
): { origin: string; byHost: boolean } | null => {
  if (address.origin && under(at.hostname, hostModeDomain(address.origin))) {
    return { origin: address.origin, byHost: true };
  }
  if (address.port) {
    const host =
      at.hostname.includes(":") && !at.hostname.startsWith("[")
        ? `[${at.hostname}]`
        : at.hostname;
    return { origin: `${at.protocol}//${host}:${address.port}`, byHost: false };
  }
  return null;
};

/** The one path a preview origin answers with CORS and no credentials: the dashboard's reachability probe. */
export const PREVIEW_PING_PATH = "/__cawco/ping";

/**
 * Host mode's way in (hub preview-access.ts). Every request to a host-mode
 * preview name needs the hub's cookie for that name's session, but for
 * {@link PREVIEW_PING_PATH} and this path. A client the hub already trusts
 * (the dashboard through its relay, the app with its credential) asks the
 * hub for a ticket (`POST /api/instances/:id/preview-ticket`, a
 * {@link PreviewTicket}) and opens `<origin>/__cawco/enter?ticket=…&next=<path>`
 * ({@link previewEnterUrl}): the hub checks the ticket, sets the cookie and
 * sends the client on to the path.
 */
export const PREVIEW_ENTER_PATH = "/__cawco/enter";

/** What a host-mode preview name answers without its cookie: the page says so to its parent as this, so a frame asks for a new ticket. */
export const PREVIEW_LOCKED_MESSAGE = "cawco:locked";

/** A ticket into one session's host-mode preview origin: single-use, and spent by `expiresAt` (ms epoch). */
export interface PreviewTicket {
  expiresAt: number;
  ticket: string;
}

/** Where a client opens `place` (a path on the preview's `origin`) with `ticket`. */
export const previewEnterUrl = (
  origin: string,
  ticket: string,
  place: string
): string =>
  `${origin}${PREVIEW_ENTER_PATH}?ticket=${encodeURIComponent(ticket)}&next=${encodeURIComponent(place)}`;

/**
 * The dashboard's own cookies, by name: every one it sets is `cawco-…`,
 * `__Host-`-prefixed where the scheme allows. A preview listener shares the
 * dashboard's host in port mode, and cookies are not isolated by port (RFC
 * 6265 §8.5), so it strips these from what the previewed app is sent and
 * drops any the app tries to set.
 */
export const DASHBOARD_COOKIE = /^(?:__Host-)?cawco-/;

/**
 * How previews are reached, fleet-wide (Settings › Previews, Caw's
 * `admin_previews_write`): `port`, one port per session from the hub's range,
 * which needs no setup; or `host`, an origin per session from `pattern`
 * (its scheme, then a host name where `{session}` stands for the session's
 * id, or `{port}` for the preview port it keeps, so one name per port of the
 * range serves every session), for a
 * fleet behind DNS or a proxy that routes them to the hub's first preview
 * port.
 */
export type PreviewSettings =
  | { mode: "port"; ports: string }
  | { mode: "host"; pattern: string; ports: string };

/**
 * The socket an artifact's own tab (the dashboard's `/artifact/<id>`) follows
 * the session that made it on, `<path><instanceId>`: nothing else of the
 * fleet reaches that tab. It also carries the tab's `fs` envelopes (a page's
 * place picker browsing a machine's folders), answered on it as on the
 * dashboard's socket.
 */
export const ARTIFACT_SESSION_PATH = "/ws/artifact-session/";

/**
 * Everything that tab reads of its session, whole, on open and again on
 * every change of it.
 */
export interface ArtifactSessionFrame {
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

export interface MessageFrame {
  harness: HarnessKind;
  instanceId: string;
  keepAlive?: true;
  kind: "frame";
  message: NeutralMessage;
}

export interface SendFrame {
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
export interface HeldSendFrame {
  instanceId: string;
  kind: "held_send";
  send: import("./index").SendPayload;
}

export interface RejectedFrame {
  error: string;
  instanceId: string;
  /** Daemon-originated: one send did not go; its record fails and the session goes on. */
  kind: "rejected";
  uuid: string;
}

export interface InstancesFrame {
  agents: AgentRow[];
  continuations: ContinuationJob[];
  /**
   * The ids sessions had before the hub folded each one's continuations at
   * its account's limit into it (migration 0128): former id → its id now. A
   * tab or link that names a former id is that session.
   */
  formerIds: Record<string, string>;
  handoffs: Record<string, { from: string; at: number }>;
  hubBuild: BuildInfo;
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
  noticesDamaged?: import("./index").DamagedHubRecord | null;
  /** The notice ids a person acknowledged, on any tab or device (hub notices.ts). */
  noticesSeen: string[];
  previews?: PreviewFrame[];
  protocol: number;
  pulses: Record<string, SessionPulse>;
}

export interface InstancesDeltaFrame {
  /** Changed machines only; omitted when no machine moved. */
  agents?: AgentRow[];
  continuations?: ContinuationJob[];
  handoffs?: Record<string, { from: string; at: number }>;
  /** Hub-originated: only changed rows and metadata; pulses travel separately. */
  kind: "instances_delta";
  /** Present when it moved: the damaged notices record, or null once it is reset. */
  noticesDamaged?: import("./index").DamagedHubRecord | null;
  noticesSeen?: string[];
  previews?: PreviewFrame[];
  removed: string[];
  removedAgents?: string[];
  upserts: InstanceRow[];
}

export interface PermissionRequestFrame {
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
  suggestions?: PermissionUpdate[];
  /**
   * An ask a project's Caw made (his question, a project setting or a
   * memory proposal he asked about): the thread it was made in (the one
   * whose message woke that turn, else the project's newest). It is drawn
   * and answered in that thread, and its answer lands there.
   */
  threadId?: string;
  toolName: string;
  /** The tool call the ask gates, as its transcript message names it. */
  toolUseId?: string;
}

/**
 * A permission request as a daemon sends it to the hub: what the hub stamps
 * as it parks the ask (`presentation`, `raisedAt`) is not on it yet.
 */
export type DaemonPermissionRequestFrame = Omit<
  PermissionRequestFrame,
  "presentation" | "raisedAt"
>;

export interface PermissionSettledFrame {
  instanceId: string;
  /** An ask is over, whoever settled it; every client removes its parked card. */
  kind: "permission_settled";
  outcome?: "answered" | "cancelled";
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

export interface UsageFrame {
  /** Hub-originated: every machine's latest limits and the fleet's spend. */
  kind: "usage";
  limits: UsageLimitsReading[];
  spend: UsageSpend;
}

export interface StoppedFrame {
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
  died?: { error: string; signal: string };
  instanceId: string;
  /** The daemon stopped an at-rest session's processes, or one ended of its own accord; its next message wakes it. */
  kind: "asleep";
}

export interface RecoveryUnavailableFrame {
  instanceId: string;
  /** Recovery found no live handle; stored conversations remain resumable. */
  kind: "recovery_unavailable";
  reason: string;
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

export interface ControlResultFrame {
  error?: string;
  /** `listSessions` only, and only when some harness's listing threw: those harnesses, whose sessions `result` leaves out. */
  failed?: HarnessFailed[];
  instanceId?: string;
  /** No `instanceId` when the call it answers was machine-scoped. */
  kind: "control_result";
  ok: boolean;
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
  message: string;
  requestId?: string;
  verb?: Verb;
}

export interface SessionAddressFrame {
  instanceId: string;
  kind: "session_address";
  processGeneration: string;
  sessionId: string;
}

export interface ScratchWorktreeFrame {
  instanceId: string;
  kind: "scratch_worktree";
  processGeneration: string;
  worktree: import("./index").ScratchWorktree;
}

export interface UserMessageFrame {
  /** Absolute paths of images on the session's machine to send alongside. */
  attachments?: string[];
  instanceId: string;
  /** Daemon-originated: a session pushing text straight to the owner's Telegram. */
  kind: "user_message";
  text: string;
}

export interface PulseFrame {
  instanceId: string;
  /** Daemon-originated: a session's coarse now-state, throttled to about once per second. */
  kind: "pulse";
  pulse: SessionPulse;
}

export interface WorkItemFrame {
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

export interface ProjectOfferFrame {
  instanceId: string;
  /** Hub-originated: the session's standing offer, or null once it was answered. */
  kind: "project_offer";
  offer: ProjectOfferSummary | null;
}

export interface ThreadUpsertFrame {
  instanceId?: undefined;
  /** Hub-originated: a thread was started, or its last message or status changed. */
  kind: "thread.upsert";
  thread: ThreadSummary;
}

export interface ProjectCapFrame {
  /** Its project's cap as it stands now; null once it has none. */
  cap: import("./threads").ProjectCap | null;
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

export interface ProjectsChangedFrame {
  instanceId?: undefined;
  /**
   * Hub-originated: the projects changed (one was made or forgotten, or a
   * place was added or removed: a checkout joined, a delegate's workspace
   * opened or was archived): read `/api/projects` again.
   */
  kind: "projects.changed";
}

/**
 * Hub-originated: the fleet's upstream answer (hub fleet-choices.ts
 * `upstream`) was given or changed, from onboarding's Needs you row, a
 * setup page or the API: every dashboard takes it at once, so Needs you
 * stops asking and each project's "Same as the fleet" names it.
 */
export interface FleetUpstreamFrame {
  instanceId?: undefined;
  kind: "fleet.upstream";
  /** Whether agents may post to other people's repositories. */
  upstream: boolean;
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
  instanceId?: undefined;
  kind: "fleet.fetch";
  link?: MarketplaceLink;
  marketplace?: MarketplaceRead;
  plugin?: FleetPlugin;
  /** The row was removed while it was fetched; its `error` says so. */
  removed?: boolean;
  skill?: FleetSkillMeta;
}

export interface TasksChangedFrame {
  instanceId?: undefined;
  /**
   * Hub-originated: a project's tasks changed (one was created or moved, or
   * its folder was written), by anyone: read them again.
   */
  kind: "tasks.changed";
  projectId: string;
}

export interface DecisionsChangedFrame {
  instanceId?: undefined;
  /**
   * Hub-originated: a project's decision pages changed (one was built,
   * picked on or sent, its record written, its graph edited): read them
   * again.
   */
  kind: "decisions.changed";
  projectId: string;
}

export interface BlocksChangedFrame {
  instanceId?: undefined;
  /**
   * Hub-originated: a project's arrangement of blocks changed (a block
   * moved, resized, hidden or shown, a view placed or made a tab): read it
   * again.
   */
  kind: "blocks.changed";
  projectId: string;
}

export interface ThreadMessageFrame {
  instanceId?: undefined;
  /** Hub-originated: a message was added to a thread. */
  kind: "thread.message";
  message: ThreadMessage;
  threadId: string;
}

export interface DelegateEventFrame {
  event: DelegateEvent;
  instanceId: string;
  /** Hub-originated: delegate traffic; `instanceId` is the delegate's. */
  kind: "delegate_event";
}
