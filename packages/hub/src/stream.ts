/**
 * The Ledger Protocol, hub side: one canonical, ordered event stream per
 * session, and every operator action an acknowledged transaction.
 *
 * WHY (JOURNEY.md): a client must never render a guess as truth. Today a
 * dashboard learns a session's state by watching frames go past — so a dropped
 * socket, a reconnect, or a late-opened tab leaves it with a plausible-looking
 * transcript that quietly disagrees with the machine. This module makes the hub
 * the author of order: every relayed frame is stamped with a per-session
 * monotonic `seq`, kept in a bounded ring, and handed to followers either
 * gap-free or with an honest {@link StreamReset} that says "I cannot replay
 * that; re-read history and follow from here".
 *
 * WHAT IT IS NOT: this does not re-plumb ingestion. Frames arrive exactly as
 * they always did; {@link StreamHubShape.sequence} wraps the per-frame relay
 * and nothing upstream of it changes. It is the only way a session's frames
 * reach a dashboard; everything else a dashboard hears is broadcast.
 */

import {
  alreadyIngested,
  CONTROL_INTERRUPT,
  CONTROL_SET_EFFORT,
  CONTROL_SET_MODEL,
  CONTROL_SET_PERMISSION_MODE,
  type CommandAck,
  type CommandEnvelope,
  type CommandKind,
  type ControlPayload,
  type Envelope,
  type FramePayload,
  type FrameProvenance,
  type IngestMark,
  RESOLVE_PERMISSION,
  // biome-ignore lint/style/noExportedImports: `export … from` here trips noBarrelFile instead; re-exporting the import is the lesser of the two diagnostics for this one re-exported constant.
  RING_SIZE,
  type SendPayload,
  SessionRing,
  type SessionStreamEvent,
  type StreamBacklog,
  type StreamDelta,
  type StreamReset,
  type StreamSubscribe,
} from "@whiffle/core";
import { type HubSocket, toDashboard } from "./registry";

export { RING_SIZE };

/**
 * A control whose `control_result` never came stops being an ack anybody is
 * waiting for. Mirrors the registry's requester TTL, and for the same reason:
 * a map keyed by request id must not be a place ids go to accumulate.
 */
const COMMAND_TTL_MS = 5 * 60_000;
const SWEEP_INTERVAL_MS = 60_000;

/**
 * How long a silent session keeps its replay window. The ring holds real frame
 * payloads, so a hub that ran for a month would otherwise be holding the last
 * 512 frames of every session it ever relayed — megabytes per session, freed by
 * nothing. After this, the events are dropped and the SEQUENCE IS KEPT: a
 * resume then gets an honest reset instead of a replay, and a session that
 * wakes up carries on counting where it left off rather than restarting at 1
 * under a client that is still following it.
 */
const RING_IDLE_MS = 15 * 60_000;

/** The control method each command kind is allowed to become — and only that one. */
const CONTROL_METHOD: Readonly<Record<Exclude<CommandKind, "send">, string>> = {
  "permission.answer": RESOLVE_PERMISSION,
  interrupt: CONTROL_INTERRUPT,
  "set-model": CONTROL_SET_MODEL,
  "set-permission-mode": CONTROL_SET_PERMISSION_MODE,
  "set-effort": CONTROL_SET_EFFORT,
};

const COMMAND_KINDS = new Set<string>(["send", ...Object.keys(CONTROL_METHOD)]);

/**
 * The `control_result` shape a settled command reads: exactly the frame the
 * daemon already sends back for every control it runs.
 */
export type ControlResultFrame = Extract<
  FramePayload,
  { kind: "control_result" }
>;

/**
 * What this module needs from the hub it lives in. Narrow on purpose: the
 * stream owns ordering and acknowledgement, and borrows the relay rather than
 * reimplementing it — a command does exactly what the hub's relay does.
 */
export interface StreamPorts {
  /** Whether a daemon for this machine is connected right now. */
  readonly isMachineConnected: (machineId: string) => boolean;
  /** The dashboard `control` relay, verbatim — false when the relay refused it. */
  readonly relayControl: (
    envelope: Envelope<ControlPayload>,
    dashboard: HubSocket
  ) => boolean;
  /** The dashboard `send` relay, verbatim — false when the relay refused it. */
  readonly relaySend: (
    envelope: Envelope<SendPayload>,
    dashboard: HubSocket
  ) => boolean;
}

