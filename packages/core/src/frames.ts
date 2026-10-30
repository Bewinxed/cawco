/** Named frame shapes keep schema and generated-client names independent of union order. */

import type { BrowserKey, ListedBrowser } from "./browser";
import type {
  FleetMcpServer,
  FleetPlugin,
  FleetSkillMeta,
  FleetSyncReport,
  MarketplaceLink,
  MarketplaceRead,
} from "./fleet";
import type {
  HarnessKind,
  ModeAsk,
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
  LastErrorKind,
  PreviewSource,
  SessionPulse,
  Verb,
  WorkItemSummary,
} from "./index";
import type { MoveJob } from "./move";
import type { PermissionPresentation } from "./permission-presentation";
import type { StageState } from "./stage";
import {
  onTailnet,
  type TailnetHttps,
  type TailnetOrigin,
} from "./tailnet-https";
import type { AccountLimits, MachineGoLimits, UsageSpend } from "./usage";

export interface FleetMcpFrame {
  kind: "fleet_mcp";
  servers: FleetMcpServer[];
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

/** Where a page stands on the origin that serves it by id: a project's page on its project's origin, any page in the Decisions tab. */
export const projectPagePlace = (artifactId: string): string =>
  `/__cawco/page/${artifactId}/`;

export interface PreviewFrame {
  /**
   * The artifact the session's panel shows (Projects spec §5.10), with its
   * ask: the head's line under its name from the first frame, while its
   * page is still on its way. None on one made before asks were kept.
   */
  artifact: { ask?: string; id: string; kind: ArtifactKind; name: string };
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
 * Where a session's preview is served, as the hub reports it: its own port,
 * which the hub listens on in either mode, and in host mode the whole origin
 * the fleet's pattern names it by too. Which one a client loads is its own
 * choice, by where it reached the hub ({@link previewRoute}).
 */
export interface PreviewAddress {
  /** Host mode's whole origin for the session. */
  origin?: string;
  /** The session's own preview port, listened on in either mode. */
  port: number;
  /**
   * The session's origin on the hub machine's tailnet name, while the hub
   * serves HTTPS there (core tailnet-https.ts): on the tailnet addresses the
   * port answers HTTPS alone.
   */
  tailnet?: TailnetOrigin;
}

/**
 * The domain host mode's names stand under: the origin's host name less its
 * first label (`p-3459.example.com` → `example.com`); empty for a one-label
 * name. The preview pass's cookie is set on it ({@link PREVIEW_PASS_COOKIE}),
 * so every name under it carries the one pass.
 */
export const hostModeDomain = (origin: string): string => {
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
 * origin the hub named, behind the browser's pass (`byHost`). Reached over the
 * tailnet while the hub serves HTTPS on its name (a tailnet address, the
 * short name, the full one): the session's origin on that name, since the
 * port answers HTTPS alone there; a client that reached the hub's own port
 * over plain http (the app) loads it too. Reached any other way (a LAN
 * address, `.local`, localhost): that host and scheme on the session's own
 * port. Every route is behind the browser's pass, entered with a ticket.
 * Null when the hub named nothing this client can load.
 */
export const previewRoute = (
  address: { origin?: string; port?: number; tailnet?: TailnetOrigin },
  at: { hostname: string; protocol: string }
): { origin: string; byHost: boolean } | null => {
  if (address.origin && under(at.hostname, hostModeDomain(address.origin))) {
    return { origin: address.origin, byHost: true };
  }
  if (address.tailnet && onTailnet(address.tailnet, at.hostname)) {
    return { origin: address.tailnet.origin, byHost: false };
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
 * The way into a preview (hub preview-access.ts). Every request to a
 * preview origin, a host-mode name or an origin's own port, needs the
 * browser's pass ({@link PREVIEW_PASS_COOKIE}, {@link PREVIEW_PORT_PASS_COOKIE}),
 * but for {@link PREVIEW_PING_PATH} and this path. A client the hub already
 * trusts (the dashboard through its relay, the app with its credential) asks
 * the hub for a ticket (`POST /api/preview-ticket`, a {@link PreviewTicket})
 * and opens `<origin>/__cawco/enter?ticket=…` ({@link previewEnterUrl}) on
 * any name the hub serves: the hub spends the ticket and sets the pass, then
 * sends the client on to `next` when it names one.
 */
export const PREVIEW_ENTER_PATH = "/__cawco/enter";

/** What a preview origin answers without a pass: the page says so to its parent as this, so the frame's host enters again. */
export const PREVIEW_LOCKED_MESSAGE = "cawco:locked";

/**
 * Host mode's pass: one cookie per browser, set on the domain the names
 * stand under ({@link hostModeDomain}), so every preview, embed and asset
 * there carries it. `__Secure-`, never `__Host-`: a cookie with a `Domain`
 * can't carry `__Host-` (RFC 6265bis §5.7 step 21).
 */
export const PREVIEW_PASS_COOKIE = "__Secure-cawco-pass";

/**
 * The same pass on a preview origin's own port reached over plain http (a
 * LAN address, localhost), where no browser keeps a `Secure` cookie: set on
 * that host alone, which every port of it carries (RFC 6265 §8.5), so one
 * entry opens every preview port the host serves. Over https a port takes
 * {@link PREVIEW_PASS_COOKIE}, on its host alone.
 */
export const PREVIEW_PORT_PASS_COOKIE = "cawco-preview-pass";

/** A ticket into the previews for the device or browser that asked: single-use, and spent by `expiresAt` (ms epoch). */
export interface PreviewTicket {
  expiresAt: number;
  ticket: string;
}

/**
 * Where a client spends `ticket` on a preview `origin`: sent on to
 * `place` (a path there) when it names one, else answered with the pass
 * alone.
 */
export const previewEnterUrl = (
  origin: string,
  ticket: string,
  place?: string
): string =>
  `${origin}${PREVIEW_ENTER_PATH}?ticket=${encodeURIComponent(ticket)}${place === undefined ? "" : `&next=${encodeURIComponent(place)}`}`;

/**
 * `place` (a path on a preview origin, with its query and hash) at a state's
 * own `link`, `artifact_read`'s `state` for a preview or a page: the link's
 * query merged into the place's, each key it names set, and its hash in the
 * place's stead. A state-machine preview's link is `?__state=<value>` or
 * `?__state=<group>:<value>,…` (its state-switcher.js writes it this way).
 */
export const placeAtLink = (place: string, link: string): string => {
  const base = "http://place.invalid";
  const at = new URL(place, base);
  const asked = new URL(link, at);
  for (const [key, value] of asked.searchParams) {
    at.searchParams.set(key, value);
  }
  if (asked.hash) {
    at.hash = asked.hash;
  }
  return `${at.pathname}${at.search}${at.hash}`;
};

/**
 * The size an artifact's picture is drawn at: the dashboard's pane at a
 * desk, so a picture is the page as it is read there. A Files thumbnail
 * (dashboard page-thumbs.ts) and `artifact_read`'s `png` of a preview or a
 * page (agent artifact-picture.ts) both use it; a read may name its own
 * width.
 */
export const PICTURE_VIEW = { width: 640, height: 800 } as const;

/**
 * The daemon's control method that draws a preview or a page as the
 * person's panel does (agent artifact-picture.ts), in the hub machine's
 * Chromium on the artifact's own preview origin, overlay and all. Takes
 * `{ url, width, artifact: { id, kind, name }, sync }` and answers
 * `{ png }`, base64.
 */
export const ARTIFACT_PICTURE = "artifactPicture";

/** How an artifact's picture is bounded ({@link ARTIFACT_PICTURE}). */
export const PICTURE_LIMITS = {
  /** Widths a read may name, in CSS px: a phone's to a wide desk's. */
  minWidth: 320,
  maxWidth: 2560,
  /** The tallest picture, in CSS px: a page longer than this is drawn from its top. Our call: three panes' worth. */
  maxHeight: 2400,
  /**
   * The page's load, through its preview origin: a sleeping server is woken
   * by it and waited on first (agent preview.ts `staged`, within core
   * `STAGE_READY_MS`, 60 s), then the page loads and is waited on until
   * it is ready: one bound for both. Our call.
   */
  loadMs: 75_000,
  /**
   * How long a page stands ready before its picture: content painted and
   * nothing of its own in flight, since its last paint, its last request
   * and the hello that places its pins (agent artifact-picture.ts
   * `watchReadiness`), within `loadMs`, as Files waits on a page.
   */
  settleMs: 1000,
  /** The picture itself, once the page settled. Our call. */
  shotMs: 15_000,
  /** How long the hub waits for the daemon's answer, launch to picture: the load, the settle and the picture, with room for the launch. Our call. */
  askMs: 100_000,
} as const;

/**
 * The dashboard's own cookies, by name: every one it sets is `cawco-…`,
 * `__Host-`- or `__Secure-`-prefixed where the scheme allows. A preview
 * listener shares the dashboard's host in port mode, and cookies are not
 * isolated by port (RFC 6265 §8.5), so it strips these from what the
 * previewed app is sent and drops any the app tries to set; the preview
 * passes ({@link PREVIEW_PASS_COOKIE}, {@link PREVIEW_PORT_PASS_COOKIE}) are
 * among them.
 */
export const DASHBOARD_COOKIE = /^(?:__Host-|__Secure-)?cawco-/u;

/**
 * How previews are reached, fleet-wide (Settings › Previews, Caw's
 * `admin_previews_write`): `port`, one port per session from the hub's range,
 * which needs no setup; or `host`, an origin per session from `pattern`
 * (`https://`, then a host name whose first label holds `{session}`, standing
 * for the session's id, or `{port}`, for the preview port it keeps, so one
 * name per port of the range serves every session), for a fleet behind DNS
 * or a proxy that routes them to the hub's first preview port. `passDomain`:
 * the domain the names stand under, which the browser's pass is set on
 * ({@link PREVIEW_PASS_COOKIE}).
 */
export type PreviewSettings =
  | { mode: "port"; ports: string }
  | { mode: "host"; pattern: string; passDomain: string; ports: string };

/**
 * The socket an artifact's own tab (the dashboard's `/artifact/<id>`) follows
 * the session that made it on, `<path><instanceId>/<artifactId>`: nothing
 * else of the fleet reaches that tab. It also carries the tab's `fs`
 * envelopes (a page's place picker browsing a machine's folders), answered on
 * it as on the dashboard's socket.
 */
export const ARTIFACT_SESSION_PATH = "/ws/artifact-session/";

/**
 * The codes the hub closes an artifact tab's socket with when it refuses it,
 * the close's reason being the sentence the tab shows. A tab opens no socket
 * again after one: what refused it stays true until the person acts.
 */
export const ARTIFACT_SESSION_REFUSED = {
  /** The device is not paired, or its pairing was removed. */
  unpaired: 4401,
  /** The artifact was deleted, or the session that made it was. */
  gone: 4404,
} as const;

/** What the hub says, closing an artifact tab's socket {@link ARTIFACT_SESSION_REFUSED}`.gone`. */
export const ARTIFACT_GONE =
  "This artifact is gone: it was deleted, or the session that made it was.";

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

/**
 * Daemon-originated: a send handed over again that its session has taken
 * already (agent taken-sends.ts). No turn started on it; its record is read,
 * and no turn follows that read.
 */
export interface TakenSendFrame {
  instanceId: string;
  kind: "taken_send";
  uuid: string;
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
  noticesDamaged?: import("./index").DamagedHubRecord | null;
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

export interface InstancesDeltaFrame {
  /** Changed machines only; omitted when no machine moved. */
  agents?: AgentRow[];
  continuations?: ContinuationJob[];
  /** Present when it moved: every former id, by its id now ({@link InstancesFrame.formerIds}), whole. */
  formerIds?: Record<string, string>;
  handoffs?: Record<string, { from: string; at: number }>;
  /** Hub-originated: only changed rows and metadata; pulses travel separately. */
  kind: "instances_delta";
  /** Present when it moved: the damaged notices record, or null once it is reset. */
  noticesDamaged?: import("./index").DamagedHubRecord | null;
  noticesSeen?: string[];
  /** Present when it moved: the fleet's preview mode ({@link InstancesFrame.previewSettings}). */
  previewSettings?: PreviewSettings;
  previews?: PreviewFrame[];
  removed: string[];
  removedAgents?: string[];
  upserts: InstanceRow[];
}

/** The tool a browser ask parks under (hub browser-tools.ts). */
export const BROWSER_ASK_TOOL = "mcp__cawco__browser_ask";

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

/** The tool a connect ask parks under (hub connect-asks.ts). */
export const CONNECT_ASK_TOOL = "mcp__cawco__connect_ask";

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
  suggestions?: PermissionUpdate[];
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

/**
 * An answered ask's answer as the hub took it, and where it came from, so a
 * screen that held the ask and did not answer it says what won and where
 * (JOURNEY.md Flow 2: "the answer row resolves to the answer that won,
 * naming where it came from").
 */
export interface AskAnswer {
  /** Approve or deny; absent when the harness settled the ask itself and did not say. */
  behavior?: "allow" | "deny";
  /**
   * The paired device that answered (a page or the app), or the session that
   * did (a delegate's parent, its project's lead), by name; absent when the
   * hub knows no name (a page or app it trusts by its network).
   */
  name?: string;
  /**
   * Where it was answered: a dashboard page; the app (a client that is no
   * page: the iOS and Mac app); another session; or the harness itself, in
   * its own interface.
   */
  via: "page" | "app" | "session" | "harness";
}

export interface PermissionSettledFrame {
  /** What won, and where, when the ask was answered (`outcome: answered`) and the hub knows. */
  answer?: AskAnswer;
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
  /** Hub-originated: every Claude account's own limits, every machine's Go plan, and the fleet's spend. */
  claude: AccountLimits[];
  kind: "usage";
  openCodeGo: MachineGoLimits[];
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
  died?: { cut?: CutCommand[]; error: string; signal: string };
  instanceId: string;
  /** The daemon stopped an at-rest session's processes, or one ended of its own accord; its next message wakes it. */
  kind: "asleep";
}

/**
 * A shell command a session's process was running when it died: the command
 * as the model asked it, and the end of what it had printed by then, when
 * its harness kept any (Claude Code spools a running command's output:
 * agent claude.ts `cutCommands`; pi and OpenCode keep none, and their
 * commands are read off the session's own tool calls: agent session.ts
 * `#shells`). The hub says each one interrupted, with that output or that
 * none was kept, in the turn it hands back and in the item's report when
 * the death fails it.
 */
export interface CutCommand {
  command: string;
  /** What it printed: empty when it printed nothing, or when none was kept ({@link unkept}). */
  output: string;
  /** Its harness keeps no output of a running command (pi, OpenCode). */
  unkept?: true;
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
  | { kind: "unknown"; message: string };

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

export interface ProjectOfferFrame {
  instanceId: string;
  /** Hub-originated: the session's standing offer, or null once it was answered. */
  kind: "project_offer";
  offer: ProjectOfferSummary | null;
}

export interface ProjectCapFrame {
  /** Its project's cap as it stands now; null once it has none. */
  cap: import("./project-conversation").ProjectCap | null;
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
  /** Whether agents may post to other people's repositories: off, ask the person first, or on. */
  upstream: import("./upstream-guard").UpstreamPosts;
}

/**
 * Hub-originated: HTTPS on the hub machine's tailnet name changed state (hub
 * tailnet-https.ts): a step came to need the person, they took it, or the
 * name began or stopped answering. Every dashboard takes it at once, so its
 * onboarding row in Needs you shows the step that stands, or ticks.
 */
export interface TailnetHttpsFrame {
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

export interface TasksChangedFrame {
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

export interface DelegateEventFrame {
  event: DelegateEvent;
  instanceId: string;
  /** Hub-originated: delegate traffic; `instanceId` is the delegate's. */
  kind: "delegate_event";
}
