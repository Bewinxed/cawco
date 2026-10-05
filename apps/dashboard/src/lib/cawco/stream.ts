/**
 * The Ledger Protocol, client side — kept out of the runes module so it can be
 * reasoned about on its own.
 *
 * Everything here is structural: it moves numbers and stages around a plain
 * object and calls out through {@link StreamHost} for the two things it cannot
 * do itself (apply a frame, re-read a transcript). `client.svelte.ts` owns the
 * runes binding and the socket; this file owns the decisions. It is the only
 * way a session's frames reach this client, and the only way a command leaves.
 *
 * The rules it enforces, in one place:
 *
 * - A session's events are applied EXACTLY once, in order, with no holes. A
 *   delta one past the cursor applies; one at or behind it is a duplicate and
 *   is dropped; one beyond it is a hole, and a hole is never papered over —
 *   nothing is buffered and nothing is applied, the client re-subscribes from
 *   what it actually has and the hub replays the middle.
 * - A backlog is checked, not trusted: contiguous from the cursor or it is a
 *   protocol violation, said once and re-subscribed rather than half-applied.
 * - A reset is the hub admitting the gap is unrecoverable. The client re-reads
 *   history through the path it already has and follows from `nextSeq`.
 * - A command is a transaction with a stage the UI can read, and stages only
 *   ever move forward.
 */

import type {
  CommandAck,
  CommandEnvelope,
  CommandKind,
  SessionStreamEvent,
  StreamBacklog,
  StreamClientMessage,
  StreamDelta,
  StreamReset,
} from "@cawco/core";

/** How long a submitted command may go unacknowledged before it is called off. */
export const COMMAND_ACK_TIMEOUT_MS = 15_000;

/** How many settled commands are kept for the UI to read back. */
export const SETTLED_COMMAND_LIMIT = 50;

/** How long a settled command stays readable before it is forgotten. */
export const SETTLED_COMMAND_TTL_MS = 5 * 60_000;

/**
 * How many times a gap may be re-subscribed before the client stops believing
 * the ring can heal it and asks for the history instead. Without this a hub
 * that answers every resume with the same unusable backlog is a livelock.
 */
export const MAX_RESYNC_ATTEMPTS = 3;

/** What the client knows about one session's place in its stream. */
export interface SessionCursor {
  /** The highest seq applied. Meaningless until {@link seen}. */
  lastSeq: number;
  /**
   * The session's transcript page is being read. Its events are not applied
   * meanwhile: the page carries what they did, and the resume from the page's
   * `seq` replays the rest out of the hub's ring.
   */
  reading: boolean;
  /**
   * The `afterSeq` of the resume that is out, or null when none is. One resume
   * per gap: a burst of fifty out-of-order deltas is one hole, not fifty.
   */
  resyncAfter: number | null;
  /** Consecutive resumes that failed to heal the gap — see {@link MAX_RESYNC_ATTEMPTS}. */
  resyncFailures: number;
  /**
   * Whether any event has been applied. Before the first one the client has no
   * origin, so it adopts whatever seq the hub sends first rather than reading
   * `lastSeq = 0` as a hole back to the beginning of the session.
   */
  seen: boolean;
  /** A `stream.subscribe` for this session has gone out on the current socket. */
  subscribed: boolean;
  /** A protocol violation has been reported for this session; don't repeat it. */
  warned: boolean;
}

export type CommandStage = "submitted" | "accepted" | "applied" | "failed";

/**
 * The stage at which the PROTOCOL has said its last word about a command —
 * after which nothing further is owed and waiting longer is waiting for a
 * message that will never come.
 *
 * It is not the same for every kind, and that is the hub's doing, not a
 * convenience: a `send` is answered `accepted` and never `applied`, because
 * "no confirmation exists to wait for — the daemon's `send` answers with the
 * turn itself" (`packages/hub/src/stream.ts`, the send branch of `command()`;
 * `accepted` is called there "the last honest word the hub has"). The control
 * kinds do get a second word: their `control_result` comes back as `applied`.
 *
 * So the settle stage rides the SUBMISSION, where the caller already knows
 * which kind it is dispatching, rather than being re-derived from `kind` at
 * every place that has to ask "is this one finished?". One field, decided
 * once, read by the sweep, the disconnect and the effects hook alike.
 */
export type SettleStage = "accepted" | "applied";

