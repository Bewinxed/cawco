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
 *
 * Two things hold across every version, because an older page finds its way
 * out through them: the snapshot is `kind: "instances"`, and it carries
 * `protocol`.
 */
export const WIRE_PROTOCOL = 6;

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
 * again after a reconnect. Absent is a fresh join ("start me from now").
 */
export interface StreamSubscribe {
  afterSeq?: number;
  sessionId: string;
  type: "stream.subscribe";
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

/** Everything the stream protocol can put on the dashboard socket. */
export type StreamServerMessage =
  | StreamBacklog
  | StreamReset
  | StreamDelta
  | CommandAck
  | import("./plan").PlanSnapshot
  | import("./plan").PlanDelta;
export type StreamClientMessage =
  | StreamSubscribe
  | CommandEnvelope
  | import("./plan").PlanResync;

// ---------------------------------------------------------------------------
// The ingest ledger (sessiond design §7): joining sessiond's per-child line
// sequence to this protocol's per-session `seq`.
// ---------------------------------------------------------------------------

/**
 * Where a frame came from: the sessiond line it was derived from, named by the
 * daemon's per-boot `epoch` and that line's `srcSeq`.
 *
 * Additive on the `frames` message, exactly as this protocol requires of every
 * shape here: an agent that has no sessiond behind it (opencode, pi, a legacy
 * build) sends frames without it, and a hub that predates the field ignores it.
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

/** `register`'s ack, with the ledger the returning agent reattaches against. */
export interface RegisterAckPayload {
  addressContract?: true;
  /**
   * This hub process, random at its start: an agent that last saw another
   * epoch knows the hub restarted since, and that every connection a harness
   * held to it (OpenCode's MCP streams) went with it.
   */
  hubEpoch: string;
  /**
   * Per instance id. ABSENT from a hub that predates this — which is not an
   * empty ledger: the difference is what stops an agent replaying a backlog
   * into a hub that never asked for one. Both readings land on the same safe
   * behaviour (follow from head), and {@link readIngested} keeps them apart
   * anyway.
   */
  ingested?: Record<string, IngestMark>;
  ok: true;
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

/**
 * The ledger off a register ack. `undefined` when the hub said nothing — an
 * old-shape ack is tolerated, never fatal, and leaves every instance following
 * from head (design §7's honest-loss rule).
 */
export const readIngested = (
  payload: unknown
): Record<string, IngestMark> | undefined => {
  const marks = record(record(payload)?.ingested);
  if (!marks) {
    return undefined;
  }
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