export interface StreamHubShape {
  /**
   * THE INGEST LEDGER (sessiond design §7). Files one frame's provenance and
   * answers whether it may become a hub frame at all: `false` is a line this
   * hub has already ingested under this epoch — a duplicate the caller must
   * drop rather than sequence.
   *
   * A frame with no provenance is always admitted and advances nothing: an
   * opencode session, a pi session and every agent that predates the field are
   * unchanged, and their frames are not deduped by a mark that does not exist.
   */
  readonly admitFrame: (
    instanceId: string,
    provenance: FrameProvenance | undefined
  ) => boolean;
  /** A dashboard socket is gone: it follows nothing and awaits nothing. */
  readonly dropSocket: (socketId: string) => void;
  /** How many sockets follow a session — for tests and for reasoning about fan-out. */
  readonly followerCount: (sessionId: string) => number;
  /**
   * Handles a message on the dashboard socket that belongs to this protocol.
   * Returns true when it consumed it, so the envelope path never sees a shape
   * it would only log as malformed.
   */
  readonly handleClientMessage: (socket: HubSocket, raw: unknown) => boolean;
  /** The last seq assigned to a session; 0 when it has never been relayed. */
  readonly head: (sessionId: string) => number;
  /**
   * What the register ack hands back: the hub's mark for each instance the
   * daemon says it is holding. An instance with no entry is simply absent —
   * "I have nothing of yours", which the agent reads as follow-from-head. Never
   * a zero mark, which would read as "I have line 0 of your current epoch" and
   * ask for a replay of everything.
   */
  readonly ingestedFor: (
    instanceIds: readonly string[]
  ) => Record<string, IngestMark>;
  /**
   * Stamps a relayed frame with the session's next `seq`, files it in the ring
   * and fans it out to that session's followers. Called for EVERY relayed
   * frame, subscribed or not: the sequence is the session's canonical order,
   * not a function of who happens to be listening, and a ring with holes in it
   * could not answer a resume.
   */
  readonly sequence: (sessionId: string, frame: unknown) => SessionStreamEvent;
  /**
   * A `control_result` off an agent socket. Returns true when it answered a
   * command — that reply is that command's ack and nobody else's news, exactly
   * as a routed requester's reply is today.
   */
  readonly settleCommand: (
    requestId: string,
    result: ControlResultFrame
  ) => boolean;
  /** Stops the TTL sweep. */
  readonly stop: () => void;
  /**
   * Runs the housekeeping the interval runs: forgets commands whose reply never
   * came and the replay windows of sessions gone quiet. Returns how many rings
   * it emptied. Exposed so the RULE can be tested without waiting on a clock.
   */
  readonly sweepStale: (now?: number) => number;
}

/** A command dispatched toward a daemon, waiting for the reply that confirms it. */
interface AwaitedCommand {
  readonly at: number;
  readonly commandId: string;
  readonly socketId: string;
}