/** One operator action, from the click to the hub's last word on it. */
export interface CommandRecord {
  /** When it was submitted. */
  at: number;
  /** When the stage last moved — what pruning and "how long has this been out" read. */
  changedAt: number;
  commandId: string;
  /** The stream-dialect local half still owed an outcome; see {@link StreamEffects}. */
  effects?: StreamEffects;
  envelope?: CommandEnvelope;
  kind: CommandKind;
  outcome?: CommandAck["outcome"];
  reason?: string;
  sessionId: string;
  /** Copied from the submission: the stage this kind is finished at. See {@link SettleStage}. */
  settlesAt: SettleStage;
  stage: CommandStage;
  /**
   * Set only when this tab KNOWS the envelope never left it — a refused or
   * throwing dispatch, or a failure before the wire was reached at all.
   *
   * The distinction is not cosmetic. A record failed by the ack timeout or by
   * a dropped socket is *ambiguous*: the envelope may be sitting in the hub's
   * hands, already relayed to a daemon that is acting on the world. Re-sending
   * one of those can duplicate an instruction; re-sending an undelivered one
   * cannot. The two therefore may not be offered with the same one-tap
   * confidence, and the honest answer is a fact on the record rather than a
   * guess read off the reason string.
   */
  undelivered?: boolean;
  /** Retained in this tab until the hub can take it. */
  waiting?: boolean;
}

/** Everything the stream half of the store keeps. Plain data, so a runes module can `$state` it. */
export interface StreamState {
  commands: Record<string, CommandRecord>;
  cursors: Record<string, SessionCursor>;
  /**
   * The handle of the ONE armed ack timer, or null when nothing is waiting.
   *
   * One, and it lives on the state rather than in a module closure, because
   * the alternatives are both worse: a timer per record leaks one per keystroke
   * on a flapping socket, and a module-level handle cannot be torn down by a
   * caller holding a state it built itself. See {@link armCommandSweep}.
   */
  sweepTimer: number | null;
}

/** The two things the logic cannot do itself, plus its clock and its voice. */
export interface StreamHost {
  /**
   * THE CHOKEPOINT. Apply one relay frame to the session it belongs to,
   * given the unwrapped frame. The stream orders; it does not reshape.
   */
  // biome-ignore lint/style/useConsistentMethodSignatures: property-style signatures check contravariantly; client.svelte.ts's streamHost object literal implements this port and a switch could reject that assignment.
  applyFrame(sessionId: string, frame: unknown): void;
  clearTimer?: (handle: number) => void;
  /** Whether the dashboard follows this session's stream: a tab, the peek, a watched delegate. */
  // biome-ignore lint/style/useConsistentMethodSignatures: property-style signatures check contravariantly; client.svelte.ts's streamHost object literal implements this port and a switch could reject that assignment.
  follows(sessionId: string): boolean;
  /**
   * Called once, the moment any command record settles at `failed`, whatever
   * killed it — a refusing ack, a dispatch that could not leave the tab, the
   * timeout sweep, a dropped socket.
   *
   * It exists because `advanceStage` is the ONE place a record can reach
   * `failed`, and a failure surface built anywhere else
   * would have to be built six times (once per command kind) and would still
   * miss the seventh kind somebody adds next year. A kind whose failure has
   * no inline surface of its own is heard here or nowhere.
   *
   * Optional so the logic stays testable without a voice; the client passes
   * one. Whoever implements it decides which failures are already spoken for
   * by a surface that owns them (a send's ghost row, a permission card) and
   * which need announcing — this file only guarantees the call.
   */
  noteFailure?: (record: CommandRecord) => void;
  // biome-ignore lint/style/useConsistentMethodSignatures: property-style signatures check contravariantly; client.svelte.ts's streamHost object literal implements this port and a switch could reject that assignment.
  now(): number;
  /**
   * Read this session's newest transcript page; the read ends in
   * {@link adoptPage}, which resumes the stream from the page's `seq`.
   */
  // biome-ignore lint/style/useConsistentMethodSignatures: property-style signatures check contravariantly; client.svelte.ts's streamHost object literal implements this port and a switch could reject that assignment.
  rereadHistory(sessionId: string): void;
  /** Put a client message on the dashboard socket; false when it is not open. */
  // biome-ignore lint/style/useConsistentMethodSignatures: property-style signatures check contravariantly; client.svelte.ts's streamHost object literal implements this port and a switch could reject that assignment.
  sendToHub(message: StreamClientMessage): boolean;
  /**
   * Run `run` after `delayMs` and hand back a handle {@link clearTimer} can
   * cancel — `setTimeout`, in the one place this file is allowed to know that.
   *
   * Optional, and its absence is not a fallback to some other timing: without
   * it the ack timeout is only enforced when {@link sweepCommands} is called
   * from outside, which is exactly the hole this port closes. A tab whose
   * socket has gone quiet receives nothing, so a sweep driven by inbound
   * traffic never runs, and an undelivered message sits at `submitted`
   * forever — a permanent ghost, no failure, nothing said. Tests leave it
   * unset to drive the clock by hand; the client passes one.
   */
  setTimer?: (delayMs: number, run: () => void) => number;
  // biome-ignore lint/style/useConsistentMethodSignatures: property-style signatures check contravariantly; client.svelte.ts's streamHost object literal implements this port and a switch could reject that assignment.
  warn(message: string, detail?: unknown): void;
}

