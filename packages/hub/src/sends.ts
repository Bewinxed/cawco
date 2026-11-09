import {
  atProviderLimit,
  CLAUDE_PROVIDER,
  LIMITED_PROVIDERS,
} from "@cawco/core/accounts";
import {
  ATTACHMENTS_HOME,
  attachedFileLine,
  attachedFileName,
  attachedPictureLine,
  pictureName,
} from "@cawco/core/attachments";
import { detach } from "@cawco/core/detach";
import type { FramePayload } from "@cawco/core/frames";
import { byPerson } from "@cawco/core/harness";
import {
  ACT_ORIGIN,
  COMPACTION_ORIGIN,
  PLAN_ORIGIN,
} from "@cawco/core/harness/kinds";
import { traitsOf } from "@cawco/core/harness/traits";
import type { PresenceSaid } from "@cawco/core/injected";
import {
  awayNotesOf,
  BACK_MESSAGE,
  presenceLine,
  undeliveredNotice,
  withMovedLine,
  withReminder,
} from "@cawco/core/injected";
import { invariant } from "@cawco/core/invariant";
import { planWaitsOf } from "@cawco/core/plan";
import type { Envelope, InstanceRow, SendPayload } from "@cawco/core/protocol";
import { relaunchOf } from "@cawco/core/relaunch";
import { CONTROL_READ_TRANSCRIPT_WINDOW } from "@cawco/core/session/controls";
import type {
  NeutralAssistantMessage,
  NeutralOrigin,
  NeutralResultMessage,
  NeutralUserMessage,
  SendMode,
  SendRecord,
  SentMessage,
  SessionMessage,
} from "@cawco/core/session-messages";
import { SEND_STATES } from "@cawco/core/session-messages";
import type { TranscriptWindow, WindowAsk } from "@cawco/core/transcript-types";
import { noticeWords } from "@cawco/core/words/notices";
import type { PersonsSend } from "./caw";
import type { DbShape } from "./db";
import type { PublicInstanceRow } from "./db/instances";
import type { WorkItemRow } from "./db/project-work";
import type { SentMessageRow } from "./db/sends";
import type { SendHold, StoredSendRefusal } from "./db/stored-types";
import type { SendDelivery } from "./delegation-actions";
import type { HubContext } from "./hub-context";
import { isKeepAlive } from "./keep-alive";
import { sessionLabel } from "./labels";
import type { Unanswered } from "./machine-answers";
import { READ_TIMEOUT_MS } from "./machine-read-timeouts";
import { externalizeImages, mediaNameOf } from "./media";
import { talksWithPerson } from "./roles";
import { sessionWord } from "./session-word";
import { unreachable } from "./unreachable";
import { WorkItemRefusal } from "./work-items";

/** The system origin name of the hub's word that a session at its account's limit may go on (at-limit.ts `CARRY_ON_ORIGIN`). */
export const LIMIT_ORIGIN = "limit";
/** The system origin name of the hub's word that the person is back, to a session holding news for them (`tellBack`). */
export const BACK_ORIGIN = "back";
/** Whether `origin` is the hub's word that the person is back: its wake goes in its turn among the hub's own launches. */
const isBack = (origin: NeutralOrigin): boolean =>
  origin.kind === "system" && origin.name === BACK_ORIGIN;
/** The origin of the hub's word to a sender that its message did not arrive. */
const UNDELIVERED_ORIGIN = "undelivered";

/** Whose word a fork's notice is ({@link forkNotice}): the hub's. */
const FORK_ORIGIN: NeutralOrigin = { kind: "system", name: "fork" };

/**
 * What an `init` frame announces: the SDK session, which is what lets a
 * dashboard that joins a live session late read its transcript back, and the
 * directory the agent really opened it in — the spawn's `cwd` after the agent
 * expanded it.
 */
/**
 * What a harness said about the sends it was handed: which it holds (and,
 * `whole`, that it holds nothing else), which it stores under which id and
 * which it has read (system frames), and which one it refused (a `rejected`
 * payload). These are the hub's to turn into records; no screen draws them.
 */
export type SendSignal =
  | { kind: "stored"; storedAs: Record<string, string> }
  | { kind: "held"; held: string[]; whole: boolean }
  | { kind: "read"; read: string[]; storedAs: Record<string, string> }
  | { kind: "rejected"; uuid: string; error: string };

/** How a send asks to be read. */
export const sendMode = ({ message }: SendPayload): SendMode =>
  message.shouldQuery === false ? "note" : "turn";

/**
 * What refused a send, as its record says it: an ask for a mode goes out as
 * its own field (core `ModeAsk`), never as its `refusal`, which the apps in
 * people's hands read closed.
 */
const wireRefusal = (
  refusal: StoredSendRefusal | null
): Pick<SendRecord, "modeAsk" | "refusal"> => {
  if (!refusal) {
    return {};
  }
  if (refusal.kind === "mode-ask") {
    const { kind: _kind, ...ask } = refusal;
    return { modeAsk: ask };
  }
  return { refusal };
};

/** A record as it goes out: on the stream, and with a history read. */
const toSendRecord = (row: SentMessageRow): SendRecord => ({
  ...(isKeepAlive(row.body) ? { keepAlive: true } : {}),
  uuid: row.uuid,
  instanceId: row.instanceId,
  acceptedAt: row.acceptedAt.toISOString(),
  ...(row.readAt ? { readAt: row.readAt.toISOString() } : {}),
  body: row.body,
  mode: row.mode,
  state: row.state,
  ...(row.reason ? { reason: row.reason } : {}),
  ...wireRefusal(row.refusal),
  ...(row.anchor ? { anchor: row.anchor } : {}),
  ...(row.harnessId ? { harnessId: row.harnessId } : {}),
  ...(row.replaces ? { replaces: row.replaces } : {}),
  ...(row.replacedBy ? { replacedBy: row.replacedBy } : {}),
});

/**
 * Why a send did not go, when the session never read it and no harness error
 * says more — what its row says beside "not sent".
 */
export const UNREAD = {
  stopped: "The session was stopped before it read this.",
  ended: "The session ended before it read this.",
  restarted: "The session restarted before it read this.",
  lost: "This never reached the session.",
} as const;

/**
 * The newest entries of a transcript read for the sends a session stored as
 * it stopped, restarted or came back: the notes it held sit at its very end.
 */
const STORED_TAIL = 50;

/**
 * How many stored entries a window of history asks for: two of the
 * dashboard's pages and then some, so a newest page is cut from the first
 * window read. Ours.
 */
export const HISTORY_WINDOW = 300;

/**
 * How far before a pending send's acceptance (the hub's clock) a settle read
 * reaches (the machine's clock, in the transcript's timestamps). Our call:
 * clocks a few minutes apart, and the CLI dates an absorbed send when it was
 * queued.
 */
const SETTLE_SKEW_MS = 10 * 60 * 1000;

/**
 * Transcript reads to settle sends ({@link storedIn}) one machine is asked
 * at once; the rest wait their turn, their deadline starting when they are
 * asked. Our call: a machine coming back with hundreds of sessions was
 * asked 471 reads in one second, and none was answered within 10 s
 * (2026-10-23 19:28:56, obelisk, the hub's own machine).
 */
const SETTLE_READS_PER_MACHINE = 4;
/** After a settle read its machine left unanswered, the session's next waits this long, doubling each time. */
const SETTLE_BACKOFF_FIRST_MS = 15_000;
/** The longest a session's next settle read waits. Our call: eight heartbeats. */
const SETTLE_BACKOFF_MAX_MS = 120_000;

/**
 * A `send` whose turn carries pasted material. The agent folds attachments into
 * the message it hands the harness, so what the transcript stores is not what
 * the hub saw — and a title derived from the hub's copy would then disagree
 * with the one a loaded transcript derives, which is the disagreement this
 * whole path exists to remove. Such a send names nothing; the transcript will.
 */
const hasAttachments = (payload: unknown): boolean =>
  typeof payload === "object" &&
  payload !== null &&
  Array.isArray((payload as { attachments?: unknown }).attachments) &&
  (payload as { attachments: unknown[] }).attachments.length > 0;

/**
 * A `send` that is one session addressing another, rather than a reader typing.
 * The hub stays payload-opaque otherwise; this is a sanctioned peek, and it is
 * the only way the fleet can be told a session is carrying handed work.
 */
const peekPeer = (payload: unknown): string | undefined => {
  if (typeof payload !== "object" || payload === null) {
    return undefined;
  }
  const { message } = payload as {
    message?: { origin?: { kind?: string; name?: string } };
  };
  if (message?.origin?.kind !== "peer") {
    return undefined;
  }
  return message.origin.name ?? "another session";
};

/**
 * A `send` that starts a turn. A queued hand-off (`shouldQuery: false`) is read
 * when the *next querying message* folds it into a turn — so that send, not any
 * turn ending, is the moment it stops being outstanding. Clearing on turn end
 * was wrong twice over: a turn already in flight when the hand-off landed
 * cleared it unread, and the SDK acknowledges even a queued append with result
 * frames, which cleared it within seconds of arriving.
 */
const isQuerySend = (payload: unknown): boolean => {
  if (typeof payload !== "object" || payload === null) {
    return false;
  }
  const { message } = payload as { message?: { shouldQuery?: unknown } };
  return message?.shouldQuery !== false;
};

/**
 * Put a relay send's `message` into the one shape every adapter reads
 * ({@link NeutralUserMessage}), or say why it cannot be — IN PLACE, because
 * the body is forwarded to the agent verbatim.
 *
 * This exists because the failure it replaces was silent and total. `message`
 * travels from here to the agent's `#send`, into the claude adapter's input
 * stream, and out to the CLI as one stream-json line. A bare string survives
 * every one of those hops — it is valid JSON — and dies at the far end, where
 * the CLI reads a JSON *string* where a message envelope belongs and drops it
 * without a word. Nothing upstream can tell: the POST answers 200, the agent
 * pushes what it was given, and the session sits at `running` forever with no
 * transcript, no frames and no error on any machine. It costs hours to find,
 * and the caller's intent was never in doubt.
 *
 * So: text is wrapped (the caller plainly meant to say it), an envelope that
 * only forgot its `type` is completed, and anything else is refused loudly
 * rather than forwarded to hang. The one outcome no longer possible is the
 * one that was happening.
 */
const normalizeRelayMessage = (body: unknown): string | undefined => {
  const needsEnvelope =
    "relay send needs a message: either plain text, or a {type:'user',message:{role:'user',content:…}} envelope";
  if (typeof body !== "object" || body === null) {
    return needsEnvelope;
  }
  const holder = body as { message?: unknown };
  const { message } = holder;
  if (typeof message === "string") {
    holder.message = {
      type: "user",
      message: { role: "user", content: message },
      uuid: crypto.randomUUID(),
      origin: { kind: "human" },
    } satisfies SentMessage;
    return;
  }
  if (typeof message !== "object" || message === null) {
    return needsEnvelope;
  }
  const envelope = message as { type?: unknown; message?: unknown };
  const inner = envelope.message as {
    role?: unknown;
    content?: unknown;
  } | null;
  if (typeof inner !== "object" || inner === null) {
    return needsEnvelope;
  }
  if (inner.role !== "user") {
    return "relay send message.message.role must be 'user'";
  }
  if (typeof inner.content !== "string" && !Array.isArray(inner.content)) {
    return "relay send message.message.content must be text or a block array";
  }
  // The only field a well-formed caller tends to omit, and the one every
  // reader downstream keys off (`userTurnText`, `isQuerySend`).
  if (envelope.type === undefined) {
    envelope.type = "user";
  }
  if (envelope.type !== "user") {
    return "relay send message.type must be 'user'";
  }
  // Every sent message has an identity and a speaker (`SentMessage`). The hub
  // completes the message here, so a caller that named neither gets its uuid
  // minted here, and speaks as a dashboard send does — as the operator.
  const sent = envelope as { uuid?: unknown; origin?: unknown };
  sent.uuid ??= crypto.randomUUID();
  sent.origin ??= { kind: "human" };
};

/**
 * What becomes of a pending send its harness has not taken up, once a
 * transcript read has looked: `fail` — it did not go, for the reason given:
 * the session will never run again; `owe` — the process it was handed to
 * is gone and the session runs again, so it is owed to the next process
 * ({@link oweUnread}), a machine that cannot be asked counting as having
 * taken none; `wait` — a live process may still hand it over and say so;
 * `unheld` — what the process holds is known, so a send it neither stored
 * nor said it held ({@link SentMessageRow.held}), or one a later send
 * overtook, never reached it, and is owed to it again. That is decided only
 * on a read the machine answered.
 */
type Unstored = "fail" | "owe" | "wait" | "unheld";

/**
 * Each session's sends still pending (accepted, not yet read by it), keep-
 * alive pings aside, by uuid: a send that will start its next turn. Laid on
 * its board row as `queuedSends` (createServer `boardRows`), so every screen
 * counts a session with one waiting as still working, not only the page that
 * holds its transcript. Seeded from the database as the hub starts; every
 * record's change passes `publishSend`, which keeps it (`note`, whether that
 * session's count moved).
 */
const pendingSends = (seed: SentMessageRow[]) => {
  const byInstance = new Map<string, Set<string>>();
  const note = (row: SentMessageRow): boolean => {
    if (isKeepAlive(row.body)) {
      return false;
    }
    const held = byInstance.get(row.instanceId);
    const was = held?.has(row.uuid) ?? false;
    const now = row.state === "pending";
    if (was === now) {
      return false;
    }
    if (now) {
      byInstance.set(row.instanceId, new Set([...(held ?? []), row.uuid]));
    } else if (held) {
      held.delete(row.uuid);
      if (held.size === 0) {
        byInstance.delete(row.instanceId);
      }
    }
    return true;
  };
  for (const row of seed) {
    note(row);
  }
  return {
    note,
    count: (instanceId: string): number =>
      byInstance.get(instanceId)?.size ?? 0,
  };
};