interface Follower {
  readonly sessions: Set<string>;
  socket: HubSocket;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const nonEmpty = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

export const createStreamHub = (ports: StreamPorts): StreamHubShape => {
  /**
   * One per session ever relayed, and never deleted: the entry that survives an
   * emptied ring is the session's `seq`, which may not restart while any client
   * could still be holding a number from it. What costs memory — the events —
   * is what {@link sweepStale} drops.
   */
  const rings = new Map<string, SessionRing>();
  /** sessionId -> the socket ids following it, so fan-out never scans the fleet. */
  const followers = new Map<string, Set<string>>();
  /** socketId -> everything known about that dashboard, handle included. ONE copy. */
  const sockets = new Map<string, Follower>();
  const awaiting = new Map<string, AwaitedCommand>();
  /**
   * THE INGEST LEDGER: instanceId -> the last sessiond line this hub turned
   * into a frame. Kept for the same reason and with the same lifetime as the
   * sequence in {@link rings}: a mark that vanished would let an agent's next
   * replay re-ingest lines this hub has already relayed, which is the one
   * outcome §7 exists to forbid. One epoch string and one integer per instance.
   */
  const ledger = new Map<string, IngestMark>();

  /**
   * Drops what nothing is waiting for any more: commands whose reply never
   * came, and the replay windows of sessions that have gone quiet. Takes `now`
   * so the schedule is the interval's business and the rule is testable.
   * Returns how many rings it emptied.
   */
  const sweepStale = (now = Date.now()): number => {
    const staleCommand = now - COMMAND_TTL_MS;
    for (const [requestId, command] of awaiting) {
      if (command.at < staleCommand) {
        awaiting.delete(requestId);
      }
    }

    const idleRing = now - RING_IDLE_MS;
    let emptied = 0;
    for (const ring of rings.values()) {
      if (ring.lastAt >= idleRing || ring.oldest > ring.head) {
        continue;
      }
      ring.forget();
      emptied += 1;
    }
    return emptied;
  };

  const sweep = setInterval(() => sweepStale(), SWEEP_INTERVAL_MS);
  sweep.unref?.();

  const ringOf = (sessionId: string): SessionRing => {
    const existing = rings.get(sessionId);
    if (existing) {
      return existing;
    }
    const ring = new SessionRing();
    rings.set(sessionId, ring);
    return ring;
  };

  /**
   * One write to one socket. A socket that throws is one that closed without
   * its handler having run yet: it is dropped here rather than left to throw
   * again on the next event and take the rest of the fan-out with it.
   */
  const deliver = (socket: HubSocket, message: unknown): void => {
    try {
      toDashboard(socket, message);
    } catch {
      dropSocket(socket.id);
    }
  };

  const dropSocket = (socketId: string): void => {
    const entry = sockets.get(socketId);
    if (entry) {
      for (const sessionId of entry.sessions) {
        const perSession = followers.get(sessionId);
        perSession?.delete(socketId);
        if (perSession && perSession.size === 0) {
          followers.delete(sessionId);
        }
      }
      sockets.delete(socketId);
    }
    for (const [requestId, command] of awaiting) {
      if (command.socketId === socketId) {
        awaiting.delete(requestId);
      }
    }
  };

  const entryFor = (socket: HubSocket): Follower => {
    const existing = sockets.get(socket.id);
    if (existing) {
      // Elysia builds a fresh handle per callback; the newest one is the one
      // that can still be written to.
      existing.socket = socket;
      return existing;
    }
    const entry: Follower = { socket, sessions: new Set() };
    sockets.set(socket.id, entry);
    return entry;
  };

  const ackTo = (socket: HubSocket, ack: CommandAck): void => {
    deliver(socket, ack);
  };

  const fail = (socket: HubSocket, commandId: string, reason: string): void => {
    ackTo(socket, { type: "command.ack", commandId, stage: "failed", reason });
  };

  const sequence = (sessionId: string, frame: unknown): SessionStreamEvent => {
    const event = ringOf(sessionId).record(sessionId, frame);
    const perSession = followers.get(sessionId);
    if (perSession) {
      const delta: StreamDelta = { type: "stream.event", event };
      // Iterated live, no defensive copy: this runs on every frame of every
      // session, and deleting from a Set mid-iteration is well defined — which
      // is exactly what a failed delivery does.
      for (const socketId of perSession) {
        const follower = sockets.get(socketId);
        if (follower) {
          deliver(follower.socket, delta);
        }
      }
    }
    return event;
  };

  /**
   * A follower joins.
   *
   * Registration happens BEFORE the backlog is read, and that order is the
   * whole of the seq-continuity guarantee: this runs to completion inside one
   * socket message callback, so no frame can be sequenced in between. The
   * backlog therefore ends exactly at the `head` observed here, and the first
   * live delta the socket can possibly receive is `head + 1`. Never a
   * duplicate, never a gap, without a buffer-and-splice dance.
   */
  const subscribe = (socket: HubSocket, message: StreamSubscribe): void => {
    const { sessionId } = message;
    const entry = entryFor(socket);
    entry.sessions.add(sessionId);
    const perSession = followers.get(sessionId) ?? new Set<string>();
    perSession.add(socket.id);
    followers.set(sessionId, perSession);

    const ring = ringOf(sessionId);
    // A fresh join asks for nothing: history comes through the existing read
    // paths, and this socket follows from the next frame on.
    if (message.afterSeq === undefined) {
      return;
    }

    const { afterSeq } = message;
    const reset = (): void => {
      const refusal: StreamReset = {
        type: "stream.reset",
        sessionId,
        nextSeq: ring.head + 1,
      };
      deliver(socket, refusal);
    };
    if (!ring.canReplay(typeof afterSeq === "number" ? afterSeq : Number.NaN)) {
      reset();
      return;
    }

    let events: SessionStreamEvent[];
    try {
      events = ring.since(afterSeq);
    } catch (error) {
      // `canReplay` said it could, and it could not. Loud, because that is a
      // broken invariant — and still a reset rather than a partial replay,
      // because the client's alternative to a resync is a plausible lie.
      console.error(`[hub] stream replay failed for ${sessionId}:`, error);
      reset();
      return;
    }

    const backlog: StreamBacklog = {
      type: "stream.backlog",
      sessionId,
      // Empty when the client is already current — an honest "you missed
      // nothing" rather than silence the client cannot tell from a lost reply.
      events,
    };
    deliver(socket, backlog);
  };

  /**
   * Turns a command envelope into the relay call it names, and acknowledges it.
   *
   * The validation here is not ceremony: `payload` is whatever the relay op
   * takes, so without a method check a `set-effort` envelope would be a
   * general-purpose remote call. A kind may only ever become its own method.
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: dispatches every command kind (send vs. each control method) through one shared validate-then-relay pipeline; splitting it would scatter the ordering guarantees documented above across several functions.
  const command = (socket: HubSocket, message: CommandEnvelope): void => {
    const { commandId, kind, sessionId, machineId } = message;
    // Known by id from here on, and with the newest handle: an `applied` ack
    // arrives later, off an agent socket, and has to find a socket to land on
    // even when this dashboard never subscribed to anything.
    entryFor(socket);

    if (!nonEmpty(sessionId)) {
      fail(socket, commandId, "the command names no session");
      return;
    }
    if (!nonEmpty(machineId)) {
      fail(socket, commandId, "the command names no machine");
      return;
    }
    if (!ports.isMachineConnected(machineId)) {
      fail(socket, commandId, `machine ${machineId} is not connected`);
      return;
    }

    const payload = isRecord(message.payload) ? message.payload : undefined;
    if (!payload) {
      fail(socket, commandId, `a ${kind} command carries no payload`);
      return;
    }

    if (kind === "send") {
      if (!isRecord(payload.message)) {
        fail(socket, commandId, "a send command carries no message");
        return;
      }
      const sent = ports.relaySend(
        {
          verb: "send",
          machineId,
          instanceId: sessionId,
          // The envelope's session is authoritative: the payload's own copy is
          // normalised onto it so the two can never disagree on the wire.
          payload: {
            ...payload,
            instanceId: sessionId,
          } as unknown as SendPayload,
        },
        socket
      );
      if (!sent) {
        fail(socket, commandId, `machine ${machineId} is not connected`);
        return;
      }
      // No confirmation exists to wait for: the daemon's `send` answers with
      // the turn itself. `accepted` is the last honest word the hub has, and
      // the sequenced frames that follow are the proof of application.
      ackTo(socket, {
        type: "command.ack",
        commandId,
        stage: "accepted",
      });
      return;
    }

    const method = CONTROL_METHOD[kind];
    if (nonEmpty(payload.method) && payload.method !== method) {
      fail(
        socket,
        commandId,
        `a ${kind} command may not call ${payload.method}`
      );
      return;
    }
    if (payload.args !== undefined && !Array.isArray(payload.args)) {
      fail(socket, commandId, `a ${kind} command's args are not a list`);
      return;
    }

    // An answer names the permission it settles — the request id IS the
    // question, so it can only come from the client. Every other control is
    // correlated by an id the hub mints, which also makes the reply
    // unforgeable from the dashboard side.
    const requestId =
      kind === "permission.answer"
        ? // biome-ignore lint/style/noNestedTernary: an answer's request id must come from the client verbatim (or be absent), while every other control mints its own; the two branches are not a simplifiable condition.
          nonEmpty(payload.requestId)
          ? payload.requestId
          : undefined
        : crypto.randomUUID();
    if (!requestId) {
      fail(socket, commandId, "a permission answer names no request");
      return;
    }
    // A double-click, or two devices answering the same card. The first answer
    // is already in flight and owns the reply; a second dispatch would settle
    // the parked ask twice and orphan the first command at `accepted` forever.
    if (awaiting.has(requestId)) {
      fail(socket, commandId, "that request is already being answered");
      return;
    }

    const control: ControlPayload = {
      ...payload,
      instanceId: sessionId,
      requestId,
      method,
      args: (payload.args as unknown[] | undefined) ?? [],
    };

    // Registered BEFORE dispatch: the daemon is free to answer inside the same
    // tick, and an ack that arrives before anyone is waiting for it is an ack
    // that never arrives.
    awaiting.set(requestId, { commandId, socketId: socket.id, at: Date.now() });
    const relayed = ports.relayControl(
      {
        verb: "control",
        machineId,
        instanceId: sessionId,
        requestId,
        payload: control,
      },
      socket
    );
    if (!relayed) {
      awaiting.delete(requestId);
      fail(socket, commandId, `machine ${machineId} is not connected`);
      return;
    }
    ackTo(socket, { type: "command.ack", commandId, stage: "accepted" });
  };

  const settleCommand = (
    requestId: string,
    result: ControlResultFrame
  ): boolean => {
    const awaited = awaiting.get(requestId);
    if (!awaited) {
      return false;
    }
    awaiting.delete(requestId);
    const socket = sockets.get(awaited.socketId)?.socket;
    // The commanding socket is gone; the reply is still consumed — it answered
    // a command, so it is not fleet news to broadcast at everyone else.
    if (!socket) {
      return true;
    }
    ackTo(
      socket,
      result.ok
        ? {
            type: "command.ack",
            commandId: awaited.commandId,
            stage: "applied",
          }
        : {
            type: "command.ack",
            commandId: awaited.commandId,
            stage: "failed",
            reason:
              result.error ?? "the machine could not carry out that request",
          }
    );
    return true;
  };

  const handleClientMessage = (socket: HubSocket, raw: unknown): boolean => {
    if (!isRecord(raw) || typeof raw.type !== "string") {
      return false;
    }

    if (raw.type === "stream.subscribe") {
      if (!nonEmpty(raw.sessionId)) {
        console.warn("[hub] dropped stream.subscribe with no session", raw);
        return true;
      }
      subscribe(socket, {
        type: "stream.subscribe",
        sessionId: raw.sessionId,
        // A malformed resume is NOT a fresh join: `undefined` would silently
        // start the client from now and lose whatever it thought it had, so it
        // is passed through as-is and answered with a reset.
        ...(raw.afterSeq === undefined
          ? {}
          : { afterSeq: raw.afterSeq as number }),
      });
      return true;
    }

    if (raw.type === "command") {
      if (!nonEmpty(raw.commandId)) {
        console.warn("[hub] dropped command with no id", raw);
        return true;
      }
      if (!COMMAND_KINDS.has(raw.kind as string)) {
        fail(socket, raw.commandId, `unknown command kind ${String(raw.kind)}`);
        return true;
      }
      command(socket, raw as unknown as CommandEnvelope);
      return true;
    }

    return false;
  };

  /**
   * AT MOST ONCE, per (instanceId, epoch, srcSeq) — the invariant this whole
   * leaf exists for.
   *
   * - No provenance: admitted, and any mark this instance had is RETIRED. A
   *   frame the agent cannot tie to a ring line (no uuid to match it by) says
   *   nothing about where the hub stands, and keeping the old mark would hand
   *   the next reattach a cursor into a stretch the hub has since ingested by
   *   another route, and the replay would double it. An absent mark is the
   *   honest answer there, and the honest-loss rule handles it.
   * - A DIFFERENT epoch than the mark: admitted, and the mark is replaced. The
   *   epoch names one child process under one sessiond boot, so a relaunch or
   *   a new sessiond is a new sequence space; the old cursor is meaningless
   *   against it (the same reading `SessionRing.canReplay` gives a resume whose
   *   `afterSeq` exceeds `head` — "seqs belong to a dead epoch").
   * - The same epoch, at or below the mark: REFUSED. This hub has already
   *   ingested that line; a replay that overshoots is a duplicate, not news.
   * - The same epoch, above the mark: admitted, and the mark advances to it.
   *   A jump of more than one is not a hole to hide — lines that produce no
   *   frame (a `control_request`, a non-JSON line) advance no ledger by design,
   *   and a ring overflow arrives as its own announced `sessiond_stream_gap`
   *   frame rather than as a silent splice.
   */
  const admitFrame = (
    instanceId: string,
    provenance: FrameProvenance | undefined
  ): boolean => {
    if (!provenance) {
      ledger.delete(instanceId);
      return true;
    }
    if (alreadyIngested(ledger.get(instanceId), provenance)) {
      return false;
    }
    ledger.set(instanceId, {
      epoch: provenance.srcEpoch,
      srcSeq: provenance.srcSeq,
    });
    return true;
  };

  const ingestedFor = (
    instanceIds: readonly string[]
  ): Record<string, IngestMark> => {
    const marks: Record<string, IngestMark> = {};
    for (const instanceId of instanceIds) {
      const mark = ledger.get(instanceId);
      if (mark) {
        marks[instanceId] = { ...mark };
      }
    }
    return marks;
  };

  return {
    sequence,
    admitFrame,
    ingestedFor,
    handleClientMessage,
    settleCommand,
    dropSocket,
    head: (sessionId) => rings.get(sessionId)?.head ?? 0,
    followerCount: (sessionId) => followers.get(sessionId)?.size ?? 0,
    sweepStale,
    stop: () => clearInterval(sweep),
  };
};