export function createStreamState(): StreamState {
  return { cursors: {}, commands: {}, sweepTimer: null };
}

function newCursor(): SessionCursor {
  return {
    lastSeq: 0,
    reading: false,
    seen: false,
    subscribed: false,
    resyncAfter: null,
    resyncFailures: 0,
    warned: false,
  };
}

function cursorFor(state: StreamState, sessionId: string): SessionCursor {
  // Written then read back: under `$state` the write lands on the proxy, and
  // holding the literal would file every later mutation where nothing sees it.
  state.cursors[sessionId] ??= newCursor();
  return state.cursors[sessionId];
}

/* ------------------------------------------------------------------ *
 * Subscriptions
 * ------------------------------------------------------------------ */

/**
 * Subscribes a session's stream: a resume when this client already has a
 * cursor (the hub replays the middle out of its ring, or refuses honestly with
 * a reset), a fresh join when it does not.
 */
/**
 * Puts one message on the wire and answers with the REASON it did not go,
 * or `null` when it did. The one door out of this file, and it never throws.
 *
 * `StreamHost.sendToHub` returns false for the socket it can see is shut, but
 * a socket can also shut BETWEEN that check and the `send()` that follows it,
 * and `WebSocket.send` on a CLOSING/CLOSED socket throws `InvalidStateError`.
 * Unguarded, that throw walked straight out of {@link submitCommand} — the one
 * function in the codebase that promises never to throw — through the client
 * wrapper and into a click handler as an unhandled rejection: the original
 * silent-failure bug, one layer down. A dispatch that cannot happen is a
 * refusal, and a refusal is a stage, so it is converted here rather than
 * anywhere it might be forgotten.
 */
function dispatch(
  host: StreamHost,
  message: StreamClientMessage
): string | null {
  try {
    if (host.sendToHub(message)) {
      return null;
    }
    return "Not connected to the hub. Check that it is running, then try again.";
  } catch (error) {
    return messageOf(error);
  }
}

export function subscribeSession(
  state: StreamState,
  host: StreamHost,
  sessionId: string
): void {
  const cursor = cursorFor(state, sessionId);
  const afterSeq = cursor.seen ? cursor.lastSeq : undefined;
  const refusal = dispatch(host, {
    type: "stream.subscribe",
    sessionId,
    ...(afterSeq === undefined ? {} : { afterSeq }),
  });
  if (refusal !== null) {
    return;
  }
  cursor.subscribed = true;
  // A resume IS an outstanding resync: a delta that lands ahead of the replay
  // must not send a second one for the same hole.
  cursor.resyncAfter = afterSeq ?? null;
}

/**
 * Brings the subscribed set into line with what the dashboard is watching:
 * resumes what it has followed before and forgets what has been closed. A
 * session it has not read yet is followed once its transcript page lands
 * ({@link adoptPage}) — the pane that shows it is what reads it.
 *
 * Forgetting drops the cursor with it, so a session re-opened later is read
 * again rather than resumed from a seq the ring has long since dropped.
 */
export function syncStreamSubscriptions(
  state: StreamState,
  host: StreamHost,
  sessionIds: string[]
): void {
  const wanted = new Set(sessionIds);
  for (const sessionId of Object.keys(state.cursors)) {
    if (!wanted.has(sessionId)) {
      delete state.cursors[sessionId];
    }
  }
  for (const sessionId of wanted) {
    const cursor = state.cursors[sessionId];
    if (cursor?.seen && !cursor.subscribed && !cursor.reading) {
      subscribeSession(state, host, sessionId);
    }
  }
}

/**
 * A transcript page read has started: the session's events wait for it.
 * Applied meanwhile, they would land on the transcript the page replaces.
 */
export function beginRead(state: StreamState, sessionId: string): void {
  cursorFor(state, sessionId).reading = true;
}

/**
 * A transcript page landed, read at `seq`: the session's stream resumes from
 * there when the dashboard follows it. The hub replays what came after out of
 * its ring, or resets honestly when the page took longer than the ring holds.
 * One it does not follow keeps the place, for whenever it does.
 */
