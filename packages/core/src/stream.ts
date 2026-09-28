/**
 * The Ledger Protocol: one canonical, ordered event stream per session, and
 * every operator action an acknowledged transaction.
 *
 * WHY (JOURNEY.md, cross-cutting error state): "an empty surface must assert
 * that the connection is live before it is allowed to claim zero" — and its
 * generalisation: a client must never render a guess as truth. The dashboard's
 * historical failure class (fabricated echoes, invented timestamps, banners on
 * healthy connects, seams like `absorbLive` reconciling client guesses with
 * server state) all follow from state being duplicated or inferred client-side.
 * This protocol removes the inference: the hub assigns each session a monotonic
 * sequence, clients follow it gap-free or resynchronise explicitly, and
 * commands carry ids the hub acknowledges stage by stage. It is the only way
 * a session's frames reach a dashboard: the hub and the dashboard ship
 * together, so there is no older dialect to negotiate.
 */

/**
 * One event on a session's canonical stream. `seq` is hub-assigned, monotonic
 * per session, starting at 1 — and NO GAP is ever delivered: a client that
 * observes `seq > lastSeq + 1` re-subscribes with `afterSeq = lastSeq` instead
 * of applying the delta.
 */
export interface SessionStreamEvent {
  /** The existing relay frame payload, verbatim. The stream orders; it does not reshape. */
  frame: unknown;
  seq: number;
  /** The instance id — what the dashboard calls a viewId. */
  sessionId: string;
}

/**
 * Client → hub. `afterSeq` present is a resume ("I have up to here — replay the
 * rest"); absent is a fresh join ("start me from now", history arriving through
 * the existing read paths as today).
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
 * an honest refusal, never a partial replay. The client re-reads history
 * through the existing paths, then follows from `nextSeq`.
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
  reason?: string;
  stage: "accepted" | "applied" | "failed";
  type: "command.ack";
}

/** Everything the stream protocol can put on the dashboard socket. */
export type StreamServerMessage =
  | StreamBacklog
  | StreamReset
  | StreamDelta
  | CommandAck;
export type StreamClientMessage = StreamSubscribe | CommandEnvelope;

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

/**
 * How one instance was configured to run: the fields a relaunch must carry to
 * be the same session rather than a default-shaped one.
 *
 * A custody hand-off respawns the child, and everything not named here is
 * reconstructed from the harness's defaults. `permissionMode` is the one that
 * bites: a session the operator put on `bypassPermissions` came back on
 * `default` — asking for every tool call — because the row the hand-off built
 * its spawn from was a survivor sessiond named, and a survivor carries only
 * what sessiond knows, which is a pid and a cwd.
 */
export interface InstanceSpec {
  canDelegate?: boolean;
  denyTools?: string[];
  effort?: string;
  model?: string;
  permissionMode?: string;
  skills?: string[];
  workflowRunId?: string;
  workflowStepId?: string;
}

/** `register`'s ack, with the ledger the returning agent reattaches against. */
export interface RegisterAckPayload {
  /**
   * Per instance id. ABSENT from a hub that predates this — which is not an
   * empty ledger: the difference is what stops an agent replaying a backlog
   * into a hub that never asked for one. Both readings land on the same safe
   * behaviour (follow from head), and {@link readIngested} keeps them apart
   * anyway.
   */
  ingested?: Record<string, IngestMark>;
  ok: true;
  /**
   * Per instance id, and additive in exactly the way `ingested` is: a hub that
   * predates it sends nothing and the agent relaunches on harness defaults,
   * which is the behaviour this replaces rather than a new failure mode.
   *
   * The hub is the only party that still knows these. sessiond holds the child
   * but not the intent behind it, and the agent that did know died — so a
   * survivor adopted after a restart has no other source for them.
   */
  specs?: Record<string, InstanceSpec>;
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
 * The spawn specs off a register ack, read the way the ledger above is read:
 * anything malformed drops out rather than travelling as a half-spec, and a
 * missing field stays missing so the caller spreads nothing for it.
 *
 * `undefined` when the hub said nothing at all, which an older hub does, and
 * which leaves a relaunch exactly where it was before this field existed.
 */
export const readSpecs = (
  payload: unknown
): Record<string, InstanceSpec> | undefined => {
  const specs = record(record(payload)?.specs);
  if (!specs) {
    return undefined;
  }
  const read: Record<string, InstanceSpec> = {};
  for (const [instanceId, value] of Object.entries(specs)) {
    const spec = record(value);
    if (!spec) {
      continue;
    }
    const named: InstanceSpec = {};
    for (const field of ["effort", "model", "permissionMode"] as const) {
      const at = spec[field];
      if (typeof at === "string" && at.length > 0) {
        named[field] = at;
      }
    }
    if (Object.keys(named).length > 0) {
      read[instanceId] = named;
    }
  }
  return read;
};

/**
 * THE HONEST-LOSS RULE (design §7), as one function both ends read.
 *
 * The cursor a reattaching agent subscribes with: the hub's own mark when it
 * was minted under the sessiond epoch that is running NOW, and `undefined` —
 * follow from head, replay nothing — in every other case. No entry, or a mark
 * from a sessiond that has since restarted, is not a small gap to paper over:
 * a restarted hub has already reset its dashboards and had them re-read
 * history, and a restarted sessiond's children are gone with the seqs that
 * named their lines. Inventing history to fill either is the failure this rule
 * exists to prevent.
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
