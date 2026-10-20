/**
 * The Ledger Protocol: one canonical, ordered event stream per session, and
 * every operator action an acknowledged transaction.
 *
 * WHY (JOURNEY.md, cross-cutting error state): "an empty surface must assert
 * that the connection is live before it is allowed to claim zero" — and its
 * generalisation: a client must never render a guess as truth. The dashboard's
 * historical failure class (fabricated echoes, invented timestamps, banners on
 * healthy connects, sent messages paired with their echoes by text) all follow
 * from state being duplicated or inferred client-side.
 * This protocol removes the inference: the hub assigns each session a monotonic
 * sequence, clients follow it gap-free or resynchronise explicitly, and
 * commands carry ids the hub acknowledges stage by stage. It is the only way
 * a session's frames reach a dashboard: the hub and the dashboard ship
 * together, so there is no older dialect to negotiate.
 */

import type { CarrySessionRequest } from "./harness";

/**
 * The dashboard wire's version, raised only when the wire breaks: when a
 * client built for the version before would misread what the hub now sends.
 * A tab outlives the deploy that loaded it, so the hub names this on the
 * board frame every dashboard socket receives first, and a page built for an
 * older version reloads itself (the dashboard's `protocol-reload.ts`).
 *
 * 2: a session's stream carries the hub's transcript events (3721295c).
 * 3: raised on the live fleet to show a tab built for 2 reload itself with
 *    its drafts; what the wire carries is 2's.
 * 4: board deltas carry changed machines and optional metadata, with pulse
 *    snapshots only on connect. Older tabs must reload before reading deltas.
 * 5: a page names the protocol it was built for when it opens its socket
 *    (`/ws/dashboard?protocol=5`), and reads the snapshot's `protocol` before
 *    it applies anything. The hub sends a page on an older wire the snapshot
 *    alone, never a delta. Pages built for 3 and 4 name nothing, took the
 *    first change-only delta as `state.machines = undefined`, and from then
 *    on threw on every board frame before reaching the reload at its end.
 * 6: `thread.upsert` and `thread.message` frames carry a project's threads
 *    and name no session. A page built for 5 reads any frame it does not
 *    know as a session's and files a blank session under no id, so it
 *    reloads first. The app logs a frame it cannot decode and goes on.
 * 7: a workspace's held work (`GET /api/workspaces/:id/held`) names no files
 *    git ignores (`ignored`, `ignoredBytes`): they go with the clone, and
 *    only a held workspace has held work to read.
 * 8: a sheet's create and read answer `sheet` (its stories with their args,
 *    its meta, each component's props) in place of `stories` (live
 *    components, slice 2). Nothing but an agent reads them; a page built for
 *    7 reloads into the inspector that reads the sheet from its page.
 * 9: a starter's outcome (`POST /api/projects/:id/starters/outcome`) names
 *    the place it stood in (`place`: board, routines or decisions), each
 *    place its own set; a page built for 8 sends none, so it reloads first.
 * 10: a component's prop says no `tokens` role: a prop typed with the design
 *    system's `TokenColor`, `TokenSize` or `TokenFont` is its own kind
 *    (`token-color`, `token-size`, `token-font`), its names its `options`,
 *    and the sheet's page carries no project-wide token names. A page built
 *    for 9 reloads into the inspector that reads the kinds.
 * 11: an artifact notice's row (`ui.system_note` `artifact_responses`) says
 *    the words before the artifact's name (`artifactLead`: "Comments on",
 *    "Changes saved to", "Fix tray handed you") in place of `artifactSaid`,
 *    one per notice kind (core `ARTIFACT_NOTICES`). A page built for 10 would
 *    draw every notice as "Responses on", so it reloads first.
 * 12: the upstream choice has three answers, `off`, `ask` and `on`, where it
 *    had a boolean: `GET`/`PUT /api/fleet/choices` `upstream`, a project's
 *    `upstreamPosts`, the `fleet.upstream` frame. A page built for 11 sends
 *    a boolean the hub refuses, so it reloads first.
 * 13: an archived workspace's row (`POST /api/workspaces/:id/archive`) says
 *    `head`, the commit its clone's HEAD was on when it retired and the
 *    branch of `origin` that held it, where it is cut again, in place of
 *    `landed`, the commit its last landing recorded. No page reads it; a
 *    page built for 12 reloads first all the same.
 * 14: a machine's `container-runtime` capability says `media`, what the
 *    runtime forwards to a browser's media port (`udp+tcp`, `tcp` or
 *    `none`), in place of `udp`. No page reads it; a page built for 13
 *    reloads first all the same.
 * 15: the stream relay listens on one port, 443: its frame's `ports` says
 *    `udp443`, `tcp443` and `tls`, where it said `udp3478`, `tcp3478`,
 *    `tcp443` and `tls`, and its health chips are `udp 443`, `tcp 443` and
 *    `tls`. A page built for 14 would draw the 3478 chips, so it reloads
 *    first.
 * 16: a browser's row (`BrowserFrame`) says no `ports.gate`: the machine has
 *    one DevTools gate port for every browser, and a browser reserved for a
 *    session's browser tool has no `ports` until it first starts. No page
 *    reads them; a page built for 15 reloads first all the same.
 * 17: `GET /api/stream-relay` answers the stream relay's journey
 *    (`RelayAnswer`: `journey` and the page's `domain`), no longer the
 *    machines that could run it and the relay (`candidates`, `relay`); its
 *    changes are POST `/api/stream-relay/act`. A page built for 16 would draw
 *    Settings › Browsers from fields that are gone, so it reloads first.
 * 18: the stream relay runs on every platform: the journey's machine step no
 *    longer names machines that can't run it (`notLinux`), and its runtime
 *    step carries how the relay meets the network (`network`) and the
 *    setting to change (`need`: a rootless Linux engine's low ports, a VM's
 *    forwarder, a VM's rootless Podman). A page built for 17 would read the
 *    runtime step's words from `lowest` alone, so it reloads first.
 * 19: a workspace's archive answers its cut (`WorkspaceCut`) with no
 *    `installed`: a workspace cut again installs nothing (ab4953b28,
 *    reverted), and its session is told the folder is new instead. No page
 *    reads it; a page built for 18 reloads first all the same.
 *
 * Two things hold across every version, because an older page finds its way
 * out through them: the snapshot is `kind: "instances"`, and it carries
 * `protocol`.
 */