export function adoptPage(
  state: StreamState,
  host: StreamHost,
  sessionId: string,
  seq: number
): void {
  const cursor = cursorFor(state, sessionId);
  cursor.reading = false;
  cursor.lastSeq = seq;
  cursor.seen = true;
  cursor.resyncFailures = 0;
  cursor.warned = false;
  if (host.follows(sessionId)) {
    subscribeSession(state, host, sessionId);
  }
}

/**
 * The socket dropped.
 *
 * Cursors keep their `lastSeq` — that number is the whole point of the ring,
 * and the reconnect resumes from it — but every subscription and every resume
 * died with the connection, and so did any acknowledgement still owed.
 *
 * `host` is optional for the same reason it is on {@link sweepCommands}, and
 * carries the same warning: without it these failures are recorded but not
 * announced.
 */
export function noteDisconnect(
  state: StreamState,
  now: number,
  host?: StreamHost
): void {
  for (const cursor of Object.values(state.cursors)) {
    cursor.subscribed = false;
    cursor.resyncAfter = null;
  }
  for (const record of Object.values(state.commands)) {
    // Record-aware: a send already `accepted` was handed over before the socket
    // died and is not the connection's to take back.
    if (isSettled(record)) {
      continue;
    }
    if (record.kind === "send") {
      record.waiting = true;
      continue;
    }
    // Through advanceStage, not a raw write: a dying socket is a settling like
    // any other, and an optimistic value whose command it took down must roll
    // back here exactly as it would on a refusal.
    advanceStage(
      record,
      "failed",
      now,
      "The connection to the hub dropped before that finished.",
      host
    );
  }
  // Nothing is outstanding any more, so nothing should be waited for. Without
  // this the timer would survive the socket that gave it a reason to exist.
  if (host) {
    armCommandSweep(state, host);
  }
}

/* ------------------------------------------------------------------ *
 * Ingestion
 * ------------------------------------------------------------------ */

const STREAM_MESSAGE_TYPES = new Set([
  "stream.event",
  "stream.backlog",
  "stream.reset",
  "command.ack",
]);

/**
 * Takes one inbound socket message if it belongs to this protocol, and says so.
 * A message it does not take is a broadcast envelope — the board, a pulse, a
 * permission, a reply — for the caller to apply.
 */
export function handleStreamMessage(
  state: StreamState,
  host: StreamHost,
  message: unknown
): boolean {
  if (typeof message !== "object" || message === null) {
    return false;
  }
  const { type } = message as { type?: unknown };
  if (typeof type !== "string" || !STREAM_MESSAGE_TYPES.has(type)) {
    return false;
  }

  switch (type) {
    case "stream.event":
      applyDelta(state, host, message as StreamDelta);
      return true;
    case "stream.backlog":
      applyBacklog(state, host, message as StreamBacklog);
      return true;
    case "stream.reset":
      applyReset(state, host, message as StreamReset);
      return true;
    case "command.ack":
      noteCommandAck(state, message as CommandAck, host.now(), host);
      return true;
    default:
      return false;
  }
}

/** What a delta did, for tests and for anyone reading a trace. */
export type DeltaOutcome = "applied" | "duplicate" | "gap" | "malformed";

function applyDelta(
  state: StreamState,
  host: StreamHost,
  message: StreamDelta
): DeltaOutcome {
  const { event } = message;
  if (
    !event ||
    typeof event.seq !== "number" ||
    typeof event.sessionId !== "string"
  ) {
    host.warn("stream: a delta arrived without a sequenced event", message);
    return "malformed";
  }
  const cursor = cursorFor(state, event.sessionId);
  // A page read is out: what this event did is in the page, or after its
  // `seq`, which the resume that ends the read replays.
  if (cursor.reading) {
    return "duplicate";
  }

  // No origin yet: the hub's first word IS the origin. Reading `lastSeq = 0` as
  // a hole here would make every late join demand a replay of a whole session.
  if (!cursor.seen) {
    cursor.lastSeq = event.seq - 1;
  }

  if (event.seq <= cursor.lastSeq) {
    return "duplicate";
  }

  if (event.seq > cursor.lastSeq + 1) {
    // A hole. Nothing is applied and NOTHING IS BUFFERED: the replay the resume
    // asks for carries these events again, and a buffer here would be a second,
    // slower copy of the hub's ring with its own bugs.
    requestResync(host, event.sessionId, cursor);
    return "gap";
  }

  applyEvent(host, cursor, event);
  return "applied";
}