export type SendsContext = Pick<
  HubContext,
  | "accountWords"
  | "advanceCompaction"
  | "artifactLane"
  | "atLimit"
  | "callAgent"
  | "credentialTurns"
  | "db"
  | "forgetPending"
  | "forkNoticeFor"
  | "hubStep"
  | "inputRefusal"
  | "keptAsleep"
  | "laws"
  | "leadRuns"
  | "lifetime"
  | "limitRefused"
  | "machineName"
  | "machinePause"
  | "machinePresence"
  | "memoryWatch"
  | "moveJobOf"
  | "nameFromLiveTurn"
  | "notifications"
  | "planChanges"
  | "plans"
  | "processAt"
  | "publishInstances"
  | "pulses"
  | "push"
  | "readAgent"
  | "reconnectingFor"
  | "registry"
  | "sayCompaction"
  | "sendFrame"
  | "sendRefusal"
  | "sessionName"
  | "silentWords"
  | "startHold"
  | "startsTurnIn"
  | "stepUuids"
  | "stepWords"
  | "stopCompaction"
  | "streams"
  | "takenUpBy"
  | "transcripts"
  | "turnInFlight"
  | "waitingForProcess"
  | "wakeForSend"
  | "wakesForSend"
  | "watch"
  | "workItems"
>;