export const WIRE_PROTOCOL = 19;

/**
 * What a session's stream carries: the changes each frame made to its
 * transcript, as the hub built them (`transcript-types.ts`), and its preview's
 * state. Raw frames never reach a dashboard; the hub folds them.
 */
export type SessionStreamFrame =
  | (Extract<import("./index").FramePayload, { kind: "frame" | "send" }> & {
      keepAlive: true;
    })
  | import("./transcript-types").TranscriptStreamFrame
  | Extract<import("./index").FramePayload, { kind: "preview" }>;

/**
 * One event on a session's canonical stream. `seq` is hub-assigned, monotonic
 * per session, starting at 1 — and NO GAP is ever delivered: a client that
 * observes `seq > lastSeq + 1` re-subscribes with `afterSeq = lastSeq` instead
 * of applying the delta.
 */
export interface SessionStreamEvent {
  frame: SessionStreamFrame;
  seq: number;
  /** The instance id — what the dashboard calls a viewId. */
  sessionId: string;
}

/**
 * Client → hub. `afterSeq` present is a resume ("I have up to here — replay the
 * rest"): a client sends it with the `seq` its transcript page was read at, and
 * when a delta skips a seq on the same socket. Absent is a fresh join ("start
 * me from now").
 *
 * Never across a connection: the hub numbers a session's stream in memory,
 * from 1 again when its process restarts, so a cursor from the socket before
 * may name another process's events. A client that reconnects reads each
 * transcript it follows again, and that read's page subscribes it.
 */
export interface StreamSubscribe {
  afterSeq?: number;
  sessionId: string;
  type: "stream.subscribe";
}

/**
 * Client → hub: this socket no longer follows the session, so the hub sends
 * it none of the session's events from here on. Sent when nothing the client
 * shows on that socket follows the session any more (every pane, the peek,
 * a delegate card); a `stream.subscribe` follows it again. A session the
 * socket does not follow is no change. The session's plan, when the socket
 * follows it alone (`plan.follow`), is not this message's.
 */
export interface StreamUnsubscribe {
  sessionId: string;
  type: "stream.unsubscribe";
}

/**
 * Hub → client when the requested gap is inside its ring: events contiguous
 * ascending from `afterSeq + 1`. The client applies them in order, then
 * follows live deltas.
 */
export interface StreamBacklog {
  events: SessionStreamEvent[];
  sessionId: string;
  type: "stream.backlog";
}