function applyEvent(
  host: StreamHost,
  cursor: SessionCursor,
  event: SessionStreamEvent
): void {
  const { frame } = event;
  if (typeof frame === "object" && frame !== null) {
    host.applyFrame(event.sessionId, frame);
  } else if (!cursor.warned) {
    // A sequenced event the hub could not fill. The cursor still advances: this
    // seq happened, and refusing to move past it would turn one empty event
    // into a permanent hole and an endless resume.
    cursor.warned = true;
    host.warn(
      `stream: an event arrived with no frame for ${event.sessionId}`,
      event.seq
    );
  }
  cursor.lastSeq = event.seq;
  cursor.seen = true;
  // A session the hub is streaming to us is one it considers subscribed, even
  // if this tab has not yet sent the subscribe that says so.
  cursor.subscribed = true;
}

/** Asks for the replay, once per hole. */
function requestResync(
  host: StreamHost,
  sessionId: string,
  cursor: SessionCursor
): void {
  if (cursor.resyncAfter === cursor.lastSeq) {
    return;
  }
  const refusal = dispatch(host, {
    type: "stream.subscribe",
    sessionId,
    afterSeq: cursor.lastSeq,
  });
  // A resume that never left cannot be waited for: leaving `resyncAfter` unset
  // means the next delta through the hole tries again.
  if (refusal !== null) {
    return;
  }
  cursor.subscribed = true;
  cursor.resyncAfter = cursor.lastSeq;
}

function applyBacklog(
  state: StreamState,
  host: StreamHost,
  message: StreamBacklog
): void {
  const { sessionId } = message;
  const events = Array.isArray(message.events) ? message.events : [];
  const cursor = cursorFor(state, sessionId);
  cursor.subscribed = true;
  // The page being read carries these; the resume that ends the read asks again.
  if (cursor.reading) {
    return;
  }

  if (events.length === 0) {
    // "Nothing to replay" is a complete answer, and a healed one.
    cursor.resyncAfter = null;
    cursor.resyncFailures = 0;
    return;
  }

  if (!cursor.seen) {
    cursor.lastSeq = events[0].seq - 1;
  }

  let broken = false;
  for (const event of events) {
    // A backlog re-sent after a retried resume repeats what is already applied.
    // Dropping by seq is what makes that harmless rather than a doubled turn.
    if (event.seq <= cursor.lastSeq) {
      continue;
    }
    if (event.seq !== cursor.lastSeq + 1) {
      broken = true;
      break;
    }
    applyEvent(host, cursor, event);
  }

  if (!broken) {
    cursor.resyncAfter = null;
    cursor.resyncFailures = 0;
    cursor.warned = false;
    return;
  }

  // The hub promised contiguity and did not deliver it. Say it once — a broken
  // hub would otherwise fill the console faster than anyone can read it — keep
  // the prefix that WAS contiguous, and ask again from there.
  if (!cursor.warned) {
    cursor.warned = true;
    host.warn(`stream: non-contiguous backlog for ${sessionId}`, {
      lastSeq: cursor.lastSeq,
      seqs: events.map((event) => event.seq),
    });
  }
  cursor.resyncFailures += 1;
  cursor.resyncAfter = null;
  if (cursor.resyncFailures >= MAX_RESYNC_ATTEMPTS) {
    // The ring cannot heal this. Stop asking it to and go and read the truth,
    // exactly as a reset would have us do.
    cursor.resyncFailures = 0;
    cursor.reading = true;
    host.rereadHistory(sessionId);
    return;
  }
  requestResync(host, sessionId, cursor);
}

/**
 * The hub's honest refusal: the gap is older than its ring, so there is nothing
 * to replay. The client reads the newest transcript page again, and the read
 * resumes the stream from the `seq` that page carries; deltas meanwhile wait
 * for it ({@link SessionCursor.reading}).
 */
function applyReset(
  state: StreamState,
  host: StreamHost,
  message: StreamReset
): void {
  const cursor = cursorFor(state, message.sessionId);
  cursor.reading = true;
  cursor.subscribed = true;
  cursor.resyncAfter = null;
  cursor.resyncFailures = 0;
  cursor.warned = false;
  host.rereadHistory(message.sessionId);
}

/* ------------------------------------------------------------------ *
 * Commands
 * ------------------------------------------------------------------ */

/**
 * Whether the protocol owes this record anything more.
 *
 * Record-aware, and it has to be: `accepted` is a waypoint for a control
 * command and the terminus for a `send` (see {@link SettleStage}). Reading the
 * stage alone — which is what this did until the send's record was rendered —
 * left every delivered message parked as "unanswered" and let the sweep
 * retro-declare it failed fifteen seconds after it had actually landed. The
 * record knows where its own finish line is; ask it.
 */