export const createSends = (ctx: SendsContext) => {
  /**
   * Sessions that have been handed work and have not answered it yet, kept here
   * rather than in a browser: a hand-off learnt by whichever tab happened to be
   * watching is invisible on every other device, and gone after a reload.
   */
  const handoffs = new Map<string, { from: string; at: number }>();

  /* ---- send records: the hub's one account of every send (SendRecord) ---- */

  /**
   * The last thing each session said that a screen draws a row for: its
   * newest main-loop assistant frame, or the newest send it read. A send that
   * fails without being stored is placed right after it. Seeded from the
   * stored transcript by a history read when the hub has heard nothing since
   * it started.
   */
  const anchors = new Map<string, string>();
  /**
   * Sends each session has read and not yet said anything about, each with
   * the anchor it had before it was read. An error that closes the turn before
   * the model says a word is that send's failure (rule b); anything the model
   * says, a clean close, or an interrupt clears them.
   */
  const unanswered = new Map<string, Map<string, string | undefined>>();
  /** Pending sends a transcript read is deciding, so none is decided twice. */
  const deciding = new Set<string>();

  /** Each session's sends still pending, kept as their records change ({@link pendingSends}). */
  const sendsPending = pendingSends(ctx.db.pendingSends());

  /** A record's latest state onto its session's stream: where every screen hears it. */
  const publishSend = (row: SentMessageRow): void => {
    // A send coming or going from pending moves its session's board row.
    if (sendsPending.note(row)) {
      const [session] = ctx.db.getInstancesByIds([row.instanceId]);
      if (session) {
        ctx.publishInstances(session.machineId);
      }
    }
    if (isKeepAlive(row.body)) {
      ctx.streams.sequence(row.instanceId, {
        kind: "send",
        instanceId: row.instanceId,
        keepAlive: true,
        record: toSendRecord(row),
      });
      return;
    }
    ctx.transcripts.ingest(row.instanceId, {
      kind: "send",
      instanceId: row.instanceId,
      record: toSendRecord(row),
    });
  };

  /**
   * One change to a record: stored, then said. The only way a record moves.
   * A record a session was handed stays its session's.
   */
  const changeSend = <Row extends SentMessageRow>(
    row: Row,
    change: Parameters<DbShape["updateSend"]>[1]
  ): Row => {
    const moved = (ctx.db.updateSend(row.uuid, change) ?? row) as Row;
    publishSend(moved);
    // A send leaving `pending`, read or never to be: what a routine's run
    // waits on (routines.ts `sendLeft`).
    if (
      row.state === "pending" &&
      moved.state !== "pending" &&
      !isKeepAlive(moved.body)
    ) {
      ctx.leadRuns?.sendLeft(moved);
      sendSettles.get(moved.uuid)?.(moved);
    }
    return moved;
  };
  /** Who waits on a send leaving `pending`, by its uuid (a tray's Retry). */
  const sendSettles = new Map<string, (row: SentMessageRow) => void>();

  /**
   * A tray's Retry: the reader's word to the failed delegate's own session,
   * through the one send path ({@link deliverSend}), which reopens the same
   * item once its process reads it (workItems.reopen). Settles when the
   * send has been read, or is owed (its machine away in its grace, an update
   * installing: it is the session's next send once the hold ends, and the
   * item reopens then). Answers why not, when it does not go.
   */
  const retryFromTray = async (
    item: WorkItemRow
  ): Promise<string | undefined> => {
    if (item.state !== "failed") {
      return `${item.title} is ${item.state}, not failed.`;
    }
    const [row] = ctx.db.getInstancesByIds([item.instanceId]);
    const refused = ctx.inputRefusal(item.instanceId, {
      kind: "system",
      name: ACT_ORIGIN,
    });
    if (!row || refused) {
      return refused?.reason ?? "This session is gone.";
    }
    const uuid = crypto.randomUUID();
    const settled = new Promise<SentMessageRow>((resolve) => {
      sendSettles.set(uuid, resolve);
    });
    const error = item.error?.split("\n")[0]?.trim();
    const sent = deliverSend({
      verb: "send",
      machineId: row.machineId,
      instanceId: row.id,
      payload: {
        instanceId: row.id,
        message: personsMessage(
          {
            by: "act",
            line: noticeWords.retried,
            text: error
              ? `Your work failed: ${error}\nTry it again.`
              : "Your work failed. Try it again.",
          },
          uuid
        ),
      },
    });
    const owed = sent?.state === "pending" && sent.owed !== null;
    const outcome =
      owed || (sent && sent.state !== "pending") ? sent : await settled;
    sendSettles.delete(uuid);
    if (!outcome || owed || outcome.state === "read") {
      return undefined;
    }
    return outcome.reason ?? `The retry was not read (${outcome.state}).`;
  };

  /**
   * Where a failed send goes: after the last thing the session said — or,
   * when that is this send itself (it read it, then failed on it), after
   * what came before it.
   */
  const anchorFor = (instanceId: string, uuid: string): string | undefined => {
    const last = anchors.get(instanceId);
    return last === uuid ? unanswered.get(instanceId)?.get(uuid) : last;
  };

  /**
   * A pending send read. `answering` is the harness's own read, which the
   * model's turn follows; a read found in a stored transcript follows no turn.
   */
  const readSend = (
    row: SentMessageRow,
    answering: boolean
  ): SentMessageRow => {
    if (isKeepAlive(row.body)) {
      return changeSend(row, { state: "read", readAt: new Date() });
    }
    const origin = (row.body as SentMessage | null)?.origin;
    // A live process took it up: finished work it was sent to runs again,
    // but for the hub's filing turn, which reopens nothing.
    if (!(origin?.kind === "system" && origin.name === COMPACTION_ORIGIN)) {
      ctx.workItems.reopen(row.instanceId, row.acceptedAt);
    }
    if (answering) {
      const waiting = unanswered.get(row.instanceId) ?? new Map();
      waiting.set(row.uuid, anchors.get(row.instanceId));
      unanswered.set(row.instanceId, waiting);
    }
    anchors.set(row.instanceId, row.uuid);
    return changeSend(row, { state: "read", readAt: new Date() });
  };

  /** A send that will never be read, and why (what refused it, when the hub did). Final. */
  const failSend = (
    row: SentMessageRow,
    reason: string,
    refusal?: StoredSendRefusal
  ): void => {
    const anchor = anchorFor(row.instanceId, row.uuid);
    unanswered.get(row.instanceId)?.delete(row.uuid);
    changeSend(row, {
      state: "failed",
      reason,
      refusal: refusal ?? null,
      anchor: anchor ?? null,
    });
    if (row.state === "pending") {
      tellSender(row, reason);
    }
    // A compaction's own step refused: the compaction ends now, stopped,
    // and what waited behind it goes ({@link stepEnded}).
    const plan = ctx.db.atLimit.compaction(row.instanceId);
    if (plan && ctx.stepUuids(plan).includes(row.uuid)) {
      queueMicrotask(() => ctx.advanceCompaction(row.instanceId));
    }
  };

  /**
   * Another session's message that no process ever took up (a revive that
   * failed, a send the machine refused): that session hears why, the way it
   * hears a report. A screen reads the record itself; CawCo's own notices
   * tell nobody.
   */
  const tellSender = (row: SentMessageRow, reason: string): void => {
    const { origin } = row.body as SentMessage;
    const sender = origin.kind === "peer" ? origin.fromSession : undefined;
    if (!sender || sender === row.instanceId) {
      return;
    }
    const [from, to] = [
      ctx.db.getInstancesByIds([sender])[0],
      ctx.db.getInstancesByIds([row.instanceId])[0],
    ];
    if (!(from && to)) {
      return;
    }
    deliverSend({
      verb: "send",
      machineId: from.machineId,
      instanceId: from.id,
      payload: {
        instanceId: from.id,
        message: {
          type: "user",
          uuid: crypto.randomUUID(),
          message: {
            role: "user",
            content: undeliveredNotice(sessionLabel(to).tag, reason),
          },
          parent_tool_use_id: null,
          origin: { kind: "system", name: UNDELIVERED_ORIGIN },
          shouldQuery: false,
        },
      },
    });
  };

  /**
   * Sessions whose turn in flight an interrupt cut: its end is the cut's, so
   * nothing is handed back for it and no rule answers it, on every harness.
   * OpenCode says so itself (`aborted`); a Claude turn cut by an interrupt
   * ends in an error result, which was handed back as a failed turn and
   * failed its item. Marked as the interrupt is sent, before that result
   * arrives. Only a turn under way is marked: an idle session's next turn
   * is its own.
   */
  const interruptedTurns = new Set<string>();

  /**
   * The session's turn was cut into by an interrupt, so the error that closes
   * it is the cut, not a failure of what it had read. `hold`: the
   * interrupt holds its delegated work until its parent, its conversation or the
   * reader writes to it (work-items.ts `interrupted`); a pause's own cut
   * does not ({@link pauseBegan}).
   */
  const noteInterrupt = (instanceId: string, hold = true): void => {
    // A compaction after a move ends at an interrupt of either of its turns.
    ctx.stopCompaction(instanceId);
    unanswered.delete(instanceId);
    if (
      turnsWritten.has(instanceId) ||
      ctx.pulses.get(instanceId)?.busy === true
    ) {
      interruptedTurns.add(instanceId);
    }
    ctx.workItems.interrupted(instanceId, hold);
    // A turn its owner stopped is not one that waits on them: no push.
    ctx.push.interrupted(instanceId);
  };

  /**
   * Sessions whose open turn this launch is already written down for
   * ({@link DbShape.openTurn}): one write a turn, not one a frame. A launch's
   * `init` and a turn's `result` forget it.
   */
  const turnsWritten = new Set<string>();

  /** A turn of the session is under way: its frames, or its harness reading a send. */
  const turnUnderWay = (instanceId: string): void => {
    if (turnsWritten.has(instanceId)) {
      return;
    }
    turnsWritten.add(instanceId);
    // Its words and its work are its own: none of a turn before it that
    // ended with no result (its process gone inside it) carries over.
    ctx.turnInFlight.began(instanceId);
    ctx.db.openTurn(instanceId, Date.now());
    ctx.push.turnBegan(instanceId);
  };

  /**
   * Whether the sends a harness says it read are all CawCo's quiet notes (a
   * `system` send with `shouldQuery: false`, mode `note`): a session at
   * rest stores them and starts no turn (agent claude.ts `quietNote`).
   */
  const notesOnly = (ids: readonly string[]): boolean => {
    const rows = ctx.db.sendsFor([...ids]);
    return (
      rows.length === ids.length &&
      rows.length > 0 &&
      rows.every(
        (row) => row.mode === "note" && row.body.origin?.kind === "system"
      )
    );
  };

  /** The session's turn ended with its result: nothing of it is left to hand back. */
  const turnOver = (instanceId: string): void => {
    turnsWritten.delete(instanceId);
    ctx.db.closeTurn(instanceId);
  };

  /**
   * Which sends a session's stored transcript holds, and whether its harness
   * has taken each up: by send uuid, true for read, false for written down
   * and still waiting ({@link SessionMessage.queued}). Linked the way a history
   * read links them ({@link linkEntries}). `unread`, why in words, when the
   * machine did not answer or could not read it: it has said nothing either way.
   */
  const storedIn = (
    instanceId: string
  ): Promise<Map<string, boolean> | { unread: string }> => {
    const before = settleReads.get(instanceId);
    // After the one before it, whatever became of that one.
    const read = (before ?? Promise.resolve())
      .catch(() => undefined)
      .then(() => settleRead(instanceId))
      .finally(() => {
        if (settleReads.get(instanceId) === read) {
          settleReads.delete(instanceId);
        }
      });
    settleReads.set(instanceId, read);
    return read;
  };

  /** Each session's settle read in flight, or waiting its turn behind one: one at a time per session. */
  const settleReads = new Map<string, Promise<unknown>>();
  /** A session whose last settle read went unanswered: its next is asked no sooner than `until`. */
  const settleBackoff = new Map<string, { ms: number; until: number }>();
  /** Settle reads each machine is being asked now ({@link SETTLE_READS_PER_MACHINE} at most). */
  const settleAsked = new Map<string, number>();
  /** Settle reads waiting for one of their machine's turns, oldest first. */
  const settleWaiting = new Map<string, (() => void)[]>();

  /** One of the machine's settle-read turns: taken now, or when one is given back. */
  const settleTurn = (machineId: string): Promise<void> => {
    const asked = settleAsked.get(machineId) ?? 0;
    if (asked < SETTLE_READS_PER_MACHINE) {
      settleAsked.set(machineId, asked + 1);
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const queue = settleWaiting.get(machineId) ?? [];
      queue.push(resolve);
      settleWaiting.set(machineId, queue);
    });
  };

  /** A turn given back: handed straight to the read waiting longest, else freed. */
  const settleTurnBack = (machineId: string): void => {
    const next = settleWaiting.get(machineId)?.shift();
    if (next) {
      next();
      return;
    }
    settleWaiting.delete(machineId);
    settleAsked.set(
      machineId,
      Math.max(0, (settleAsked.get(machineId) ?? 1) - 1)
    );
  };

  /**
   * The stored transcript a settle read decides the session's pending sends
   * against: its newest {@link STORED_TAIL} entries, and windows before them
   * until they reach back past the oldest pending send's acceptance (less
   * {@link SETTLE_SKEW_MS}), for a send is stored only after it is handed.
   * A send the CLI absorbed mid-turn is stored where it was read, and the
   * turn can run on long after: 83 entries on in one session, which a tail
   * of 50 missed, so the send was owed again and the session read it twice.
   * Oldest first; a window the machine did not answer is the read's answer.
   */
  const settleWindows = async (
    row: InstanceRow & { sessionId: string }
  ): Promise<Awaited<ReturnType<typeof ctx.readAgent>>> => {
    const unread = ctx.db.sendsIn(row.id, ["pending"]);
    const since =
      unread.length > 0
        ? Math.min(...unread.map((send) => send.acceptedAt.getTime())) -
          SETTLE_SKEW_MS
        : Number.POSITIVE_INFINITY;
    const windows: SessionMessage[][] = [];
    let ask: WindowAsk = { end: "newest", limit: STORED_TAIL };
    for (;;) {
      const answer = await ctx.readAgent(
        row.machineId,
        CONTROL_READ_TRANSCRIPT_WINDOW,
        [row.sessionId, { dir: row.cwd || undefined, window: ask }],
        READ_TIMEOUT_MS,
        row.harness
      );
      if (answer.kind !== "answered" || !answer.value.ok) {
        return answer;
      }
      const read = answer.value.result as Partial<TranscriptWindow> | null;
      const entries = Array.isArray(read?.entries) ? read.entries : [];
      windows.unshift(entries);
      const first = entries.find((entry) => entry.timestamp)?.timestamp;
      const older = read?.older ?? null;
      if (older === null || !first || Date.parse(first) < since) {
        return {
          ...answer,
          value: { ...answer.value, result: windows.flat() },
        };
      }
      ask = { before: older, limit: HISTORY_WINDOW };
    }
  };

  /**
   * One settle read of the session's transcript tail, asked once its backoff
   * is over and its machine has a turn for it. One its machine left
   * unanswered is logged with when it was asked and how long it waited, and
   * puts the session's next read off (doubling, {@link SETTLE_BACKOFF_MAX_MS}
   * at most); one answered clears that.
   */
  const askSettle = async (row: InstanceRow & { sessionId: string }) => {
    const backoff = settleBackoff.get(row.id);
    if (backoff && backoff.until > Date.now()) {
      await ctx.lifetime.sleep(backoff.until - Date.now());
    }
    await settleTurn(row.machineId);
    const askedAt = Date.now();
    try {
      const answer = await settleWindows(row);
      if (answer.kind !== "unanswered") {
        settleBackoff.delete(row.id);
        return answer;
      }
      const ms = Math.min(
        backoff ? backoff.ms * 2 : SETTLE_BACKOFF_FIRST_MS,
        SETTLE_BACKOFF_MAX_MS
      );
      const until = Date.now() + ms;
      settleBackoff.set(row.id, { ms, until });
      console.warn(
        `[hub] ${row.id}: settle read on ${ctx.machineName(row.machineId)} not answered (asked at ${askedAt}, waited ${Date.now() - askedAt} ms); its next is asked no sooner than ${until}, ${ms / 1000} s on`
      );
      return answer;
    } finally {
      settleTurnBack(row.machineId);
    }
  };

  /** {@link storedIn}'s one read of the session, through {@link askSettle}. */
  const settleRead = async (
    instanceId: string
  ): Promise<Map<string, boolean> | { unread: string }> => {
    const [row] = ctx.db.getInstancesByIds([instanceId]);
    if (!row?.sessionId) {
      return new Map();
    }
    const answer = await askSettle({ ...row, sessionId: row.sessionId });
    switch (answer.kind) {
      case "unanswered":
        return { unread: ctx.silentWords(row.machineId, answer) };
      case "answered":
        if (!answer.value.ok) {
          return {
            unread: `${ctx.machineName(row.machineId)} could not read its transcript: ${answer.value.error ?? "it gave no reason"}`,
          };
        }
        break;
      default:
        throw unreachable(answer);
    }
    // Read as the newest history page is: linked, a send it took up read,
    // and the session's anchor seeded when the hub has heard nothing of it
    // since it started — so a send this fails goes after what the session
    // last said, not at the conversation's start.
    const entries = answer.value.result as SessionMessage[];
    const { last } = linkEntries(instanceId, entries);
    if (last && !anchors.has(instanceId)) {
      anchors.set(instanceId, last);
    }
    const stored = new Map<string, boolean>();
    for (const entry of entries) {
      for (const uuid of entry.sends ?? []) {
        stored.set(uuid, !entry.queued);
      }
    }
    return stored;
  };

  /**
   * Whether a later send of the session has been taken up ahead of `send`.
   * Every harness takes up what it is sent in the order it was sent, so a
   * send overtaken like this was never handed to it.
   */
  const overtaken = (send: SentMessageRow): boolean =>
    ctx.db
      .sendsIn(send.instanceId, ["read"])
      .some((later) => later.acceptedAt.getTime() > send.acceptedAt.getTime());

  /**
   * What a session was sent and has not read, decided against its stored
   * transcript (rule c): whatever its harness has taken up is read — a
   * process can take up the notes it was holding as it stops, and say
   * nothing — and the rest as `unstored` says, failing for `why`. `only`
   * narrows the sends decided. One another read is already deciding is left
   * to it. `decided` hears that this read decided every one.
   */
  const settlePending = (
    instanceId: string,
    why: string,
    unstored: Unstored,
    only: (send: SentMessageRow) => boolean = () => true,
    decided: () => void = () => undefined,
    /** What a failed send offers back, beside `why`. */
    refusal?: StoredSendRefusal
  ): void => {
    // A turn that is over answers nothing it read; one a live process is
    // still running may yet.
    if (unstored === "fail") {
      unanswered.delete(instanceId);
    }
    // A send still owed never reached a machine, so no machine lost it; only
    // an end ("fail") ends it, and nothing owes it twice.
    const all = ctx.db
      .sendsIn(instanceId, ["pending"])
      .filter((send) => unstored === "fail" || !send.owed)
      .filter(only);
    const sends = all.filter((send) => !deciding.has(send.uuid));
    const whole = sends.length === all.length;
    if (sends.length === 0) {
      if (whole) {
        decided();
      }
      return;
    }
    for (const send of sends) {
      deciding.add(send.uuid);
    }
    // The callers are frame handlers that do not wait on a machine round trip.
    detach(
      storedIn(instanceId)
        .then((answer) => {
          const read = readOrUnread(instanceId, answer, sends.length, why);
          // `unheld` is decided only on a read the machine answered: asked
          // again at its next heartbeat.
          if (read.unread && unstored === "unheld") {
            return;
          }
          let owed = false;
          for (const send of sends) {
            owed =
              settleSend(send, read.stored, unstored, read.said, refusal) ||
              owed;
          }
          if (whole) {
            decided();
          }
          // What is owed goes now to a process up or starting, or wakes an
          // asleep session for it.
          if (owed) {
            releaseOwed({ instanceId });
          }
        })
        .finally(() => {
          for (const send of sends) {
            deciding.delete(send.uuid);
          }
        }),
      "pending sends"
    );
  };

  /**
   * What {@link settlePending} settles `count` sends against: the transcript
   * read, or (unread) none, said in the log, a failed send's reason saying
   * its read is not known (`fail`: never runs again; `owe`: owed to the next
   * process, as one that took none).
   */
  const readOrUnread = (
    instanceId: string,
    answer: Map<string, boolean> | { unread: string },
    count: number,
    why: string
  ): { said: string; stored: Map<string, boolean>; unread: boolean } => {
    if (!("unread" in answer)) {
      return { said: why, stored: answer, unread: false };
    }
    console.warn(
      `[hub] ${instanceId}: its transcript could not be read to settle ${count} send(s) it never said it read: ${answer.unread}`
    );
    return {
      said: `${why} Whether it read it is not known: ${answer.unread}.`,
      stored: new Map(),
      unread: true,
    };
  };

  /**
   * One send {@link settlePending} decides, against what `stored` says was
   * taken up. True when it is owed again.
   */
  const settleSend = (
    send: SentMessageRow,
    stored: Map<string, boolean>,
    unstored: Unstored,
    why: string,
    refusal?: StoredSendRefusal
  ): boolean => {
    // Read meanwhile, or thrown away with its session: that stands.
    const now = ctx.db.sendRecord(send.uuid);
    if (now?.state !== "pending") {
      return false;
    }
    const taken = stored.get(now.uuid);
    if (taken) {
      readSend(now, false);
      return false;
    }
    if (unstored === "fail") {
      failSend(now, why, refusal);
      return false;
    }
    const lost =
      unstored === "owe" ||
      (unstored === "unheld" &&
        taken === undefined &&
        !(now.held && !overtaken(now)));
    if (!lost) {
      return false;
    }
    // A keep-alive ping is kept for no process but the one it was for, and
    // nothing starts a session to warm its cache: it did not go.
    if (!ctx.db.oweAgain(now.uuid)) {
      failSend(now, why);
      return false;
    }
    console.log(
      `[hub] send ${now.uuid} to ${now.instanceId} owed again: ${why}`
    );
    publishSend(ctx.db.sendRecord(now.uuid) ?? now);
    return true;
  };

  /**
   * What a session was handed and never read, owed to its next process: its
   * process went away and the session runs again — filed asleep, restored,
   * or failed and waiting for its next start. Taken up first is read.
   */
  const oweUnread = (instanceId: string, why: string): void =>
    settlePending(instanceId, why, "owe");

  /**
   * A session's process went away and nobody ended the session ({@link
   * forgetPending} for the rest). When the session runs again
   * (`runsAgain`: it has a conversation to come back on, or is failed and
   * waits for its next start), what it was sent and never read is owed to
   * its next process; otherwise nothing can read it, and it fails for `why`.
   */
  const losePending = (
    instanceId: string,
    runsAgain: boolean,
    why: string = UNREAD.ended
  ): void => {
    ctx.forgetPending(instanceId, why, false, runsAgain ? "all" : "none");
    if (runsAgain) {
      oweUnread(instanceId, why);
    }
  };

  /** Sends handed back by their machine, decided together per session ({@link takeBack}). */
  const handedBack = new Map<string, Envelope<SendPayload>[]>();

  /** Whether a pending send's current hand-off is the one `send` was given. */
  const currentHandOff = (instanceId: string, send: SendPayload): boolean => {
    const record = ctx.db.sendRecord(send.message.uuid);
    return (
      record?.instanceId === instanceId &&
      record.state === "pending" &&
      !record.owed &&
      (record.delivery ?? undefined) === send.delivery
    );
  };

  /**
   * One send handed back, decided ({@link takeBack}): read when the session's
   * transcript shows it taken up, owed otherwise. The time it was handed over
   * when it is owed; infinity when it is not.
   */
  const holdBack = (
    instanceId: string,
    one: Envelope<SendPayload>,
    stored: Map<string, boolean> | { unread: string }
  ): number => {
    const { uuid } = one.payload.message;
    if (!currentHandOff(instanceId, one.payload)) {
      return Number.POSITIVE_INFINITY;
    }
    const now = ctx.db.sendRecord(uuid);
    // Unread: the machine handed it back whole, its own word that no
    // process took it, so it is owed as one the transcript does not hold.
    if (now && !("unread" in stored) && stored.get(uuid)) {
      readSend(now, false);
      return Number.POSITIVE_INFINITY;
    }
    ctx.db.holdSend(uuid, one);
    console.log(
      `[hub] send ${uuid} to ${instanceId} came back: no process took it; owed to the session's next process`
    );
    const owed = ctx.db.sendRecord(uuid);
    if (owed) {
      publishSend(owed);
    }
    return now ? now.acceptedAt.getTime() : Number.POSITIVE_INFINITY;
  };

  /**
   * A send its machine hands back whole ({@link HeldSendFrame}): no process
   * took it — it found none, or the one it was handed to went away. The
   * hand-off it names must be its current one: a later hand-off overtook any
   * other, and owing that again would hand it twice. Once per session, what
   * its transcript shows taken up is read, and the rest is owed to the
   * session's next process ({@link releaseOwed}), as it was handed: at once
   * when a process event came after the hand-off, else when the next one
   * comes ({@link waitingForProcess}).
   */
  const takeBack = (
    machineId: string,
    instanceId: string,
    send: SendPayload
  ): void => {
    if (!currentHandOff(instanceId, send)) {
      console.log(
        `[hub] send ${send.message.uuid} to ${instanceId} came back from ${machineId} after it was settled or handed on again: left as it is`
      );
      return;
    }
    const envelope: Envelope<SendPayload> = {
      verb: "send",
      machineId,
      instanceId,
      payload: send,
    };
    const batch = handedBack.get(instanceId);
    if (batch) {
      batch.push(envelope);
      return;
    }
    handedBack.set(instanceId, [envelope]);
    ctx.lifetime.after(0, () => {
      const back = handedBack.get(instanceId) ?? [];
      handedBack.delete(instanceId);
      detach(
        storedIn(instanceId).then((stored) => {
          // The earliest hand-off among them: a process event since then is
          // a process that may take them ({@link processAt}).
          let handedAt = Number.POSITIVE_INFINITY;
          for (const one of back) {
            handedAt = Math.min(handedAt, holdBack(instanceId, one, stored));
          }
          if ((ctx.processAt.get(instanceId) ?? 0) > handedAt) {
            releaseOwed({ instanceId });
          } else if (Number.isFinite(handedAt)) {
            ctx.waitingForProcess.add(instanceId);
          }
        }),
        "sends handed back"
      );
    });
  };

  /**
   * Sessions whose process outlived an agent restart, from the replacement's
   * register until what they were sent before it is decided: which machine
   * holds them, when it registered, and whether their harness has said what
   * it holds. Opencode's transcript is all it holds — it stores every send
   * the moment it is handed one — so it has said so at once; Claude's CLI
   * holds sends in a queue of its own, which it names when the agent takes
   * it over ({@link MESSAGES_HELD} with `whole`).
   */
  const inCustody = new Map<
    string,
    { machineId: string; since: number; told: boolean }
  >();

  /**
   * An outlived session's sends from before its agent restarted, decided
   * once its harness has said what it holds (rule: a send is read or failed,
   * never pending for good): read if taken up, waiting if held, and
   * otherwise it never reached the session. A machine that could not be
   * asked is asked again at its next heartbeat.
   */
  const decideCustody = (instanceId: string): void => {
    const held = inCustody.get(instanceId);
    if (!held?.told) {
      return;
    }
    settlePending(
      instanceId,
      UNREAD.lost,
      "unheld",
      (send) => send.acceptedAt.getTime() < held.since,
      () => {
        if (inCustody.get(instanceId) === held) {
          inCustody.delete(instanceId);
        }
      }
    );
  };

  /**
   * Takes back a pending send before its session reads it: one the hub still
   * holds (owed) is cancelled here, never having reached the machine; one the
   * harness holds is withdrawn there, and the harness's atomic answer decides
   * the race with its read. "started" when the session took it first.
   */
  /** A withdrawal its machine left unanswered, in a sentence. */
  const withdrawalUnanswered = (machineId: string, reply: Unanswered) =>
    reply.reason === "dead"
      ? commandAwayWords(machineId)
      : `Withdrawal got no answer: ${ctx.silentWords(machineId, reply)}.`;
  const withdrawPending = async (
    row: SentMessageRow,
    machineId: string
  ): Promise<"withdrawn" | "started"> => {
    if (row.owed !== null && ctx.db.takeOwedSend(row.uuid) !== undefined) {
      changeSend(row, { state: "cancelled" });
      return "withdrawn";
    }
    const reply = await ctx.callAgent(
      machineId,
      "withdrawSend",
      [row.uuid],
      READ_TIMEOUT_MS,
      undefined,
      row.instanceId
    );
    switch (reply.kind) {
      case "unanswered":
        throw new Error(withdrawalUnanswered(machineId, reply));
      case "answered":
        if (!reply.value.ok) {
          throw new Error(reply.value.error ?? "Withdrawal failed.");
        }
        break;
      default:
        throw unreachable(reply);
    }
    const now = ctx.db.sendRecord(row.uuid);
    if (now?.state === "cancelled") {
      return "withdrawn";
    }
    if (reply.value.result === "withdrawn") {
      if (now?.state === "pending") {
        changeSend(now, { state: "cancelled" });
      }
      return "withdrawn";
    }
    if (now?.state === "pending") {
      readSend(now, true);
    }
    return "started";
  };

  /**
   * A delegate called finish_item, which ends its turn (work-items.ts
   * `lastTurn`): each send it was handed and has not read, from one the
   * item's finishing hold keeps (work-items.ts `finishingFor`), is withdrawn
   * from its harness and owed again at the hub, kept there until that turn
   * is over. Claude's CLI holds a send handed mid-turn in a queue it drains
   * after the tool call under way: one handed as the model called
   * finish_item joined the turn after the call's answer and was read after
   * the item ended, which reopens nothing (work-items.ts `reopen`), and the
   * turn ended on it. The CLI's withdrawal is atomic with its read, so one
   * read first ("started") reached the model before it called finish_item,
   * and stands. OpenCode and pi store a send as they are handed it, and
   * take no withdrawal. A withdrawal its machine leaves unanswered leaves
   * the send as it was. Never throws.
   */
  const reclaimUnread = async (instanceId: string): Promise<void> => {
    const [row] = ctx.db.getInstancesByIds([instanceId]);
    if (!traitsOf(row?.harness).withdrawSend) {
      return;
    }
    const unread = ctx.db.sendsIn(instanceId, ["pending"]).filter((send) => {
      const origin = (send.body as SentMessage | null)?.origin;
      return (
        send.owed === null &&
        !isKeepAlive(send.body) &&
        !!origin &&
        ctx.workItems.finishingFor(instanceId, origin)
      );
    });
    const takeBackOne = async (send: SentMessageRow): Promise<void> => {
      const reply = await ctx.callAgent(
        row.machineId,
        "withdrawSend",
        [send.uuid],
        READ_TIMEOUT_MS,
        undefined,
        instanceId
      );
      if (
        reply.kind === "answered" &&
        reply.value.ok &&
        reply.value.result === "withdrawn" &&
        ctx.db.oweAgain(send.uuid)
      ) {
        console.log(
          `[hub] send ${send.uuid} to ${instanceId} taken back as it called finish_item: it goes as its next turn`
        );
        publishSend(ctx.db.sendRecord(send.uuid) ?? send);
      }
    };
    await Promise.all(unread.map(takeBackOne));
  };

  /** A retry or queued edit has superseded a send the harness no longer holds. */
  const replaceSend = (replaced: string, by: string): void => {
    const row = ctx.db.sendRecord(replaced);
    if (row?.state === "failed" || row?.state === "cancelled") {
      changeSend(row, { state: "replaced", replacedBy: by });
    }
  };

  /**
   * A harness's word about its sends (`SendSignal`): held, stored under an
   * id, read, or refused. Read ones are read in the order named; one named by
   * an id this hub has no record under was never a send — typed in the
   * harness, or its own. A send read overtakes every pending send accepted
   * before it ({@link overtaken}): those are decided against the transcript
   * at once, and any it does not hold never reached the session.
   */
  const takeSendSignal = (instanceId: string, signal: SendSignal): void => {
    if (signal.kind === "rejected") {
      const row = ctx.db.sendRecord(signal.uuid);
      if (row?.state === "pending" || row?.state === "read") {
        if (isKeepAlive(row.body)) {
          ctx.db.updateKeepAlive(instanceId, { keepAliveTurn: null });
        }
        rejectSend(row, signal.error);
      }
      return;
    }
    if (signal.kind === "held") {
      takeHeld(instanceId, signal);
      return;
    }
    for (const [uuid, harnessId] of Object.entries(signal.storedAs)) {
      ctx.db.linkSend(uuid, harnessId);
    }
    if (signal.kind === "read") {
      takeRead(instanceId, signal.read);
    }
  };

  /**
   * A send handed over again that its machine says the session took already
   * (agent taken-sends.ts): no turn started on it, so it is read with none to
   * follow. One settled meanwhile stands.
   */
  const takeTaken = (instanceId: string, uuid: string): void => {
    const row = ctx.db.sendRecord(uuid);
    if (row?.instanceId !== instanceId || row.state !== "pending") {
      return;
    }
    console.log(
      `[hub] send ${uuid} to ${instanceId} read: its session took it already`
    );
    readSend(row, false);
  };

  /**
   * A send its harness refused, failed after what the session last said —
   * which, when the hub has heard nothing of the session since it started,
   * a transcript read tells first ({@link storedIn}).
   */
  const rejectSend = (row: SentMessageRow, reason: string): void => {
    if (anchors.has(row.instanceId)) {
      failSend(row, reason);
      return;
    }
    detach(
      storedIn(row.instanceId).then(() => {
        const now = ctx.db.sendRecord(row.uuid);
        if (now?.state === "pending" || now?.state === "read") {
          failSend(now, reason);
        }
      }),
      "failed send"
    );
  };

  /**
   * Sends the harness says it holds: they wait for their read through an
   * agent restart. Said `whole`, by an agent taking the process over, it
   * decides the session's custody ({@link decideCustody}).
   */
  const takeHeld = (
    instanceId: string,
    { held, whole }: { held: string[]; whole: boolean }
  ): void => {
    for (const row of ctx.db.sendsFor(held)) {
      if (row.instanceId === instanceId && row.state === "pending") {
        ctx.db.updateSend(row.uuid, { held: true });
      }
    }
    const taken = inCustody.get(instanceId);
    if (whole && taken) {
      taken.told = true;
      decideCustody(instanceId);
    }
  };

  /**
   * Sends the harness has read, read in the order named; then every pending
   * send accepted before the latest of them is overtaken
   * ({@link overtaken}), and decided against the transcript at once.
   */
  const takeRead = (instanceId: string, ids: string[]): void => {
    const order = (row: SentMessageRow): number => {
      const at = ids.indexOf(row.uuid);
      return at >= 0 ? at : ids.indexOf(row.harnessId ?? "");
    };
    const read = ctx.db
      .sendsFor(ids)
      .filter((row) => row.instanceId === instanceId && row.state === "pending")
      .sort((a, b) => order(a) - order(b));
    for (const row of read) {
      if (!isKeepAlive(row.body)) {
        ctx.db.updateKeepAlive(instanceId, { keepAliveTurn: null });
      }
      // A routine's wake of a conversation: the turn it joins is that run's (memory.ts).
      ctx.memoryWatch.read(instanceId, row.body?.origin);
      readSend(row, true);
    }
    const latest = Math.max(...read.map((row) => row.acceptedAt.getTime()));
    if (Number.isFinite(latest)) {
      settlePending(
        instanceId,
        UNREAD.lost,
        "unheld",
        (send) => send.acceptedAt.getTime() < latest
      );
    }
  };

  /**
   * What the session's own turn says about the sends it read. The model's
   * first words answer them, and are where the next failure goes; an error
   * that closes the turn before any is theirs (rule b): they fail with it,
   * and the result frame says which, so it draws no line of its own.
   */
  const observeTurn = (
    instanceId: string,
    frame: FramePayload & { kind: "frame" }
  ): void => {
    const neutral = frame.message;
    // A turn its account's limit refused fails nothing it read: the session
    // reads it when it goes on — carried on at the reset or on another
    // account, or from a summary that carries its last turns verbatim. Nor
    // does one its credential ended that the hub sends again or carries on
    // elsewhere ({@link credentialTurns}).
    if (
      limitRefusesTurn(instanceId, neutral) ||
      ctx.credentialTurns.has(instanceId)
    ) {
      unanswered.delete(instanceId);
      return;
    }
    if (neutral.type === "assistant" && !neutral.parent_tool_use_id) {
      observeAnswer(instanceId, neutral);
      return;
    }
    if (neutral.type !== "result") {
      return;
    }
    const waiting = unanswered.get(instanceId);
    if (!(neutral.is_error && waiting?.size)) {
      unanswered.delete(instanceId);
      return;
    }
    neutral.failedSends = failWaiting(
      instanceId,
      waiting,
      neutral.errors?.length
        ? neutral.errors.join("\n")
        : neutral.result || `Harness error (${neutral.subtype}).`
    );
  };

  /**
   * The model's own message, answering what its turn read. An error the
   * harness wrote in the model's place answers nothing: what it had just
   * read failed, in its words, which its rows carry.
   */
  const observeAnswer = (
    instanceId: string,
    neutral: Extract<
      (FramePayload & { kind: "frame" })["message"],
      { type: "assistant" }
    >
  ): void => {
    const waiting = unanswered.get(instanceId);
    if (neutral.error && waiting?.size) {
      const words = neutral.message.content
        .flatMap((block) => (block.type === "text" ? [block.text] : []))
        .join("\n");
      neutral.failedSends = failWaiting(
        instanceId,
        waiting,
        words || neutral.error
      );
      return;
    }
    unanswered.delete(instanceId);
    if (neutral.uuid) {
      anchors.set(instanceId, neutral.uuid);
    }
  };

  /**
   * Whether `neutral` is a session's account's limit refusing its turn, for a
   * session the at-limit controller carries on: Claude Code's answer whose
   * `error` is its limit, the result of a turn already marked refused, or a
   * pi or OpenCode turn its agent marked `atLimit`. Each by core
   * `atProviderLimit`, never by words.
   */
  const limitRefusesTurn = (
    instanceId: string,
    neutral: (FramePayload & { kind: "frame" })["message"]
  ): boolean => {
    let refused = false;
    if (neutral.type === "assistant" && !neutral.parent_tool_use_id) {
      refused = atProviderLimit({
        type: (neutral as { error?: string }).error,
      });
    } else if (neutral.type === "result") {
      const [row] = ctx.db.getInstancesByIds([instanceId]);
      const provider = row?.accountId
        ? ctx.db.accounts.get(row.accountId)?.provider
        : undefined;
      refused =
        ctx.limitRefused.has(instanceId) ||
        (neutral.is_error &&
          !!provider &&
          provider !== CLAUDE_PROVIDER &&
          LIMITED_PROVIDERS.includes(provider) &&
          neutral.atLimit === true);
    }
    return refused && ctx.atLimit.manages(instanceId);
  };

  /** The sends a session read and nothing answered, failed for `reason`: their uuids. */
  const failWaiting = (
    instanceId: string,
    read: Map<string, string | undefined>,
    reason: string
  ): string[] => {
    const failed = ctx.db
      .sendsFor([...read.keys()])
      .filter((row) => row.state === "read");
    for (const row of failed) {
      failSend(row, reason);
    }
    unanswered.delete(instanceId);
    return failed.map((row) => row.uuid);
  };

  /**
   * A history page's sends, and the record lines it carries.
   *
   * Each stored entry that is sends is linked to their records
   * (`SessionMessage.sends`, {@link sendFinder}). A record from before the hub
   * kept bodies takes the stored copy as its body. A pending send in an entry
   * its harness has taken up has been read: this is the read a restart kept
   * from being framed.
   *
   * The page carries every record it links, every failed record whose anchor
   * is on it — and, on the page that reaches the conversation's start, every
   * one that has none — and on the newest page every send still pending. The
   * newest page also seeds the session's anchor when the hub has heard nothing
   * of it since it started.
   */
  const sendLines = (
    instanceId: string | undefined,
    entries: SessionMessage[],
    newest: boolean,
    start: boolean
  ): { record: SendRecord }[] => {
    const { lines, last } = linkEntries(instanceId, entries);
    if (instanceId) {
      if (newest && last && !anchors.has(instanceId)) {
        anchors.set(instanceId, last);
      }
      const onPage = new Set([
        ...entries.map((entry) => entry.uuid),
        ...lines.keys(),
      ]);
      for (const send of unlinkedOnPage(instanceId, onPage, newest, start)) {
        if (!lines.has(send.uuid)) {
          lines.set(send.uuid, send);
        }
      }
    }
    return [...lines.values()].map((send) => ({ record: toSendRecord(send) }));
  };

  /**
   * The sends a page draws that none of its entries is: every one still
   * pending, on the newest page; every failed one whose anchor is on it; and,
   * on the page that reaches the conversation's start, every failed one with
   * no anchor at all.
   */
  const unlinkedOnPage = (
    instanceId: string,
    onPage: Set<string>,
    newest: boolean,
    start: boolean
  ): SentMessageRow[] =>
    ctx.db
      .sendsIn(instanceId, newest ? ["pending", "failed"] : ["failed"])
      .filter(
        (send) =>
          send.state === "pending" ||
          (send.anchor ? onPage.has(send.anchor) : start)
      );

  /**
   * The sends a page's entries are, linked, by uuid — and the last thing on
   * the page a failed send could be anchored to. A stored error that closes
   * a turn on failed sends, with nothing said in between, is theirs (rule b,
   * read back) and draws no line of its own, as the live result frame did —
   * a send failed that way and since tried again (`replaced`) included.
   */
  const linkEntries = (
    instanceId: string | undefined,
    entries: SessionMessage[]
  ): { lines: Map<string, SentMessageRow>; last: string | undefined } => {
    const sendsOf = sendFinder(instanceId, entries);
    const lines = new Map<string, SentMessageRow>();
    let last: string | undefined;
    let failures: string[] = [];
    for (const entry of entries) {
      if (theirError(entry, failures)) {
        failures = [];
      } else if (entry.type === "assistant" && !entry.parent_tool_use_id) {
        last = entry.uuid;
        failures = [];
      }
      for (const send of linkEntry(entry, sendsOf(entry))) {
        last = send.uuid;
        if (send.state === "failed" || send.state === "replaced") {
          failures.push(send.uuid);
        }
        lines.set(send.uuid, send);
      }
    }
    return { lines, last };
  };

  /**
   * Whether a stored entry is the error that failed the sends before it —
   * an error result, or an error the harness wrote in the model's place —
   * and if so, mark it as theirs, as its live frame was: it draws no line of
   * its own, and is nobody's anchor.
   */
  const theirError = (entry: SessionMessage, failures: string[]): boolean => {
    if (failures.length === 0) {
      return false;
    }
    if (entry.type === "assistant" && entry.error) {
      (entry as unknown as NeutralAssistantMessage).failedSends = failures;
      return true;
    }
    const stored = entry.message as NeutralResultMessage | undefined;
    if (entry.type === "system" && stored?.is_error) {
      stored.failedSends = failures;
      return true;
    }
    return false;
  };

  /**
   * Which sends a stored entry is, in the order its harness took them up:
   * the one under the send's uuid (Claude stores it, or names it as a fold's
   * source), and those stored under the entry's id — opencode's message, pi's
   * entry, and the sends Claude joined into this record.
   *
   * A record that joins several ({@link SessionMessage.joined}) is stored
   * under the last one's uuid; the others are found by their words
   * ({@link joinedWith}), once, and kept under the record's uuid from then on
   * (`harnessId`), so every later read finds them the same way.
   */
  const sendFinder = (
    instanceId: string | undefined,
    entries: SessionMessage[]
  ): ((entry: SessionMessage) => SentMessageRow[]) => {
    const found = ctx.db.sendsFor(
      entries
        .filter((entry) => entry.type === "user" || entry.sourceUuid)
        .flatMap((entry) =>
          entry.sourceUuid ? [entry.sourceUuid, entry.uuid] : [entry.uuid]
        )
    );
    const byUuid = new Map(found.map((send) => [send.uuid, send]));
    const byHarnessId = Map.groupBy(
      found.filter((send) => send.harnessId !== null),
      (send) => send.harnessId as string
    );
    return (entry) => {
      const own = byUuid.get(entry.sourceUuid ?? entry.uuid);
      const held = (byHarnessId.get(entry.uuid) ?? []).filter(
        (send) => send.uuid !== own?.uuid
      );
      const sends = [...held, ...(own ? [own] : [])];
      if (own && instanceId && entry.joined && held.length === 0) {
        sends.push(...joinedWith(instanceId, entry, own));
      }
      return sends.sort(
        (a, b) => a.acceptedAt.getTime() - b.acceptedAt.getTime()
      );
    };
  };

  /** A send's words as the harness was handed them, when they are words alone. */
  const sentWords = (send: SentMessageRow): string | null => {
    const content = (send.body as NeutralUserMessage | null)?.message.content;
    return typeof content === "string" ? content : null;
  };

  /**
   * The sends Claude joined into `entry`, the stored record of `last`, ahead
   * of it: the record's words are theirs and then `last`'s, each on its own
   * line, in the order they were sent ({@link SessionMessage.joined}). Each
   * is found by its words among this session's sends before `last`, latest
   * first — the ones queued with it are the latest — and kept under the
   * record's uuid from here on. Words that do not come apart into this many
   * sends of this session join none.
   */
  const joinedWith = (
    instanceId: string,
    entry: SessionMessage,
    last: SentMessageRow
  ): SentMessageRow[] => {
    const stored = (entry.message as { content?: unknown }).content;
    const own = sentWords(last);
    if (!(typeof stored === "string" && own && stored.endsWith(`\n${own}`))) {
      return [];
    }
    // What is left to account for, ending in the newline before the next part.
    let rest = stored.slice(0, stored.length - own.length);
    const partners: SentMessageRow[] = [];
    const earlier = ctx.db
      .sendsIn(
        instanceId,
        SEND_STATES.filter((state) => state !== "cancelled")
      )
      .filter(
        (send) =>
          send.harnessId === null &&
          send.acceptedAt.getTime() < last.acceptedAt.getTime()
      )
      .reverse();
    for (const send of earlier) {
      const words = sentWords(send);
      if (
        words !== null &&
        (rest === `${words}\n` || rest.endsWith(`\n${words}\n`))
      ) {
        partners.unshift(send);
        rest = rest.slice(0, rest.length - words.length - 1);
        if (partners.length === (entry.joined ?? 0) - 1) {
          break;
        }
      }
    }
    if (rest !== "") {
      return [];
    }
    for (const send of partners) {
      ctx.db.linkSend(send.uuid, last.uuid);
    }
    return partners;
  };

  /**
   * One stored entry, linked to the sends it is. A pending send in an entry
   * its harness has taken up (not {@link SessionMessage.queued}) has been
   * read: this is a read that a restart kept from being framed.
   */
  const linkEntry = (
    entry: SessionMessage,
    found: SentMessageRow[]
  ): SentMessageRow[] => {
    if (found.length === 0) {
      return found;
    }
    entry.sends = found.map((send) => send.uuid);
    return found.map((send) =>
      send.state === "pending" && !entry.queued ? readSend(send, false) : send
    );
  };

  /**
   * A send as its record keeps it (`SendRecord.body`): the message under its
   * uuid, with what rode with it put back in — images first, then the typed
   * words, the files' lines and the pastes, the order the agent and every
   * adapter hand them to the harness in. A file's line names it by its whole
   * hash, which is what lets its row open it; the machine's own copy of the
   * line names its path there.
   */
  const sentFrame = ({
    instanceId,
    message,
    images = [],
    attachments = [],
  }: SendPayload): SentMessage => {
    if (!(images.length || attachments.length)) {
      return message;
    }
    const files = attachments
      .flatMap((attachment) =>
        attachment.kind === "file"
          ? [
              attachedFileLine(
                `${ATTACHMENTS_HOME}/${attachedFileName(instanceId, attachment, true)}`,
                attachment
              ),
            ]
          : []
      )
      .join("\n");
    const pasted = attachments
      .map((attachment) =>
        attachment.kind === "text"
          ? `\n\n<pasted-text name="${attachment.name}">\n${attachment.content}\n</pasted-text>`
          : ""
      )
      .join("");
    const lines = `${files ? `\n\n${files}` : ""}${pasted}`;
    const said = message.message.content;
    return {
      ...message,
      message: {
        role: "user",
        content: [
          ...images.map(({ mediaType, data }) => ({
            type: "image" as const,
            source: { type: "base64" as const, media_type: mediaType, data },
          })),
          ...(typeof said === "string"
            ? [{ type: "text" as const, text: said + lines }]
            : said),
        ],
      },
    };
  };

  /**
   * An envelope that names a session by one of its former ids (db
   * `instanceIdOf`: a session whose continuations the hub folded into one),
   * addressed to the session by its id now: its machine, and its id on the
   * envelope and in the payload. Unchanged for any other id. Every send,
   * control and stop that names a session by id passes here.
   */
  const byIdNow = <P extends { instanceId?: string }>(
    envelope: Envelope<P>
  ): Envelope<P> => {
    const named = envelope.payload.instanceId ?? envelope.instanceId;
    const now = named ? ctx.db.instanceIdOf(named) : undefined;
    if (!(named && now) || now === named) {
      return envelope;
    }
    const [row] = ctx.db.getInstancesByIds([now]);
    return {
      ...envelope,
      instanceId: now,
      machineId: row?.machineId ?? envelope.machineId,
      payload: { ...envelope.payload, instanceId: now },
    };
  };

  /**
   * What taking a send means beyond the send itself, whoever sent it — the
   * one place it is done. The reader's hand takes down fleet watch's notice
   * about the session; a session's first words name it; a queued hand-off is work the target now
   * carries, and a send that starts a turn reads it; the parent's or the
   * reader's word to a delegate starts its item's count of quiet turns over.
   */
  const afterSend = ({ machineId, payload }: Envelope<SendPayload>): void => {
    const { instanceId, message } = payload;
    if (isKeepAlive(message)) {
      return;
    }
    if (message.origin.kind === "human") {
      ctx.watch?.humanSend(instanceId);
    }
    ctx.workItems.heard(instanceId, message.origin);
    if (!hasAttachments(payload)) {
      ctx.nameFromLiveTurn(machineId, instanceId, message);
    }
    const from = peekPeer(payload);
    if (from && !isQuerySend(payload)) {
      handoffs.set(instanceId, { from, at: Date.now() });
      ctx.publishInstances(machineId);
    } else if (isQuerySend(payload) && handoffs.delete(instanceId)) {
      ctx.publishInstances(machineId);
    }
  };

  /**
   * A send with each picture it carries named in its words, after what it
   * says (core `attachedPictureLine`): the name the session hands it on by
   * (handed-inputs.ts `{ attachment }`), from the bytes, so every harness
   * reads it as its words. A picture reaches a session as bytes alone
   * otherwise, and the only name it had was Files' "Picture N", which the
   * hub mints by reading the whole transcript and no session sees. A send
   * already naming them (the same send handed on again) is as it was.
   */
  const picturesNamed = (
    envelope: Envelope<SendPayload>
  ): Envelope<SendPayload> => {
    const { images = [], message } = envelope.payload;
    const said = message.message.content;
    // Its pictures as the payload carries them, and those its content holds
    // (an artifact event's, `artifactEventPayload`).
    const carried = [
      ...images,
      ...(typeof said === "string" ? [] : said).flatMap((block) =>
        block.type === "image" && block.source.type === "base64"
          ? [{ mediaType: block.source.media_type, data: block.source.data }]
          : []
      ),
    ];
    const lines = carried.flatMap(({ mediaType, data }) => {
      const name = mediaNameOf(mediaType, data);
      return name ? [attachedPictureLine(pictureName(name))] : [];
    });
    const words =
      typeof said === "string"
        ? said
        : said
            .flatMap((block) => (block.type === "text" ? [block.text] : []))
            .join("\n");
    const added = [...new Set(lines)].filter((line) => !words.includes(line));
    if (added.length === 0) {
      return envelope;
    }
    const named = added.join("\n");
    return {
      ...envelope,
      payload: {
        ...envelope.payload,
        message: {
          ...message,
          message: {
            ...message.message,
            content:
              typeof said === "string"
                ? `${said}\n\n${named}`
                : [...said, { type: "text" as const, text: named }],
          },
        },
      },
    };
  };

  /**
   * THE ONE PATH A MESSAGE TAKES INTO A SESSION, whoever sent it — a reader, a
   * rule, fleet watch's nudge, a delegate's report, another session's hand-off.
   * A session whose process is gone is woken first ({@link wakeForSend}), so
   * every sender reaches a sleeping session the same way. The machine gets
   * it, and the hub writes its record — pending, or failed when the machine
   * is not there to take it — and says so on the session's stream, so every
   * tab, device and late joiner draws the same row under the same id.
   *
   * Finished work is reached by the reader or its parent only: their send
   * wakes the same session, and the item reopens when that process reads it
   * ({@link readSend}); anyone else's fails with the item's state
   * ({@link inputRefusal}), and nothing wakes. A send nothing takes up fails
   * with why, and its sender hears it ({@link failSend}).
   *
   * A uuid the hub already has a record for is the same send again (a tab
   * trying once more after its socket dropped): the machine is not handed it
   * twice, and the record it has is said again for whoever asked.
   *
   * ONE RULE FOR EVERY HOLD: a send its session cannot take yet is never
   * handed to the machine, where a session with no process refuses it, and
   * never refused for the hold. It is accepted as owed (`sent_messages.owed`),
   * drawn queued like any pending send, and goes once the hold ends
   * ({@link releaseOwed}), in the order accepted. The holds: the session's
   * start held while its machine installs an update ({@link holdingStarts}),
   * its machine's agent away within its reconnecting window
   * ({@link machinePresence}), its account at its limit or its compaction
   * after a move under way ({@link heldAtLimit}), its item finishing against
   * one who may reopen it (work-items.ts `finishingFor`), and a send owed before it
   * to the same session, which it never overtakes — but that compaction's
   * own steps (`ahead`), which go first ({@link compactionSend}).
   *
   */
  const deliverSend = (
    asked: Envelope<SendPayload>,
    ahead = false
  ): SentMessageRow | undefined => {
    const envelope = toContinuation(byIdNow(asked), "refused");
    if (!envelope) {
      return;
    }
    tellForkFirst(envelope);
    tellPlanFirst(envelope);
    return deliverToSession(picturesNamed(envelope), ahead);
  };

  /**
   * The session `instanceId`'s work goes on in now: the last of its
   * continuations ({@link retireContinued}), or itself. A chain is followed
   * to its end; one that loops ends where it started.
   */
  const continuationNow = (instanceId: string): string => {
    const seen = new Set<string>([instanceId]);
    let now = instanceId;
    for (;;) {
      const next = ctx.db.getInstancesByIds([now])[0]?.continuedInto;
      if (!next || seen.has(next)) {
        return now;
      }
      seen.add(next);
      now = next;
    }
  };

  /**
   * Whether a message is the hub's word to one process about itself: its
   * keep-alive ping, its carry-on at its account's reset, its filing turn
   * or `/compact`. Such words go to no other session.
   */
  const aboutItsProcess = (message: SentMessage): boolean =>
    isKeepAlive(message) ||
    (message.origin.kind === "system" &&
      (message.origin.name === LIMIT_ORIGIN ||
        message.origin.name === COMPACTION_ORIGIN));

  /**
   * THE RULE FOR A CONTINUED SESSION'S MAIL: a send to a session a
   * continuation took the work item of never reaches it, and never wakes it
   * (core `relaunchOf` refuses it). It goes to the session its work goes on
   * in ({@link continuationNow}), from whoever sent it, as `byIdNow` does
   * for a former id; but the hub's word to its process alone
   * ({@link aboutItsProcess}) is dropped, as that process is gone. A
   * person's words sent now (`person: "refused"`) stay addressed to it, and
   * {@link inputRefusal} refuses them with where its work went, as its page
   * says in its composer's place: a person's message is never moved to
   * another session unseen. Only what was queued for it before the move
   * (`"carried"`, {@link moveOwedSend}) goes on, the person's too, its row
   * there saying it was replaced. Undefined when dropped; unchanged for any
   * other session.
   */
  const toContinuation = (
    envelope: Envelope<SendPayload>,
    person: "refused" | "carried"
  ): Envelope<SendPayload> | undefined => {
    const named = envelope.payload.instanceId;
    const now = continuationNow(named);
    if (now === named) {
      return envelope;
    }
    const { message } = envelope.payload;
    if (person === "refused" && message.origin.kind === "human") {
      return envelope;
    }
    if (aboutItsProcess(message)) {
      console.info(
        `[continuation] ${named.slice(0, 8)} was continued in ${now.slice(0, 8)}: the hub's ${isKeepAlive(message) ? "keep-alive ping" : `${message.origin.kind === "system" ? message.origin.name : ""} word`} to its process is dropped, as that process never runs again.`
      );
      return undefined;
    }
    const [row] = ctx.db.getInstancesByIds([now]);
    console.info(
      `[continuation] A send to ${named.slice(0, 8)} goes to ${now.slice(0, 8)}, the session it was continued in (send ${message.uuid}).`
    );
    return {
      ...envelope,
      instanceId: now,
      machineId: row?.machineId ?? envelope.machineId,
      payload: { ...envelope.payload, instanceId: now },
    };
  };

  /**
   * An owed send to a continued session ({@link toContinuation}), handed on
   * as the rule says: its record says what replaced it, and the same message
   * goes to the session the work goes on in under a fresh uuid, behind what
   * that session was owed; the hub's word to the old process is cancelled.
   */
  const moveOwedSend = (send: SentMessageRow): void => {
    const owed = ctx.db.takeOwedSend(send.uuid);
    if (owed === undefined) {
      return;
    }
    const moved = toContinuation(owed, "carried");
    if (!moved) {
      changeSend(send, { state: "cancelled" });
      return;
    }
    const uuid = crypto.randomUUID();
    changeSend(send, { state: "replaced", replacedBy: uuid });
    const { delivery: _delivery, ...payload } = moved.payload;
    deliverSend({
      ...moved,
      payload: { ...payload, message: { ...payload.message, uuid } },
    });
  };

  /**
   * A fork's first send goes behind the hub's word on whose the delegates in
   * its copied history are ({@link forkNoticeFor}): a note its first turn
   * folds in, whoever sends that turn — the person, or the parent's brief to
   * a delegate started as a fork. Once: any send on record for the session
   * means it was told, or had nothing to be told.
   */
  const tellForkFirst = ({ machineId, payload }: Envelope<SendPayload>) => {
    const { instanceId, message } = payload;
    if (
      isKeepAlive(message) ||
      !ctx.db.getInstancesByIds([instanceId])[0]?.forkedFrom ||
      ctx.db.sendsIn(instanceId, [...SEND_STATES]).length > 0
    ) {
      return;
    }
    const notice = ctx.forkNoticeFor(instanceId);
    if (!notice) {
      return;
    }
    deliverToSession(
      {
        verb: "send",
        machineId,
        instanceId,
        payload: {
          instanceId,
          message: {
            type: "user",
            uuid: crypto.randomUUID(),
            message: { role: "user", content: notice },
            parent_tool_use_id: null,
            origin: FORK_ORIGIN,
            shouldQuery: false,
          },
        },
      },
      false
    );
  };
  /**
   * A send that starts a turn goes behind what its session is owed of the
   * person's plan changes (a tick or a move on it while it was idle; on a
   * project's Caw, his project's task plans): one note its turn reads first,
   * whoever sends that turn. The plan's own words go as they are.
   */
  const tellPlanFirst = ({ machineId, payload }: Envelope<SendPayload>) => {
    const { instanceId, message } = payload;
    if (
      isKeepAlive(message) ||
      !isQuerySend(payload) ||
      (message.origin.kind === "system" && message.origin.name === PLAN_ORIGIN)
    ) {
      return;
    }
    const words = ctx.planChanges?.foldInto(instanceId);
    if (!words) {
      return;
    }
    deliverToSession(
      {
        verb: "send",
        machineId,
        instanceId,
        payload: {
          instanceId,
          message: {
            type: "user",
            uuid: crypto.randomUUID(),
            message: { role: "user", content: words },
            parent_tool_use_id: null,
            origin: { kind: "system", name: PLAN_ORIGIN },
            shouldQuery: false,
          },
        },
      },
      false
    );
  };

  /**
   * The message `envelope` carries, opened with the hub's line that CawCo
   * moved its session's checkout (core injected.ts `withMovedLine`: cut
   * again, or rebased as it landed) when this is the first message handed
   * to a session of it since the move (work-items.ts `movedTold`). Called
   * as a send is handed to its machine, whichever way it goes there (at
   * once, or released after a hold), so a handoff, a follow-up's or retry's
   * brief and a continuation all carry it, on any harness. A keep-alive ping
   * never does. Answers whether it did.
   */
  const toldMove = (envelope: Envelope<SendPayload>): boolean => {
    const { instanceId, message } = envelope.payload;
    if (isKeepAlive(message)) {
      return false;
    }
    const move = ctx.workItems.movedTold(instanceId);
    if (!move) {
      return false;
    }
    const { content } = message.message;
    let next: typeof content;
    if (typeof content === "string") {
      next = withMovedLine(content, move);
    } else {
      const at = content.findIndex((part) => part.type === "text");
      const first = content[at];
      next =
        first?.type === "text"
          ? content.with(at, {
              ...first,
              text: withMovedLine(first.text, move),
            })
          : [
              { type: "text", text: withMovedLine("", move).trim() },
              ...content,
            ];
    }
    // A copy: the send's record keeps the words as they were sent, so the
    // line, which is the agent's alone, never stands in its sender's row.
    envelope.payload = {
      ...envelope.payload,
      message: { ...message, message: { ...message.message, content: next } },
    };
    const how =
      move.kind === "recut"
        ? `its clone was cut again at ${move.commit.slice(0, 9)} on ${move.branch}`
        : `its checkout moved from ${move.from.slice(0, 9)} to ${move.to.slice(0, 9)} as it landed on ${move.branch}`;
    console.log(
      `[hub] send ${message.uuid} to ${instanceId} opens with the hub's line that ${how}`
    );
    return true;
  };

  /** HH:MM on the hub's clock, as the presence line and the notes' heading say a time. */
  const clockOf = (at: number): string =>
    new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(at);

  /** The recap each of the hub's "back" sends was given as it was first handed: a hand again gives it the same ({@link recapFor}). */
  const recapsGiven = new Map<string, PresenceSaid>();

  /**
   * The recap a session's "back" send carries ({@link tellBack}), read as it
   * is first handed (a held session's when it next runs): the notes the
   * session kept in its plan while the person was away (`awayNotesOf`) and
   * what of the session's waits on them now, exactly as Needs you lists it
   * (core `planWaitsOf`), with the hub's own away-since. Once per return
   * (notifications.ts `takeRecap`, kept on the hub through a restart), and
   * never notes the person has seen (`session_plans.away_seen`: opened in
   * the plan, or recapped before). Recapped, they are seen: the plan ring's
   * mark goes. Undefined when there is none to give.
   */
  const recapFor = (
    instanceId: string,
    uuid: string
  ): PresenceSaid | undefined => {
    const given = recapsGiven.get(uuid);
    if (given) {
      return given;
    }
    const back = ctx.notifications.takeRecap(instanceId);
    if (!back) {
      return undefined;
    }
    const plan = ctx.db.sessionPlan(instanceId);
    const notes = awayNotesOf(plan?.spec ?? undefined);
    if (!notes || plan?.awaySeen === notes.notes) {
      return undefined;
    }
    detach(ctx.plans.seeAway(instanceId), "away notes recapped are seen");
    const waiting = planWaitsOf(
      instanceId,
      plan?.steps ?? [],
      ctx.artifactLane.now().needs
    );
    const said: PresenceSaid = {
      kind: "on",
      recap: {
        notes: notes.notes,
        section: notes.since,
        since: clockOf(back.since),
        ...(waiting.length > 0 ? { waiting } : {}),
      },
    };
    recapsGiven.set(uuid, said);
    return said;
  };

  /** Whether `row` holds news the person hasn't seen: away notes in its plan, unseen ({@link recapFor}). */
  const holdsNews = (row: PublicInstanceRow): boolean => {
    if (
      !talksWithPerson(row) ||
      row.continuedInto !== null ||
      row.status === "discarded"
    ) {
      return false;
    }
    const plan = ctx.db.sessionPlan(row.id);
    const notes = awayNotesOf(plan?.spec ?? undefined);
    return (
      !!notes &&
      plan?.awaySeen !== notes.notes &&
      !ctx.db
        .sendsIn(row.id, ["pending"])
        .some((send) => !!send.body.origin && isBack(send.body.origin))
    );
  };

  /**
   * THE RETURN'S RECAP: the person came back from being away (notifications.ts
   * `turned`: the rollup of every device's facts went from away to here), so
   * each session holding news for them ({@link holdsNews}) is sent the hub's
   * word that they are back (core `BACK_MESSAGE`). It starts a turn whose
   * presence line carries the notes ({@link recapFor}), and its reply is the
   * recap: nothing waits on the person to ask. A session with no news gets
   * nothing, nor does one this word already waits in. One send each: a
   * session whose process is up takes its turn now; one asleep is woken in
   * its turn among the hub's own launches on its machine ({@link paceSpawn},
   * SPAWN_PACE_MS apart), so a return to many never starts their processes
   * at once; one held (at its limit, its machine away or paused) gets it
   * when it next runs, as any send does.
   */
  const tellBack = (): void => {
    recapsGiven.clear();
    const told = ctx.db
      .listedInstancesByIds(ctx.db.plansWithAwayNotes())
      .filter(holdsNews);
    for (const row of told) {
      deliverSend(
        sessionWord(row, BACK_MESSAGE, {
          kind: "system",
          name: BACK_ORIGIN,
          line: noticeWords.back,
        })
      );
    }
    console.log(
      `[presence] the person is back: ${told.length} session(s) holding news from while they were away told so, each to recap it${told.length > 0 ? `: ${told.map((row) => ctx.sessionName(row)).join(", ")}` : ""}`
    );
  };

  /**
   * What the session is told of the person as this send starts its turn
   * (core injected.ts `presenceLine`): on this chat (the person's own words
   * always are), here elsewhere, or away since when, and, on any other
   * send, that their last message still waits for its reply. The hub's word
   * that they are back ({@link tellBack}) carries the notes the session kept
   * in its plan while they were away, for its recap ({@link recapFor}).
   */
  const personSaid = (
    instanceId: string,
    { origin, uuid }: { origin: NeutralOrigin; uuid: string }
  ): PresenceSaid => {
    if (origin.kind === "human") {
      return { kind: "on" };
    }
    const recap = isBack(origin) ? recapFor(instanceId, uuid) : undefined;
    if (recap) {
      return recap;
    }
    const person = ctx.notifications.person();
    const owed = ctx.db.personUnanswered(instanceId) !== null;
    if (person.state === "here" && person.chats.includes(instanceId)) {
      return { kind: "on", unanswered: owed };
    }
    if (person.state === "here") {
      return { kind: "elsewhere", unanswered: owed };
    }
    return {
      kind: "away",
      unanswered: owed,
      since: person.since === null ? null : clockOf(person.since),
    };
  };

  /**
   * The person's words or act as the message a session is sent (caw.ts
   * {@link PersonsSend}): their words alone on their own origin, CawCo's
   * note beside them in the send's reminder; or CawCo's notice of their act
   * on the act origin, with its line.
   */
  const personsMessage = (said: PersonsSend, uuid: string): SentMessage => ({
    type: "user",
    uuid,
    parent_tool_use_id: null,
    ...(said.by === "you"
      ? {
          message: { role: "user", content: said.words },
          origin: { kind: "human" },
          ...(said.note ? { reminder: said.note } : {}),
        }
      : {
          message: { role: "user", content: said.text },
          origin: { kind: "system", name: ACT_ORIGIN, line: said.line },
        }),
  });

  /**
   * Whether a send to `row` says where the person is: a session that talks
   * with them (roles.ts `talksWithPerson`), and not a clean one, whose
   * context has none of CawCo's words (core `SpawnPayload.clean`).
   */
  const toldOfPerson = (row: InstanceRow): boolean =>
    talksWithPerson(row) && !row.clean;

  /** A send's content with `lines` in one reminder block after its last text (core `withReminder`). */
  const remindedContent = (
    content: SentMessage["message"]["content"],
    lines: readonly string[]
  ): SentMessage["message"]["content"] => {
    if (typeof content === "string") {
      return withReminder(content, lines);
    }
    const at = content.findLastIndex((part) => part.type === "text");
    const last = content[at];
    return last?.type === "text"
      ? content.with(at, { ...last, text: withReminder(last.text, lines) })
      : [...content, { type: "text", text: withReminder("", lines) }];
  };

  /**
   * The send as its machine is handed it: a copy with CawCo's word to the
   * agent after its text, in one `<system-reminder>` block (core
   * `withReminder`), read fresh at every hand, a hand again included, on
   * every harness alike: the send's own reminder (core
   * `NeutralUserMessage.reminder`: where it came from, which skill applies),
   * then the person's presence ({@link personSaid}). The record keeps the
   * send as it was accepted: the person's bubble is their words alone. A
   * keep-alive ping goes as it is; a send to a session that does not talk
   * with the person (roles.ts `talksWithPerson`: a work item asks its
   * parent, never the person) carries no presence.
   */
  const presenced = (
    envelope: Envelope<SendPayload>
  ): Envelope<SendPayload> => {
    const { instanceId, message } = envelope.payload;
    if (isKeepAlive(message)) {
      return envelope;
    }
    const [row] = ctx.db.getInstancesByIds([instanceId]);
    const said =
      row && !toldOfPerson(row) ? undefined : personSaid(instanceId, message);
    const { reminder, ...sent } = message;
    const lines = [
      ...(reminder ? [reminder] : []),
      ...(said ? [presenceLine(said)] : []),
    ];
    if (lines.length === 0) {
      return envelope;
    }
    const next = remindedContent(sent.message.content, lines);
    if (said) {
      console.log(
        `[presence] send ${message.uuid} to ${instanceId.slice(0, 8)}: the person is ${said.kind}${said.unanswered ? ", their last message unanswered" : ""}${said.kind === "on" && said.recap ? `, back after away since ${said.recap.since}, with the plan's notes under "Since ${said.recap.section}"` : ""}`
      );
    }
    return {
      ...envelope,
      payload: {
        ...envelope.payload,
        message: { ...sent, message: { ...sent.message, content: next } },
      },
    };
  };

  /** {@link deliverSend}'s session path: the message into the session itself. */
  const deliverToSession = (
    envelope: Envelope<SendPayload>,
    ahead: boolean
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the single send transaction orders refusal, recovery, delivery and persistence.
  ): SentMessageRow => {
    const { instanceId, message } = envelope.payload;
    const { machineId } = envelope;
    const keepAlive = isKeepAlive(message);
    const known = ctx.db.sendRecord(message.uuid);
    if (known) {
      publishSend(known);
      return known;
    }
    const refused = keepAlive
      ? undefined
      : ctx.sendRefusal(instanceId, message.origin);
    if (refused?.gone) {
      throw new WorkItemRefusal(409, refused.reason);
    }
    const [target] = ctx.db.getInstancesByIds([instanceId]);
    // The parent's, the conversation's or the reader's word ends an interrupt's hold
    // on the session's item, before anything below asks about it: what the
    // hold kept goes right behind this send.
    if (!(refused || keepAlive)) {
      ctx.workItems.unhold(instanceId, message.origin);
    }
    // Kept, not woken: the session has no process and this sender may not
    // start a turn in it ({@link startsTurnIn}).
    const kept =
      !(refused || keepAlive) &&
      !!target &&
      ctx.wakesForSend(target) &&
      !ctx.startsTurnIn(target, message);
    // Kept, not handed: a turn at its account's limit would only be refused.
    const limited =
      !(refused || keepAlive || ahead) &&
      heldAtLimit(instanceId, message.origin, message.uuid);
    // Kept while the owner has its machine paused (machine-pause.ts), and
    // while an interrupt holds its item and this sender may not wake it.
    const paused =
      !(refused || keepAlive) &&
      ctx.machinePause.until(machineId) !== undefined;
    const held =
      !(refused || keepAlive) &&
      ctx.workItems.heldFor(instanceId, message.origin);
    // Kept while its item is blocked: what it cannot start without is missing.
    const blocked =
      !(refused || keepAlive) && ctx.workItems.blockedFor(instanceId);
    // Kept while a retired workspace is cut again for it: the cut starts now.
    if (held) {
      ctx.workItems.recutFor(instanceId);
    }
    // Kept while its item finishes: its landing runs, or the turn that
    // called finish_item is still ending. Handed now, it would join that
    // turn and reopen nothing; it goes as the session's next turn.
    const finishing =
      !(refused || keepAlive) &&
      ctx.workItems.finishingFor(instanceId, message.origin);
    const agent = refused ? undefined : ctx.registry.agent(machineId);
    // Held for a machine inside its window, never failed there (core
    // handover.ts `send`).
    const away =
      !(refused || agent || keepAlive) &&
      ctx
        .hubStep({ kind: "send", machineId, now: Date.now() })
        .some(
          (command) =>
            command.kind === "send-verdict" && command.verdict === "hold"
        );
    const accepted =
      Boolean(agent) || away || kept || paused || held || finishing || blocked;
    const from =
      message.origin.kind === "peer" ? message.origin.fromSession : undefined;
    const waitSummary =
      accepted && from ? ctx.workItems.waitSummary(from, instanceId) : "";
    if (waitSummary) {
      const { content } = message.message;
      message.message.content =
        typeof content === "string"
          ? `${content}${waitSummary}`
          : [...content, { type: "text", text: waitSummary }];
    }
    if (agent && !(kept || limited || paused || held || finishing || blocked)) {
      if (keepAlive) {
        ctx.db.updateKeepAlive(instanceId, { keepAliveTurn: message.uuid });
      } else {
        ctx.wakeForSend(agent, machineId, instanceId, isBack(message.origin));
      }
    }
    const owed =
      away ||
      kept ||
      paused ||
      held ||
      finishing ||
      blocked ||
      (agent !== undefined &&
        !keepAlive &&
        (limited || (!ahead && sendWaits(instanceId))));
    // Every hand-off is named, so the machine handing one back names which
    // ({@link takeBack}); a keep-alive ping is never handed back.
    const delivery = keepAlive ? undefined : crypto.randomUUID();
    if (delivery) {
      envelope.payload.delivery = delivery;
    }
    // What was sent, as its record keeps it: the hub's line on a moved
    // checkout goes to the agent alone ({@link toldMove}).
    const asSent = envelope.payload;
    if (agent && !owed) {
      toldMove(envelope);
      ctx.sendFrame(agent, presenced(envelope));
    }
    // Kept for its machine alone, not for its session, an interrupt's hold
    // or its item's finish.
    if (owed && !agent && !(kept || held || finishing || blocked)) {
      owedForMachine(machineId, message.uuid);
    }
    // Built after the send has gone: the machine is handed the image bytes,
    // the record a reference to them.
    const mode = sendMode(envelope.payload);
    // The record as it stands now: the envelope is changed as it goes on.
    const whole = structuredClone(envelope);
    const outcome = accepted
      ? {
          state: "pending" as const,
          ...(owed ? { owed: whole } : {}),
          ...(delivery ? { envelope: whole, delivery } : {}),
        }
      : {
          state: "failed" as const,
          reason: refused?.reason ?? machineAwayWords(machineId),
          refusal: refused
            ? (refused.refusal ?? null)
            : { kind: "machine-away" as const, machineId },
          anchor: anchors.get(instanceId) ?? null,
        };
    let record: SentMessageRow = ctx.db.recordSend({
      uuid: message.uuid,
      instanceId,
      acceptedAt: new Date(),
      body: externalizeImages(sentFrame(asSent)),
      mode,
      ...(message.replaces ? { replaces: message.replaces } : {}),
      ...outcome,
    });
    if (owed) {
      record = keepHold(record);
    }
    // The person wrote to it: the sidebar's Recent list orders it by this
    // and lists it again after a Done.
    if (
      accepted &&
      byPerson(message.origin) &&
      ctx.db.noteWrote(instanceId, record.acceptedAt)
    ) {
      ctx.publishInstances(machineId);
    }
    // The send it retries goes first, so a screen folds that row away as
    // this one arrives.
    if (message.replaces) {
      replaceSend(message.replaces, record.uuid);
    }
    publishSend(record);
    // A send that woke its session goes out behind what was kept for it.
    if (
      agent &&
      owed &&
      !(kept || away || limited || paused || held || finishing || blocked)
    ) {
      releaseOwed({ instanceId });
    }
    // Kept at its account's limit: the move it owes, or one another account
    // has room for, is tried now, and the send goes on the account it lands
    // on ({@link AtLimit.lookNow}).
    if (agent && limited) {
      detach(
        ctx.atLimit.lookNow(
          instanceId,
          "a message to it is held at its account's limit",
          ctx.takenUpBy(target, message.origin)
        ),
        "at-limit look"
      );
    }
    if (accepted) {
      if (from) {
        ctx.workItems.delivered(from, instanceId);
      }
      afterSend(envelope);
    }
    return record;
  };

  /**
   * Whether a session cannot take a send now though its machine is
   * connected: its start is held while the machine installs an update
   * ({@link sendSpawn}), or a send owed before this one has not gone yet.
   */
  const sendWaits = (instanceId: string): boolean =>
    ctx.db.owesSpawn(instanceId) || ctx.db.owedSends({ instanceId }).length > 0;

  /**
   * Whether a send to `instanceId` waits at the hub because of its account's
   * limit: held there until an account takes it (the at-limit controller's
   * hold), where a turn would only be refused; or, moved, its compaction
   * there under way ({@link compactions}), whose steps go first and alone, so
   * Claude Code never joins anything into its `/compact`; or its filing turn
   * at its context threshold ({@link fileAtThreshold}), a plan of the same
   * kind, so the turn files and does nothing else. The controller's
   * own word at the reset is not held by its hold; a compaction holds
   * everything but its own steps, which go `ahead` and, handed back by a
   * machine with no process for them, go to the session's next one
   * ({@link releaseOne}). Held by their own compaction, they never went: a
   * session moved at 11:57:34 on 2026-10-22 waited on its filing turn until
   * an interrupt at 12:14:59 stopped it. Its own steps are the plan's two
   * sends by their uuids (`uuid`), not every send of the compaction's
   * origin: a Continue's filing turn, of that origin too, waits behind it.
   */
  const heldAtLimit = (
    instanceId: string,
    origin: NeutralOrigin,
    uuid: string
  ): boolean => {
    // The hub's own word to the process about its move (what it ended, its
    // carry-on) is held by neither hold: it reads with the carry-on, before
    // the filing turn.
    if (origin.kind === "system" && origin.name === LIMIT_ORIGIN) {
      return false;
    }
    const plan = ctx.db.atLimit.compaction(instanceId);
    if (plan) {
      return !ctx.stepUuids(plan).includes(uuid);
    }
    // Going on from a summary as its move: what it is sent goes to the new
    // conversation once it has opened, or back to it if the summary fails;
    // only its filing turn, sent under the job's id, goes now.
    const job = ctx.moveJobOf(instanceId);
    if (job) {
      return uuid !== job.id;
    }
    return ctx.db.atLimit.hold(instanceId) !== undefined;
  };

  /**
   * What a session held at its account's limit was kept goes, in order, once
   * nothing holds it ({@link heldAtLimit}): the sessions whose owed sends
   * are held for the limit or the compaction after a move, as each hold was
   * last written ({@link keepHold}), each released whole so the sends behind
   * them go too. A send kept for anything else (its session at rest, its
   * machine away) is not the limit's to release, and each look at every
   * session's limit runs this: once it scanned every owed send of every
   * machine, two hundred and more kept for sessions at rest on obelisk,
   * and held the hub's loop seconds at each look (probe-kit hub-live-copy).
   */
  const releaseLimitHeld = (): void => {
    // {@link holdOf}'s words for a send {@link heldAtLimit} keeps.
    for (const instanceId of ctx.db.owedSessionsHeld([
      "limit",
      "signin",
      "compacting",
      "filing",
    ] satisfies readonly SendHold[])) {
      releaseOwed({ instanceId });
    }
  };

  /**
   * A send to a machine past its window, as the person reads it (DESIGN.md's
   * error formula): the machine by its name, never its id; what is safe;
   * what to do.
   */
  const machineAwayWords = (machineId: string): string => {
    const name = knownMachineName(machineId);
    return `${name ?? "Its machine"} isn't connected, so this message wasn't delivered. It's kept here: send it again once ${name ?? "the machine"} is back.`;
  };
  /** A machine's name for a sentence, when this hub knows the machine. */
  const knownMachineName = (machineId: string): string | undefined =>
    ctx.db.listAgents().some((each) => each.machineId === machineId)
      ? ctx.machineName(machineId)
      : undefined;
  /**
   * A command (an interrupt, a model change) refused for its machine's
   * absence, as the person reads it: the machine by its name, and, inside
   * its window, that it is on its way back.
   */
  const commandAwayWords = (machineId: string): string => {
    const name = knownMachineName(machineId) ?? "The session's machine";
    return ctx.reconnectingFor(machineId) > 0
      ? `${name} is restarting, so that didn't reach it. Try again in a moment.`
      : `${name} isn't connected, so that didn't reach it. Try again once it's back.`;
  };

  /**
   * A send kept for its machine's pause, while its session's item finishes,
   * for an interrupt's hold on that item against this sender, or while its
   * retired workspace is cut again ({@link deliverToSession}).
   */
  const pausedOrHeld = (
    row: InstanceRow,
    origin: SentMessage["origin"] | undefined
  ):
    | Extract<SendHold, "paused" | "finishing" | "held" | "recut" | "blocked">
    | undefined => {
    if (ctx.machinePause.until(row.machineId) !== undefined) {
      return "paused";
    }
    if (ctx.workItems.blockedFor(row.id)) {
      return "blocked";
    }
    if (origin && ctx.workItems.finishingFor(row.id, origin)) {
      return "finishing";
    }
    if (!(origin && ctx.workItems.heldFor(row.id, origin))) {
      return;
    }
    return ctx.workItems.recutHold(row.id, origin) ? "recut" : "held";
  };

  /**
   * THE RULE THAT NO HOLD IS SILENT: an owed send's hold is written on its
   * record as it is kept ({@link deliverToSession}) and again at every look
   * that keeps it ({@link releaseOne}), with a line in the hub's log when it
   * changes; each hold's words name what releases it (delegation-actions.ts
   * `HOLD_WORDS`). A hub that starts reads each one back
   * ({@link sayKeptAtStart}). Answers the record as stored.
   */
  const keepHold = (record: SentMessageRow): SentMessageRow => {
    const hold = holdOf(record);
    if (!hold || hold === record.hold) {
      return record;
    }
    console.log(
      `[hub] send ${record.uuid} to ${record.instanceId} queued: ${hold}${record.hold ? ` (was ${record.hold})` : ""}`
    );
    return ctx.db.updateSend(record.uuid, { hold }) ?? record;
  };

  /**
   * Why an owed send waits, in {@link SendHold}'s terms: its session at
   * rest, its account's limit or its compaction after a move, its machine's
   * pause, its item's finish or hold, else its machine away within its
   * grace, else its session's start held ({@link startHold}: an update, or
   * a build older than the hub's), else sends owed before it. Undefined for
   * a send its machine has.
   */
  const holdOf = (record: SentMessageRow): SendHold | undefined => {
    if (!record.owed) {
      return;
    }
    const [row] = ctx.db.getInstancesByIds([record.instanceId]);
    if (row && ctx.keptAsleep(row)) {
      return "resting";
    }
    const origin = (record.body as SentMessage | null)?.origin;
    if (origin && heldAtLimit(record.instanceId, origin, record.uuid)) {
      // Behind its compaction after a move, or its filing turn at its
      // context threshold, not its old account's limit.
      const plan = ctx.db.atLimit.compaction(record.instanceId);
      if (plan) {
        return plan.fill ? "filing" : "compacting";
      }
      // Held with no reset to wait for: its credential was refused.
      return ctx.db.atLimit.hold(record.instanceId)?.until === null
        ? "signin"
        : "limit";
    }
    return (row && pausedOrHeld(row, origin)) ?? machineHold(record, row);
  };

  /** {@link holdOf}'s last word: its machine away, its start held, or sends before it. */
  const machineHold = (
    record: SentMessageRow,
    row: InstanceRow | undefined
  ): SendHold => {
    const away = row ? ctx.machinePresence(row.machineId) : undefined;
    if (
      row &&
      away?.kind === "reconnecting" &&
      !ctx.registry.agent(row.machineId)
    ) {
      return away.why;
    }
    if (!ctx.db.owesSpawn(record.instanceId)) {
      return "behind";
    }
    // A machine away was answered above, by why it is away; a start no hold
    // keeps waits its turn among the hub's own ({@link paceSpawn}).
    const held = row && ctx.startHold(row.machineId)?.kind;
    return held && held !== "away" ? held : "starting";
  };

  /**
   * A session's send, from its CawCo tools (`handoff`, `start_session`'s
   * opening, a report): checked as a session's send must be, then the one
   * send path ({@link deliverSend}), and what became of it. A send that
   * failed is refused with why.
   */
  const sessionSend = (
    asked: Envelope<SendPayload>,
    requester: InstanceRow
  ): SendDelivery => {
    const envelope = byIdNow(asked);
    const { payload } = envelope;
    const malformed = normalizeRelayMessage(payload);
    if (malformed) {
      throw new WorkItemRefusal(400, malformed);
    }
    const { instanceId } = payload;
    const [before] = ctx.db.getInstancesByIds([instanceId]);
    const record = deliverSend({
      ...envelope,
      machineId: envelope.machineId || requester.machineId,
    });
    // No record: the send went nowhere a session holds.
    if (!record) {
      return { busy: ctx.pulses.get(instanceId)?.busy === true };
    }
    if (record.state === "failed") {
      throw new WorkItemRefusal(404, record.reason ?? "the send failed");
    }
    const hold = holdOf(record);
    const plan =
      !hold && before && ctx.wakesForSend(before)
        ? relaunchOf(before)
        : undefined;
    return {
      ...holdWords(hold, before),
      ...(plan && plan.kind !== "refused" ? { woke: plan.kind } : {}),
      busy: ctx.pulses.get(instanceId)?.busy === true,
    };
  };

  /** A send's hold as its sender is told it: a pause says which machine, until when. */
  const holdWords = (
    hold: SendHold | undefined,
    row: InstanceRow | undefined
  ): Pick<SendDelivery, "hold" | "pause"> => {
    if (!hold) {
      return {};
    }
    const pause =
      hold === "paused" && row
        ? ctx.machinePause.words(row.machineId)
        : undefined;
    return pause ? { hold, pause } : { hold };
  };

  /**
   * What a machine is owed, handed over once the hold it waited on is over,
   * in the order accepted and each once. A session asleep is woken first; a
   * failed or stopped one is not, its sends waiting for whatever starts it
   * next (a person's message, a restart), so a process that keeps dying is
   * never started again by its own sends. A send goes only to a process that
   * is up or starting, and one whose start is still held keeps its sends
   * owed until that start goes ({@link flushOwedStarts}). Each goes out as
   * accepted now, under a hand-off of its own ({@link takeBack}): what its
   * machine settles at its register never counts it among the sends a
   * restart lost, as it never reached the machine before.
   */
  const releaseOwed = (
    of: { instanceId: string } | { machineId: string }
  ): void => {
    for (const send of ctx.db.owedSends(of)) {
      releaseOne(send);
    }
  };

  /**
   * Whether an owed send stays kept for its session's account limit, its
   * machine's pause, its item's finish (work-items.ts `finishingFor`), or
   * its item's hold ({@link WorkItems.heldFor}). Held for
   * its workspace's turn or cut, the wait that releases it is asked for
   * here too, as the send path asks for it.
   */
  const owedHeld = (
    instanceId: string,
    machineId: string,
    origin: SentMessage["origin"],
    uuid: string
  ): boolean => {
    if (
      heldAtLimit(instanceId, origin, uuid) ||
      ctx.machinePause.until(machineId) !== undefined
    ) {
      return true;
    }
    if (
      ctx.workItems.finishingFor(instanceId, origin) ||
      ctx.workItems.blockedFor(instanceId)
    ) {
      return true;
    }
    if (!ctx.workItems.heldFor(instanceId, origin)) {
      return false;
    }
    if (ctx.workItems.recutHold(instanceId, origin)) {
      ctx.workItems.recutFor(instanceId);
    }
    return true;
  };

  /**
   * `send` is owed to a session compacting after a move (a step of it, or
   * the hub's word that goes with its carry-on) whose process is gone: it
   * ended, or never came up, before it took the step, so nothing the person
   * sees would start it, and what waits behind the compaction would wait for
   * an interrupt. The hub starts it again on its conversation (a wake, as a
   * send's, {@link wakeForSend}) and says so on the move's line. True when
   * it did; what is owed goes once it is up.
   */
  const relaunchForStep = (
    send: SentMessageRow,
    row: ReturnType<typeof ctx.db.getInstancesByIds>[number],
    agent: NonNullable<ReturnType<typeof ctx.registry.agent>>
  ): boolean => {
    const plan = ctx.db.atLimit.compaction(send.instanceId);
    if (!(plan && ctx.wakesForSend(row))) {
      return false;
    }
    console.info(
      `[at-limit] ${ctx.sessionName(row)}'s process ended before it took its ${ctx.stepWords(plan.stage)}, so the hub starts it again on ${ctx.accountWords(row.accountId)} to take it; what waits behind the compaction goes once that ends.`
    );
    if (plan.move?.kind === "moved") {
      const move = { ...plan.move, relaunched: true as const };
      ctx.db.atLimit.patchCompaction(plan.instanceId, { move });
      ctx.sayCompaction(
        { ...plan, move },
        plan.stage === "compacting" ? "compacting" : "filing"
      );
    }
    ctx.wakeForSend(agent, row.machineId, row.id);
    return true;
  };

  /**
   * One owed send, as {@link releaseOwed} hands it over; one that stays
   * owed has its hold written again ({@link keepHold}).
   */
  const releaseOne = (send: SentMessageRow): void => {
    if (handOwed(send)) {
      return;
    }
    const still = ctx.db.sendRecord(send.uuid);
    if (still?.state === "pending" && still.owed) {
      keepHold(still);
    }
  };

  /** {@link releaseOne}'s hand: true once the send has left the hub's keeping (handed, moved or failed). */
  const handOwed = (send: SentMessageRow): boolean => {
    const [row] = ctx.db.getInstancesByIds([send.instanceId]);
    // Owed to a session whose work a continuation took on: it goes there.
    if (row?.continuedInto) {
      moveOwedSend(send);
      return true;
    }
    const agent = row ? ctx.registry.agent(row.machineId) : undefined;
    if (!(row && agent)) {
      return false;
    }
    // A compaction's own step whose session's process ended before it took
    // it: the hub moved it and owes it that step, so it starts it again
    // there ({@link relaunchForStep}); the step goes once it is up.
    // Kept for a session nothing owed may wake: it waits for a send that may.
    // Handed back by a machine with no process for it: it waits for the
    // session's next one ({@link waitingForProcess}).
    if (
      relaunchForStep(send, row, agent) ||
      ctx.keptAsleep(row) ||
      ctx.waitingForProcess.has(send.instanceId)
    ) {
      return false;
    }
    const envelope = send.owed;
    if (!envelope) {
      return false;
    }
    // Kept while its account is at its limit: it goes once that is over.
    // Kept while its machine is paused, or an interrupt holds its item
    // against this sender: it goes once the pause ends, or one who may wake
    // it writes to it.
    const { origin } = envelope.payload.message;
    if (owedHeld(send.instanceId, row.machineId, origin, send.uuid)) {
      return false;
    }
    const refused = ctx.sendRefusal(send.instanceId, origin);
    if (refused) {
      ctx.db.takeOwedSend(send.uuid);
      failSend(send, refused.reason, refused.refusal);
      return true;
    }
    if (row.status === "sleeping") {
      ctx.wakeForSend(agent, row.machineId, send.instanceId, isBack(origin));
    }
    return handToProcess(agent, send, envelope);
  };

  /** `send` handed over once its session has a process up or starting and no start held; else it stays owed for that. True when handed. */
  const handToProcess = (
    agent: NonNullable<ReturnType<typeof ctx.registry.agent>>,
    send: SentMessageRow,
    envelope: Envelope<SendPayload>
  ): boolean => {
    const [now] = ctx.db.getInstancesByIds([send.instanceId]);
    if (
      ctx.db.owesSpawn(send.instanceId) ||
      !(now && (now.status === "running" || now.status === "starting")) ||
      ctx.db.takeOwedSend(send.uuid) === undefined
    ) {
      return false;
    }
    handReleased(agent, send, envelope);
    return true;
  };

  /**
   * An owed send handed to its machine as its hold ends ({@link releaseOne}),
   * under a hand-off of its own, the hub's line in it when it is the first
   * message since CawCo moved its checkout ({@link toldMove}). Its
   * record keeps it whole as handed (`envelope`, with this hand-off and that
   * line), in the same write as its new hand-off: what a machine that comes
   * back is handed again ({@link handAgain}), and what a fold or a
   * hand-back owes again, is the send as it was last handed, never as it
   * was accepted. Its row is still drawn from its words as sent (`body`):
   * that line is the agent's alone.
   */
  const handReleased = (
    agent: NonNullable<ReturnType<typeof ctx.registry.agent>>,
    send: SentMessageRow,
    envelope: Envelope<SendPayload>
  ): void => {
    const delivery = crypto.randomUUID();
    envelope.payload.delivery = delivery;
    toldMove(envelope);
    changeSend(send, {
      acceptedAt: new Date(),
      delivery,
      envelope,
    });
    ctx.sendFrame(agent, presenced(envelope));
  };

  /** A machine past its grace: what it was owed fails as any send to an absent machine does, but for a start an update still holds. */
  const failOwedAway = (machineId: string): void => {
    // What a paused machine was owed waits for the pause's end, its agent
    // away or not: the end hands it over once the agent is back.
    if (ctx.machinePause.until(machineId) !== undefined) {
      return;
    }
    for (const send of ctx.db.owedSends({ machineId })) {
      if (!waitsOnMachine(send)) {
        continue;
      }
      if (ctx.db.takeOwedSend(send.uuid) !== undefined) {
        failSend(send, machineAwayWords(machineId), {
          kind: "machine-away",
          machineId,
        });
      }
    }
    // Law `owed-send-machine-has-deadline`, at the window's end: the machine
    // reads offline with no deadline now, so nothing kept for it waits on it.
    const left = ctx.db.owedSends({ machineId }).filter(waitsOnMachine);
    ctx.laws.holds(
      left.length === 0,
      "owed-send-machine-has-deadline",
      () =>
        `Machine ${machineId} reads offline with no deadline, and ${left.length} send(s) kept for it still wait on it: ${left.map((send) => send.uuid).join(", ")}.`
    );
  };

  /**
   * Whether an owed send waits on its machine: not one kept for a session at
   * rest, nor at its account's limit (it goes once the limit is over or the
   * session has moved, its machine back by then), nor one whose start an
   * update still holds.
   */
  const waitsOnMachine = (send: SentMessageRow): boolean => {
    const [row] = ctx.db.getInstancesByIds([send.instanceId]);
    const origin = (send.body as SentMessage | null)?.origin;
    return !(
      ctx.db.owesSpawn(send.instanceId) ||
      (row && ctx.keptAsleep(row)) ||
      (origin && heldAtLimit(send.instanceId, origin, send.uuid))
    );
  };

  /**
   * Law `owed-send-machine-has-deadline` (core invariant.ts), where a send is
   * kept for its machine ({@link deliverToSession}): that machine reads
   * paused, or reconnecting with its window's deadline ahead
   * ({@link reconnectingFor}), never offline with no deadline, which nothing
   * would ever end. Broken, the send fails as a request: it is not kept.
   *
   * Born red, once: dad89261b^ with this check laid on, a hub just started
   * (its grace for every machine) and a machine last heard an hour ago; a
   * person's send to its session: "[law] Law broken:
   * owed-send-machine-has-deadline. … Send red-send was about to be kept for
   * machine red-machine, which reads offline with no deadline: no socket, no
   * reconnecting window ahead, no pause." The grace kept it while
   * `reconnectingFor` read the machine's last word. This tree, the same
   * run: "send red-send to red-e queued: hub", no law.
   */
  const owedForMachine = (machineId: string, uuid: string): void =>
    ctx.laws.raise(() =>
      invariant(
        ctx.machinePause.until(machineId) !== undefined ||
          ctx.reconnectingFor(machineId) > 0,
        "owed-send-machine-has-deadline",
        () =>
          `Send ${uuid} was about to be kept for machine ${machineId}, which reads offline with no deadline: no socket, no reconnecting window ahead, no pause.`
      )
    );

  return {
    anchors,
    byIdNow,
    changeSend,
    commandAwayWords,
    continuationNow,
    decideCustody,
    deliverSend,
    deliverToSession,
    failOwedAway,
    failSend,
    handoffs,
    inCustody,
    interruptedTurns,
    losePending,
    noteInterrupt,
    notesOnly,
    observeTurn,
    personsMessage,
    presenced,
    publishSend,
    reclaimUnread,
    releaseLimitHeld,
    releaseOne,
    releaseOwed,
    retryFromTray,
    sendLines,
    sendsPending,
    sentFrame,
    sessionSend,
    settleBackoff,
    settlePending,
    takeBack,
    takeSendSignal,
    takeTaken,
    tellBack,
    turnOver,
    turnUnderWay,
    turnsWritten,
    unanswered,
    withdrawPending,
  };
};