/**
 * Hub → client when the gap is unrecoverable (older than the ring holds):
 * an honest refusal, never a partial replay. The client reads the newest
 * transcript page again and resumes from the `seq` it carries.
 */
export interface StreamReset {
  nextSeq: number;
  sessionId: string;
  type: "stream.reset";
}

/** Hub → client, live fan-out of one sequenced event. */
export interface StreamDelta {
  event: SessionStreamEvent;
  type: "stream.event";
}

/** The operations a command envelope can carry — 1:1 with existing relay ops. */
export type CommandKind =
  | "send"
  | "send.withdraw"
  | "permission.answer"
  | "interrupt"
  | "set-model"
  | "set-permission-mode"
  | "set-effort";

/**
 * Client → hub: an operator action as a durable, trackable object rather than
 * a fire-and-forget call. `commandId` is client-generated and unique per
 * submission; `payload` is exactly what the corresponding legacy relay
 * operation takes today.
 */
export interface CommandEnvelope {
  commandId: string;
  kind: CommandKind;
  machineId: string;
  payload: unknown;
  sessionId: string;
  type: "command";
}

/**
 * Hub → client, the command's lifecycle:
 * - `accepted` — validated, the target daemon reachable, dispatched;
 * - `applied`  — the daemon confirmed, where its protocol carries a
 *   confirmation today; where it does not, the hub stops at `accepted` and
 *   the stream event reflecting the change is the proof of application;
 * - `failed`   — terminal, with the reason a human can read.
 */
export interface CommandAck {
  commandId: string;
  outcome?: "withdrawn" | "started";
  reason?: string;
  stage: "accepted" | "applied" | "failed";
  type: "command.ack";
}

/**
 * Client → hub, and the hub's answer, the same shape: "are you there?" and
 * "yes", sent at once. A client sends one every
 * {@link HEARTBEAT_INTERVAL_MS}; when nothing at all arrives on the socket
 * within {@link HEARTBEAT_DEADLINE_MS} of it, the socket is dead though open
 * (a frozen hub, a dropped route that sent no FIN), and the client closes it,
 * reconnects and reads again. Application messages, not WebSocket pings:
 * URLSession rejects the pong Bun sends on a permessage-deflate socket
 * (NSPOSIXErrorDomain 100, "Protocol error"), so no client sends a ping.
 */
export interface StreamHeartbeat {
  type: "heartbeat";
}

/** How often a client asks the hub whether the socket is alive. */
export const HEARTBEAT_INTERVAL_MS = 20_000;

/** How long after asking a client waits for anything at all before calling the socket dead. */
export const HEARTBEAT_DEADLINE_MS = 10_000;

/** Everything the stream protocol can put on the dashboard socket. */
export type StreamServerMessage =
  | StreamBacklog
  | StreamReset
  | StreamDelta
  | CommandAck
  | StreamHeartbeat
  | import("./plan").PlanSnapshot
  | import("./plan").PlanDelta;
export type StreamClientMessage =
  | StreamSubscribe
  | StreamUnsubscribe
  | StreamHeartbeat
  | CommandEnvelope
  | import("./plan").PlanFollow
  | import("./plan").PlanResync;

// ---------------------------------------------------------------------------
// The ingest ledger (sessiond design §7): joining sessiond's per-child line
// sequence to this protocol's per-session `seq`.
// ---------------------------------------------------------------------------

/**
 * Where a frame came from: the sessiond line it was derived from, named by the
 * daemon's per-boot `epoch` and that line's `srcSeq`.
 *
 * Optional on the `frames` message: a frame that no sessiond line produced
 * (opencode's and pi's) carries none.
 * The dashboard never sees `srcSeq` and sessiond never sees the hub's `seq` —
 * this is the only place the two sequences touch.
 */
export interface FrameProvenance {
  srcEpoch: string;
  srcSeq: number;
}

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