const isSettled = (record: CommandRecord): boolean =>
  record.stage === "failed" ||
  record.stage === "applied" ||
  (record.stage === "accepted" && record.settlesAt === "accepted");

/** Which stage may follow which. Terminal is terminal: a late ack cannot undo it. */
const NEXT_STAGES: Record<CommandStage, Set<CommandStage>> = {
  submitted: new Set<CommandStage>(["accepted", "applied", "failed"]),
  accepted: new Set<CommandStage>(["applied", "failed"]),
  applied: new Set<CommandStage>(),
  failed: new Set<CommandStage>(),
};

/**
 * Moves a command forward, or leaves it alone. Acks can overtake each other on
 * the wire — an `accepted` landing after the `applied` it preceded must not
 * walk the composer's "Landed." back to "Applying…".
 */
function advanceStage(
  record: CommandRecord,
  stage: CommandStage,
  now: number,
  reason?: string,
  host?: StreamHost
): boolean {
  if (!NEXT_STAGES[record.stage].has(stage)) {
    return false;
  }
  record.stage = stage;
  record.waiting = false;
  record.changedAt = now;
  if (reason !== undefined) {
    record.reason = reason;
  }
  // Records carry the LOCAL half of their operation (see
  // {@link CommandSubmission.streamEffects}); settling is when its outcome
  // hooks run — including a timeout-swept failure, which must roll back an
  // optimistic value exactly like a refused one.
  //
  // "Settling" is the record's own question, not a hard-coded pair of stages:
  // a send that reaches `accepted` is finished, and its echo must go solid
  // then, because no `applied` is ever coming for it. Clearing `effects`
  // before the call is what keeps the hook to exactly one run — a later
  // `applied` on a send that already settled at `accepted` finds nothing left
  // to fire.
  if (isSettled(record)) {
    record.envelope = undefined;
  }
  if (record.effects && isSettled(record)) {
    const { settled } = record.effects;
    record.effects = undefined;
    settled?.(stage as SettleStage | "failed", record.reason);
  }
  // Fired after the stage is written so the reporter reads a settled record,
  // and only on the transition, so a record failed once is announced once.
  if (stage === "failed") {
    host?.noteFailure?.(record);
  }
  return true;
}

/**
 * The LOCAL half of a command.
 *
 * Every operator action is two halves — the wire call, and the local
 * bookkeeping around it (the send's row and busy flip, the interrupt's busy
 * clear, the answered permission leaving `pending`, a setting's optimistic
 * value with rollback-on-refusal). `wirePayload` builds only the wire half;
 * dispatching the envelope and skipping the local half renders NOTHING for a
 * sent message — the defect this type repairs.
 */
export interface StreamEffects {
  /**
   * Runs once, when the record settles — ack, refusal, or timeout sweep.
   *
   * The stage is the one it settled AT, which for a `send` is `accepted`
   * (see {@link SettleStage}); hooks that roll an optimistic value back test
   * for `'failed'` and are unaffected by that widening.
   */
  settled?: (stage: SettleStage | "failed", reason?: string) => void;
  /** Runs once, when the envelope is dispatched (before any ack). */
  submitted?: () => void;
}

export interface CommandSubmission {
  commandId: string;
  kind: CommandKind;
  machineId: string;
  /** Exactly the payload the corresponding relay op takes today. */
  payload: unknown;
  sessionId: string;
  /**
   * Where this kind's protocol stops talking: `'accepted'` for `send`,
   * `'applied'` for the control kinds. Required, and deliberately so — a new
   * command kind cannot be added without answering "what is its last word?",
   * which is the question that, unanswered, retro-fails a delivered message.
   */
  settlesAt: SettleStage;
  /** The command's local half. */
  streamEffects?: StreamEffects;
}

/**
 * Submits one operator action as a tracked transaction and returns its id.
 *
 * Never throws: the stage IS the report, which is the point of the tracker —
 * a caller that wants the failure reads it off the record rather than wrapping
 * the call. Existing callers are untouched; this is an additive path.
 */
export function submitCommand(
  state: StreamState,
  host: StreamHost,
  submission: CommandSubmission
): string {
  const { commandId, sessionId, machineId, kind, payload } = submission;
  const now = host.now();
  const record = openRecord(state, submission, now);
  const envelope: CommandEnvelope = {
    type: "command",
    commandId,
    sessionId,
    machineId,
    kind,
    payload,
  };
  // The local half rides the record so every settling path — ack, refusal,
  // timeout sweep — runs its outcome hook exactly once. Applied BEFORE the
  // send, so a dispatch that fails synchronously still settles it (the
  // rollback below the failure).
  record.effects = submission.streamEffects;
  if (kind === "send") {
    record.envelope = envelope;
  }
  submission.streamEffects?.submitted?.();
  // Through {@link dispatch}, so a socket that shuts between the readiness
  // check and the write is a refusal wearing its own exception rather than a
  // throw out of the function that promised not to throw.
  const refusal = dispatch(host, envelope);
  if (refusal !== null) {
    // Nothing left this tab, and that is worth recording as a FACT rather
    // than inferring from the wording of a reason: it is what lets a retry
    // be offered as plainly safe instead of as a possible duplicate.
    record.undelivered = true;
    if (kind === "send") {
      record.waiting = true;
    } else {
      advanceStage(record, "failed", now, refusal, host);
    }
  }
  sweepCommands(state, now, host);
  return commandId;
}

/** Replays retained sends under their original ids, oldest first. */
export function resumePendingSends(state: StreamState, host: StreamHost): void {
  const pending = Object.values(state.commands)
    .filter((record) => record.envelope && !isSettled(record))
    .sort((a, b) => a.at - b.at);
  for (const record of pending) {
    const refusal = dispatch(host, record.envelope as CommandEnvelope);
    record.waiting = refusal !== null;
    if (refusal !== null) {
      break;
    }
    record.undelivered = undefined;
    record.changedAt = host.now();
  }
  armCommandSweep(state, host);
}

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** What a record needs to exist at all — every submission is one, and so is a stillborn one. */
type CommandStub = Pick<
  CommandSubmission,
  "commandId" | "sessionId" | "kind" | "settlesAt"
>;

/** Puts a fresh record in the ledger at `submitted`, and hands it back. */
function openRecord(
  state: StreamState,
  stub: CommandStub,
  now: number
): CommandRecord {
  state.commands[stub.commandId] = {
    commandId: stub.commandId,
    sessionId: stub.sessionId,
    kind: stub.kind,
    settlesAt: stub.settlesAt,
    stage: "submitted",
    at: now,
    changedAt: now,
  };
  return state.commands[stub.commandId];
}

/**
 * Records a command that never got as far as the wire.
 *
 * The ledger's promise is that {@link submitCommand} never throws — but a
 * caller does work of its own BEFORE it can call this file (assembling a
 * payload, minting a client id, reading provenance), and a throw there escapes
 * the ledger entirely: no record, no stage, nothing for the UI to render, and
 * an exception in a click handler. That is not a hypothetical; it is how a
 * missing browser API turned every send into silence.
 *
 * So the caller catches its own pre-dispatch throw and registers the failure
 * here instead of re-throwing. Doing it through this function rather than by
 * writing into `state.commands` directly is the whole point: the record is
 * swept, TTL'd, visible to {@link sessionCommands} and announced through
 * {@link StreamHost.noteFailure} exactly like one that failed on the wire —
 * one bookkeeping path, not two.
 */
export function failLocally(
  state: StreamState,
  host: StreamHost,
  stub: CommandStub,
  reason: string
): string {
  const now = host.now();
  const record = openRecord(state, stub, now);
  // It died before the wire: provably undelivered, like a refused dispatch.
  record.undelivered = true;
  advanceStage(record, "failed", now, reason, host);
  sweepCommands(state, now, host);
  return record.commandId;
}

/** Folds the hub's word on a command in. Acks for commands this tab never sent are not ours. */
export function noteCommandAck(
  state: StreamState,
  ack: CommandAck,
  now: number,
  host?: StreamHost
): boolean {
  const record = state.commands[ack.commandId];
  if (!record) {
    return false;
  }
  if (ack.stage === "applied") {
    record.outcome = ack.outcome;
  }
  return advanceStage(record, ack.stage, now, ack.reason, host);
}

/**
 * Keeps the tracker bounded, and calls off commands nothing ever answered.
 *
 * A tab left open for a week must not accumulate a record per keystroke-sent
 * message, and a spinner that spins forever is worse than a stated failure — so
 * settled records age out by count and by time, and an unsettled one that has
 * been out longer than a control call is allowed to take is failed with a
 * reason a human can read.
 *
 * `host` is optional only so a caller with no voice — a test ticking the clock
 * — can sweep; pass it everywhere else, because a sweep without it is a sweep
 * whose failures {@link StreamHost.noteFailure} never hears about.
 */