/** `register`'s ack, with the ledger the returning agent reattaches against. */
export interface RegisterAckPayload {
  /**
   * The dashboard's ports: `hub`, where the hub's computer serves it to the
   * network (hub config.ts `DASHBOARD_PORT`), and `local`, its port on every
   * computer's loopback (core `localDashboardPort`). The agent serves `local`
   * on its own loopback, carried to the hub's `hub` (agent hub-loopback.ts),
   * with {@link previewPorts}.
   */
  dashboardPorts: { hub: number; local: number };
  /**
   * The hub's delivery mark for each instance the register names
   * ({@link DeliveryMark}): the agent sends again what it has past it.
   * Every heartbeat's ack carries them again, and the agent lets go of what
   * they cover.
   */
  delivered?: Record<string, DeliveryMark>;
  /**
   * Every origin the hub's git remote answers at (`http://<name>:<port>`, a
   * name for each of its hostnames, tailnet names and addresses): a clone
   * whose `origin` is under any of them, `/git/`, is a repository of this
   * hub's, whatever address it was made by (agent git-credential.ts
   * `hubOriginOf`). Each machine reaches the hub by the address it found it
   * at, and a clone's origin names the address of the machine that made it:
   * read as an outside remote, another machine's create sent it no
   * credential, and the hub refused it ("This remote takes a CawCo machine
   * or session credential", 2026-10-20).
   */
  gitOrigins: string[];
  /**
   * Whether this machine is the hub's own computer: its machine id is the
   * hub's (hub server.ts `isHubMachine`: "an agent registered under it shares
   * the hub's disk"). The agent's loopback carries nothing there (agent
   * hub-loopback.ts): the dashboard's own socket listens on the loopback port.
   */
  hostsHub: boolean;
  /**
   * This hub process, random at its start: an agent that last saw another
   * epoch knows the hub restarted since, and that every connection a harness
   * held to it (OpenCode's MCP streams) went with it.
   */
  hubEpoch: string;
  /** Per instance id: an instance with no mark follows from head. */
  ingested: Record<string, IngestMark>;
  /**
   * Every instance id this hub has a row for on the machine, whatever its
   * state. The machine removes what it kept for any other session to be
   * reattached (its browser door, agent browser/door.ts
   * `sweepBrowserDoors`): a session forgotten while the machine was away.
   */
  instances: string[];
  /**
   * The machine's credential for the hub's git remote (`/git/…`, HTTP Basic
   * `<machineId>:<credential>`), minted for this connection and replaced on
   * the next. The machine keeps it in memory only and hands it to git per
   * command through env-only config; it is never written, logged or put in
   * a session's environment.
   */
  machineCredential: string;
  ok: true;
  /** The ports the hub's preview listeners take (hub config.ts `PREVIEW_PORTS`), served on the agent's loopback beside {@link dashboardPorts}. */
  previewPorts: { first: number; last: number };
  /**
   * Of the credentials the register named by hash (agent daemon.ts
   * `RegisterPayload.credentialHashes`), the ones this hub has revoked, or
   * never issued: they grant nothing here, so the machine's redaction store
   * lets them go (agent redaction.ts `forgetRevoked`). Absent from a hub
   * from before it, and when the register named none.
   */
  revokedCredentials?: string[];
  /**
   * The fleet's session limits ({@link import("./index").SessionLimits}), so
   * the first process the machine starts after it connects runs under them.
   * Every heartbeat's ack carries them again.
   */
  sessionLimits?: import("./index").SessionLimits;
  /**
   * Every Claude session this hub has a row for on the machine, each with
   * the account its row runs on (null for none). The machine carries each
   * one's data into that account's dir (core paths.ts `sessionConfigDir`)
   * once its account sweep is done, leaving any whose process runs: data a
   * row's account change left in another dir is where its row says after
   * every start of the machine's agent.
   */
  sessions?: CarrySessionRequest[];
  /**
   * Of the account stores the machine named at register (`accountStores`),
   * the ids of accounts this hub removed: removed while the machine was
   * offline, or joined into another. The machine signs each out with its
   * harness's own logout and deletes it. An id the hub has is never named,
   * and nor is one it has no record of removing (a hub whose database was
   * wiped or restored from an older copy has never heard of real accounts).
   */
  unknownAccounts?: string[];
  /**
   * The upstream guard's rules (upstream-guard.ts `UpstreamRules`), so a
   * workspace's first command after the machine connects is judged by the
   * choice as it stands. Every heartbeat's ack carries them again.
   */
  upstream?: import("./upstream-guard").UpstreamRules;
}

const record = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;

/**
 * A frame's provenance, read from either the envelope or its payload.
 *
 * Both are accepted on purpose: the fields are additive, and which object
 * carries them is the sender's business — an agent that stamps the payload it
 * hands its socket writer and one that stamps the envelope mean the same
 * thing. Anything malformed reads as absent, never as seq 0: an invented mark
 * is the one outcome the ledger exists to forbid.
 */