export function sweepCommands(
  state: StreamState,
  now: number,
  host?: StreamHost
): void {
  const settled: CommandRecord[] = [];
  for (const record of Object.values(state.commands)) {
    // Record-aware, and this is the line the whole `settlesAt` idea exists for:
    // a `send` sitting at `accepted` is DONE, not unanswered, and calling it off
    // here would retro-declare a message that landed a failure — visibly, once
    // the transcript renders the send's own record.
    if (!isSettled(record)) {
      if (record.waiting) {
        continue;
      }
      if (now - record.changedAt >= COMMAND_ACK_TIMEOUT_MS) {
        if (record.kind === "send" && host) {
          record.waiting = true;
          resumePendingSends(state, host);
          continue;
        }
        advanceStage(
          record,
          "failed",
          now,
          "The hub never acknowledged that.",
          host
        );
        settled.push(record);
      }
      continue;
    }
    if (now - record.changedAt >= SETTLED_COMMAND_TTL_MS) {
      delete state.commands[record.commandId];
      continue;
    }
    settled.push(record);
  }
  if (settled.length > SETTLED_COMMAND_LIMIT) {
    settled.sort((a, b) => a.changedAt - b.changedAt);
    for (const record of settled.slice(
      0,
      settled.length - SETTLED_COMMAND_LIMIT
    )) {
      delete state.commands[record.commandId];
    }
  }
  // Every sweep re-aims the timer at whatever is now the nearest deadline —
  // including "none", which disarms it. Doing it here rather than at each of
  // the four call sites is what keeps "a command is out" and "something will
  // come and call it off" from ever being separately true.
  if (host) {
    armCommandSweep(state, host);
  }
}

/**
 * When the earliest still-unanswered command runs out of patience, or null
 * when nothing is waiting on the hub.
 */
function nextAckDeadline(state: StreamState): number | null {
  let due: number | null = null;
  for (const record of Object.values(state.commands)) {
    if (isSettled(record) || record.waiting) {
      continue;
    }
    const deadline = record.changedAt + COMMAND_ACK_TIMEOUT_MS;
    if (due === null || deadline < due) {
      due = deadline;
    }
  }
  return due;
}

/**
 * Points the single ack timer at the nearest deadline there is.
 *
 * {@link COMMAND_ACK_TIMEOUT_MS} was, until this existed, not a timeout at all:
 * the only sweep the client ran was driven by inbound socket traffic, so a
 * command whose frame was swallowed was called off when some *unrelated*
 * message happened to arrive — measured at twenty seconds and counting on a
 * quiet tab, and never at all on a tab whose socket had gone silent, which is
 * precisely the condition under which a send goes missing. A timeout enforced
 * only by the traffic it is meant to detect the absence of is a comment.
 *
 * One timer for the whole ledger, not one per record: a flapping socket
 * submits and fails commands in bursts, and a timer apiece would leak one per
 * keystroke. Re-armed by {@link sweepCommands} after every settle, so the
 * handle is replaced rather than accumulated, and cancelled outright by
 * {@link disarmCommandSweep} when the client goes away.
 */
export function armCommandSweep(state: StreamState, host: StreamHost): void {
  if (!host.setTimer) {
    return;
  }
  disarmCommandSweep(state, host);
  const due = nextAckDeadline(state);
  if (due === null) {
    return;
  }
  state.sweepTimer = host.setTimer(Math.max(0, due - host.now()), () => {
    state.sweepTimer = null;
    // Which re-arms, through the tail of `sweepCommands`: a burst of commands
    // submitted seconds apart has several deadlines, and this walks them.
    sweepCommands(state, host.now(), host);
  });
}

/** Cancels the armed timer, if any. Idempotent; safe on a host with no clock. */
export function disarmCommandSweep(state: StreamState, host: StreamHost): void {
  if (state.sweepTimer === null) {
    return;
  }
  host.clearTimer?.(state.sweepTimer);
  state.sweepTimer = null;
}

/** Every command this tab has submitted for a session, oldest first. */
export function sessionCommands(
  state: StreamState,
  sessionId: string
): CommandRecord[] {
  if (!sessionId) {
    return [];
  }
  return Object.values(state.commands)
    .filter((record) => record.sessionId && record.sessionId === sessionId)
    .sort((a, b) => a.at - b.at);
}

/**
 * The newest command of one kind on one session — what a control reads to know
 * whether the thing it just asked for has landed.
 */
export function latestCommand(
  state: StreamState,
  sessionId: string,
  kind: CommandKind
): CommandRecord | null {
  let latest: CommandRecord | null = null;
  for (const record of Object.values(state.commands)) {
    if (record.sessionId !== sessionId || record.kind !== kind) {
      continue;
    }
    if (!latest || record.at >= latest.at) {
      latest = record;
    }
  }
  return latest;
}