export const readProvenance = (
  message: unknown
): FrameProvenance | undefined => {
  const outer = record(message);
  if (!outer) {
    return undefined;
  }
  for (const source of [outer, record(outer.payload)]) {
    if (!source) {
      continue;
    }
    const { srcEpoch, srcSeq } = source;
    if (typeof srcEpoch !== "string" || srcEpoch.length === 0) {
      continue;
    }
    if (typeof srcSeq !== "number" || !Number.isInteger(srcSeq) || srcSeq < 1) {
      continue;
    }
    return { srcEpoch, srcSeq };
  }
  return undefined;
};

/** A frame's delivery stamp ({@link DeliveryMark}), read off its payload; malformed reads as absent. */
export const readSent = (message: unknown): DeliveryMark | undefined => {
  const sent = record(record(record(message)?.payload)?.sent);
  const epoch = sent?.epoch;
  const seq = sent?.seq;
  return typeof epoch === "string" &&
    epoch.length > 0 &&
    typeof seq === "number" &&
    Number.isInteger(seq) &&
    seq > 0
    ? { epoch, seq }
    : undefined;
};

/** The delivery marks off a register or heartbeat ack, by instance; malformed entries are dropped. */
export const readDelivered = (
  payload: unknown
): Record<string, DeliveryMark> => {
  const marks = record(record(payload)?.delivered) ?? {};
  const read: Record<string, DeliveryMark> = {};
  for (const [instanceId, value] of Object.entries(marks)) {
    const mark = record(value);
    if (
      typeof mark?.epoch === "string" &&
      typeof mark.seq === "number" &&
      Number.isInteger(mark.seq)
    ) {
      read[instanceId] = { epoch: mark.epoch, seq: mark.seq };
    }
  }
  return read;
};

/**
 * AT MOST ONCE, per (instanceId, agent epoch, seq): whether the hub already
 * took this frame. Asked by the hub before sequencing, beside
 * {@link alreadyIngested}.
 */
export const alreadyDelivered = (
  mark: DeliveryMark | undefined,
  sent: DeliveryMark | undefined
): boolean =>
  sent !== undefined &&
  mark !== undefined &&
  mark.epoch === sent.epoch &&
  sent.seq <= mark.seq;

/**
 * The ledger off a register ack, each mark read off the wire: a malformed one
 * is dropped, which leaves its instance following from head (design §7's
 * honest-loss rule).
 */
export const readIngested = (payload: unknown): Record<string, IngestMark> => {
  const marks = record(record(payload)?.ingested) ?? {};
  const read: Record<string, IngestMark> = {};
  for (const [instanceId, value] of Object.entries(marks)) {
    const mark = record(value);
    const epoch = mark?.epoch;
    const srcSeq = mark?.srcSeq;
    if (typeof epoch !== "string" || epoch.length === 0) {
      continue;
    }
    if (typeof srcSeq !== "number" || !Number.isInteger(srcSeq) || srcSeq < 0) {
      continue;
    }
    read[instanceId] = { epoch, srcSeq };
  }
  return read;
};

/**
 * THE HONEST-LOSS RULE (design §7), as one function both ends read.
 *
 * The cursor a reattaching agent subscribes with: the hub's own mark when it
 * was minted under the epoch of the child running NOW (one process under one
 * sessiond boot), and `undefined` — follow from head, replay nothing — in
 * every other case. No entry, or a mark from another process or a sessiond
 * that has since restarted, is not a small gap to paper over: a restarted hub
 * has already reset its dashboards and had them re-read history, and another
 * process's seqs name lines of another ring. Inventing history to fill either
 * is the failure this rule exists to prevent.
 */
export const resumeCursor = (
  epoch: string | undefined,
  mark: IngestMark | undefined
): number | undefined =>
  mark !== undefined && epoch !== undefined && mark.epoch === epoch
    ? mark.srcSeq
    : undefined;

/**
 * AT MOST ONCE, per (instanceId, epoch, srcSeq): whether this line has already
 * become a frame at the hub. The agent asks it before forwarding and the hub
 * asks it before sequencing — the same predicate on both sides, so the two can
 * only ever agree on what a duplicate is.
 */
export const alreadyIngested = (
  mark: IngestMark | undefined,
  provenance: FrameProvenance | undefined
): boolean =>
  provenance !== undefined &&
  mark !== undefined &&
  mark.epoch === provenance.srcEpoch &&
  provenance.srcSeq <= mark.srcSeq;
