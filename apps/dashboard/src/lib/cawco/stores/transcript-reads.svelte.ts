/**
 * A transcript's reads from the hub: its newest page (which subscribes it
 * on this socket), the older pages before it, the page the server served
 * with the route, and what a read that failed says and when it reads again.
 */

import { detach } from "@cawco/core/detach";
import type {
  TranscriptBlock,
  TranscriptPage,
  TranscriptPageBranch,
} from "@cawco/core/transcript-types";
import { TRANSCRIPT_OLDER_PAGE } from "#lib/config.js";
import { hub } from "#lib/platform/hub.js";
import {
  deadlineIn,
  type HubFailure,
  hubAsk,
  hubFailure,
  machineAway,
  type Refused,
  refusalClause,
} from "#lib/platform/hub-read.js";
import { connectionState, hubRun } from "../hub/socket.svelte";
import { adoptPage, beginRead, followUnread } from "../stream";
import {
  boardState,
  instanceIndex,
  type Machine,
  machineName,
} from "./board.svelte";
import { ahead } from "./clock.svelte";
import { subscriptionIds, tabMachine, tabNamed } from "./follows.svelte";
import { streamHost, streamState } from "./ledger.svelte";
import {
  type ReadFault,
  type SessionState,
  session,
  sessionsState,
  trackWorking,
} from "./sessions.svelte";
import {
  adoptTranscriptPage,
  prependTranscriptPage,
} from "./transcripts.svelte";

/**
 * How long one transcript page request may go without an answer, its body
 * read with it (Eden reads both in one call). Past it the request is
 * aborted and made once more ({@link readPage}); a phone on a flaky link
 * otherwise leaves a request hanging, and the pane waiting on it, forever.
 */
const TRANSCRIPT_READ_LIMIT_MS = 30_000;

/** What a read past {@link TRANSCRIPT_READ_LIMIT_MS} says of itself. */
const READ_LIMIT_SENTENCE = `The hub didn't answer within ${TRANSCRIPT_READ_LIMIT_MS / 1000} seconds`;

/**
 * How long after a failed read, the hub answering, the transcript is read
 * again: the nth failure in a row waits the nth delay, and every one past
 * the last waits the last. A success starts it over. Our choice: a blip is
 * caught up within seconds, a hub that keeps failing is asked about once a
 * minute.
 */
const READ_AGAIN_MS = [2000, 4000, 8000, 16_000, 32_000, 60_000];

/**
 * The newest-page read in flight per view: a second ask joins it. `cancel`
 * ends it without an answer — the view's own reader is asking for a fresh one.
 */
export const pageReads = new Map<
  string,
  { read: Promise<TranscriptOutcome>; cancel: () => void }
>();

/**
 * `machineId` is online: every transcript the dashboard follows whose last
 * read found that machine offline is read now, unless a read is already out
 * or the backoff is already reading it again ({@link readAgainLater}).
 */
export function readBehind(machineId: string): void {
  for (const id of subscriptionIds()) {
    const held = sessionsState.sessions[id];
    const fault = held?.readFault ?? held?.behind;
    if (
      held &&
      !held.loading &&
      failedReads.get(id)?.timer === undefined &&
      fault?.reason === "offline" &&
      fault.machineId === machineId
    ) {
      detach(readTranscript(id, "machineOnline"), "readTranscript");
    }
  }
}

/**
 * How a stored transcript read ended. A read that fails with nothing on screen
 * has to be *said* — a stored session whose machine is asleep otherwise sits on
 * an empty pane forever, which reads as a broken link rather than an
 * unreachable machine.
 */
export type TranscriptOutcome =
  /**
   * `skipped` marks an `ok` that read nothing because a read was already in
   * hand — in flight, or landed — so a caller looking at an empty view knows
   * the emptiness is not this read's answer.
   */
  | { ok: true; skipped?: boolean }
  /**
   * `status` is the hub's HTTP answer where there was one: 404 is "no such
   * session", not a fault.
   */
  | ({ ok: false; status?: number } & ReadFault);

/** Puts a session back to "nothing has been said about the read" — Try again's first move. */
export function clearReadFault(instanceId: string): void {
  const held = sessionsState.sessions[instanceId];
  if (held) {
    held.readFault = null;
  }
}

/**
 * The server's read of this load found the view's machine away (its served
 * tail's 503): that is this load's read, kept as the view's fault, and the
 * view is read again on what can answer it ({@link readFailed}: the machine's
 * deadline, the board listing it online), never asked again meanwhile.
 */
export function keepServedAway(viewId: string, fault: ReadFault): void {
  if (fault.reason === "offline") {
    readFailed(session(viewId), fault);
  }
}

/**
 * The server's read of this load answered (its served tail's page): that is
 * this view's newest read, taken as {@link readNewestPage} takes one, and
 * nothing reads the page again. Its stream resumes from the page's `seq`
 * ({@link adoptPage}): on the socket open now when its board names the
 * page's hub run, else on the first board that does (subscriptions.svelte.ts `followHeld`),
 * the hub replaying what came after out of its ring or resetting. A page of
 * another run than the open socket's, or a view this tab already holds or
 * is reading, is no page to take: false, and the view is read as ever.
 */
export function keepServedPage(viewId: string, page: TranscriptPage): boolean {
  const target = session(viewId);
  const run = page.hubRun ?? null;
  const connected = connectionState.status === "connected";
  if (
    target.reads > 0 ||
    target.blocks.length > 0 ||
    pageReads.has(viewId) ||
    (connected && run !== hubRun())
  ) {
    return false;
  }
  target.readFault = null;
  target.behind = null;
  readLanded(viewId);
  adoptTranscriptPage(target, page);
  adoptPage(streamState, streamHost, viewId, {
    seq: page.seq ?? 0,
    run,
    connected,
  });
  trackWorking(target);
  return true;
}

/**
 * The newest transcript page the server read for a view, or how the hub
 * refused it — what `/session/[id]`'s server load hands the pane it names.
 */
export type ServerTail =
  | { ok: true; page: TranscriptPage; viewId: string }
  | {
      detail: string;
      /** The machine a 503 named as not connected, else null. */
      machineId: string | null;
      ok: false;
      /**
       * How long more that machine is on its way back, ms, as the hub said
       * it (`machineAway`); else null. Relative: the pane makes it a
       * deadline on the browser's clock once, as it takes the tail.
       */
      reconnectingMs: number | null;
      status: number;
      viewId: string;
    };

/**
 * The hub's codes for a read its machine's harness CLI stands in the way of
 * (hub routes/instance-edits.ts): the machine refuses that CLI, or an
 * install of it runs there now. Either is read again once the machine runs
 * it, and the pane shows the machine's block, the install under way with it.
 */
const HARNESS_WAITS = new Set(["harness-refused", "harness-updating"]);

/**
 * Why a transcript read failed, said the way the pane says it: one sentence
 * of why ({@link hubFailure}), never the hub's body as it came. `away` is
 * the machine a 503 named: that is the hub saying the machine is not
 * connected, a state of the fleet, not a fault in the read, and a different
 * sentence. `reconnectingUntil`: the machine on its way back, until when.
 * The hub's `harness-refused` is the machine refusing the harness CLI the
 * conversation is read through: a state of the machine too, read again once
 * it runs one CawCo runs, never a read that failed.
 */
export function readFaultOf(
  failure: HubFailure,
  away: string | null,
  reconnectingUntil: number | null = null
): ReadFault {
  if (away) {
    return awayFault(away, reconnectingUntil);
  }
  const message = refusalClause(failure);
  if (!HARNESS_WAITS.has(failure.code ?? "")) {
    return { reason: "failed", message };
  }
  return failure.code === "harness-updating"
    ? { reason: "refused", updating: true, message }
    : { reason: "refused", message };
}

/** A read's machine away, as its fault says it ({@link readFaultOf}). */
function awayFault(
  machineId: string,
  reconnectingUntil: number | null
): ReadFault {
  return {
    reason: "offline",
    machineId,
    ...(reconnectingUntil === null ? {} : { reconnectingUntil }),
    message: `${machineName(machineId)} is offline, so its stored transcript can't be read right now`,
  };
}

/**
 * Whether a read's machine is on its way back now: its hub's deadline still
 * ahead on the clock ({@link ahead}). Past it, the machine is offline with
 * nothing having to say so.
 */
export function reconnectingNow(fault: ReadFault | null | undefined): boolean {
  return (
    fault?.reason === "offline" &&
    fault.reconnectingUntil !== undefined &&
    ahead(fault.reconnectingUntil)
  );
}

/** What a read fault says now: a machine on its way back, or the fault's own sentence. */
export function faultMessage(fault: ReadFault): string {
  return fault.reason === "offline" && reconnectingNow(fault)
    ? `${machineName(fault.machineId)} is reconnecting, so its stored transcript is read once it's back`
    : fault.message;
}

/**
 * Why a read that never reached an answer failed, in one sentence: the
 * read's own limit says itself; anything else the network threw is said by
 * what it means, not by the browser's words for it.
 */
function thrownReason(error: unknown): string {
  if (error instanceof Error && error.message === READ_LIMIT_SENTENCE) {
    return READ_LIMIT_SENTENCE;
  }
  return "The hub couldn't be reached";
}

/** Why a page read ended with nothing, said the way the pane says it. */
function pageFault(refused: Refused): TranscriptOutcome {
  const failure = hubFailure(refused);
  const { away, reconnectingMs } = machineAway(refused.response);
  return {
    ok: false,
    status: refused.response.status,
    ...readFaultOf(failure, away, deadlineIn(reconnectingMs)),
  };
}

/** Why the newest page is read: each caller of {@link readTranscript} names itself. */
export type ReadCause =
  /** A reader opened the session: a pane, a peek, a hover, a delegate card. */
  | "open"
  /** The hub's ring could not replay the gap (`stream.reset`). */
  | "streamReset"
  /** The replay came back broken {@link MAX_RESYNC_ATTEMPTS} times. */
  | "backlogBroken"
  /** The reader asked again after a failed read. */
  | "retry"
  /** The socket came back: every transcript the dashboard follows is read again. */
  | "reconnect"
  /** A transcript this tab holds is watched again, its stream let go meanwhile. */
  | "follow"
  /** The machine the last read found offline is online again. */
  | "machineOnline"
  /** The machine whose harness CLI refused the last read runs it now. */
  | "harnessRuns"
  /**
   * The hub's reconnecting deadline for the last read's machine passed: its
   * data read afresh. The view already says offline, on the clock.
   */
  | "deadline"
  /** The last read failed while the hub answered: read again on {@link READ_AGAIN_MS}. */
  | "backoff"
  /**
   * The page landed from another hub run than the socket's board names: its
   * `seq` counts in a numbering this socket's streams do not.
   */
  | "otherRun";

/**
 * A session's transcript, read once: the newest page the hub built, then its
 * stream from the `seq` that page was read at. An `open` read is skipped when
 * the view already follows the stream; every other cause reads it again. A
 * read already in flight answers for any ask that lands meanwhile, unless
 * `fresh`: its reader left the view and came back, so that read is ended
 * unanswered and a new one starts.
 */
export function readTranscript(
  viewId: string,
  cause: ReadCause = "open",
  fresh = false
): Promise<TranscriptOutcome> {
  // A tab the hub has not named yet is read once it has (workspace
  // `named`), if it names one.
  if (!tabNamed(viewId)) {
    return Promise.resolve({ ok: true, skipped: true });
  }
  const target = session(viewId);
  const inFlight = pageReads.get(viewId);
  if (inFlight && !fresh) {
    return inFlight.read;
  }
  inFlight?.cancel();
  // A stream this view already follows carries everything after the page it
  // was read at — or, for a session this tab just started, everything there
  // is.
  if (cause === "open" && streamState.cursors[viewId]?.subscribed) {
    return Promise.resolve({ ok: true, skipped: true });
  }
  // A conversation stored on a machine the board lists away is not asked:
  // the hub could only refuse it (503). The view says the machine is away,
  // as that refusal would have, and the board listing it online reads it
  // (`readBehind`).
  const away = storedAwayOn(viewId);
  if (away) {
    const fault = awayFault(away.machineId, away.reconnectingUntil ?? null);
    readFailed(target, fault);
    return Promise.resolve({ ok: false, ...fault });
  }
  const controller = new AbortController();
  const read: Promise<TranscriptOutcome> = readNewestPage(
    target,
    cause,
    controller.signal
  ).finally(() => {
    // Only this read's own entry: a fresh one may have taken the slot.
    if (pageReads.get(viewId)?.read === read) {
      pageReads.delete(viewId);
    }
  });
  pageReads.set(viewId, { read, cancel: () => controller.abort() });
  return read;
}

/**
 * The machine a view's conversation is stored on, when the hub holds no row
 * for it and the board lists that machine away: the hub reads such a
 * conversation off its machine alone. A row is read whatever its machine:
 * the hub may hold its transcript built. Null before the first board, whose
 * machines are not known yet.
 */
function storedAwayOn(viewId: string): Machine | null {
  const waits = storedReadWaits(viewId);
  return waits?.on === "machine" ? waits.machine : null;
}

/** What a read off a stored conversation's machine waits on ({@link storedReadWaits}). */
export type StoredWait = { on: "board" } | { machine: Machine; on: "machine" };

/**
 * What a read off a view's stored conversation waits on before it asks the
 * hub, when the hub holds no row for it and the view names its machine: the
 * hub reads it off that machine alone. `machine` while the board lists that
 * machine away, its row; `board` before the first board, whose machines are
 * not known yet; null when it can be asked. Read reactively: the board, the
 * machines and the rows are all `$state`.
 */
export function storedReadWaits(viewId: string): StoredWait | null {
  // Read first, so a reader that runs before the first board runs again
  // when the board's machines land.
  const { machines } = boardState;
  if (instanceIndex.byId.has(viewId)) {
    return null;
  }
  const machineId = tabMachine(viewId);
  if (!machineId) {
    return null;
  }
  if (hubRun() === null) {
    return { on: "board" };
  }
  const machine = machines.find((row) => row.machineId === machineId);
  return machine && machine.status !== "online"
    ? { on: "machine", machine }
    : null;
}

/** A transcript page as the route answers it. */
type TranscriptPageRead = Extract<PageAsked, { ok: true }>["value"];

/** One request for a transcript page, as Eden reads it ({@link hubAsk}). */
const askPage = (
  viewId: string,
  page: { cursor?: string; limit?: number },
  signal: AbortSignal
) =>
  hubAsk(
    hub.api.instances({ id: viewId }).transcript.get({
      query: {
        ...(page.cursor ? { before: page.cursor } : {}),
        ...(page.limit ? { limit: String(page.limit) } : {}),
      },
      fetch: { signal },
    })
  );

/** How a transcript page request ended: the page, or the hub's refusal of it. */
type PageAsked = Awaited<ReturnType<typeof askPage>>;

/**
 * One request for a transcript page, aborted when it takes longer than
 * {@link TRANSCRIPT_READ_LIMIT_MS} to be answered and read, or when `cancel`
 * fires.
 */
async function requestPage(
  viewId: string,
  page: { cursor?: string; limit?: number },
  cancel?: AbortSignal
): Promise<PageAsked> {
  const request = new AbortController();
  const stop = () => request.abort(cancel?.reason);
  cancel?.addEventListener("abort", stop, { once: true });
  // WebKit rejects an aborted fetch with its own "Fetch is aborted", whatever
  // reason the abort carried, so the limit's sentence is thrown from here.
  const late = new Error(READ_LIMIT_SENTENCE);
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    request.abort(late);
  }, TRANSCRIPT_READ_LIMIT_MS);
  try {
    return await askPage(viewId, page, request.signal);
  } catch (error) {
    throw timedOut ? late : error;
  } finally {
    clearTimeout(timer);
    cancel?.removeEventListener("abort", stop);
  }
}

/**
 * A transcript page, requested and — when that request fails or times out —
 * requested once more at once. A hub that answers, with a page or a refusal,
 * is an answer and is not asked twice. The second failure is thrown.
 */
async function readPage(
  viewId: string,
  page: { cursor?: string; limit?: number },
  cancel?: AbortSignal
): Promise<PageAsked> {
  try {
    return await requestPage(viewId, page, cancel);
  } catch (error) {
    if (cancel?.aborted) {
      throw error;
    }
    return await requestPage(viewId, page, cancel);
  }
}

/**
 * The pages read back from the newest, as one read: its rows oldest first,
 * the cursor before them, the branches read, and why a page before them
 * could not be read.
 */
interface ReadBack {
  blocks: TranscriptBlock[];
  branches: TranscriptPageBranch[];
  cursor: string | null;
  older: ReadFault | null;
}

/**
 * The newest page, and the pages before it while it does not reach a row
 * the view holds: read back only until the read meets a held row, the
 * conversation's start, or a page that cannot be read (then the strip before
 * the first row says why, {@link SessionState.olderFault}). The hub's row ids
 * are the same on every read, so rows meet by id; what the read holds is
 * merged into the rows held ({@link mergeRows}).
 */
async function readBackToMeet(
  target: SessionState,
  page: TranscriptPage,
  cancel: AbortSignal
): Promise<ReadBack> {
  // Every row in `blocks` is one the hub placed (`take`): this tab's own
  // sends wait in `local` until it does.
  const heldIds = new Set(target.blocks.map((message) => message.id));
  let read = page.blocks;
  let { branches, cursor } = page;
  while (
    heldIds.size > 0 &&
    cursor !== null &&
    !read.some((block) => heldIds.has(block.id))
  ) {
    const previous = await olderPage(target.instanceId, cursor, cancel);
    if (!("blocks" in previous)) {
      return { blocks: read, branches, cursor, older: previous };
    }
    const have = new Set(read.map((block) => block.id));
    read = [...previous.blocks.filter((block) => !have.has(block.id)), ...read];
    const listed = new Set(branches.map((branch) => branch.toolUseId));
    branches = [
      ...previous.branches.filter((branch) => !listed.has(branch.toolUseId)),
      ...branches,
    ];
    ({ cursor } = previous);
  }
  return { blocks: read, branches, cursor, older: null };
}

/**
 * Why a read failed, where the view says it: over rows held, they stay where
 * the reader has them and the view is behind ({@link SessionState.behind}):
 * the line over them says why, with its way back (transcript/Behind.svelte),
 * never a toast (DESIGN.md, The Work Outlives Its Surface Rule); with nothing
 * held, the pane says why in their place. A read the hub failed is read again on {@link READ_AGAIN_MS}; one
 * that found the machine offline waits for it ({@link readBehind}), unless
 * the hub already lists that machine online: then the machine list has
 * nothing more to say, and its every change would read again at once, so it
 * is read again on the backoff too. One that found it reconnecting waits for
 * it as well; the view says offline once the hub's deadline for it passes,
 * on the clock ({@link reconnectingNow}), and the data is read again then
 * ({@link readAtDeadline}). One the hub answered with nothing by its id
 * (`again` false, a 404) is not read again by itself, and neither is one
 * its machine's harness CLI refuses: the view reads it again once the
 * machine runs one CawCo runs (SessionPane).
 */
function readFailed(
  target: SessionState,
  fault: ReadFault,
  again = true
): void {
  if (target.blocks.length > 0) {
    target.behind = fault;
  } else {
    target.readFault = fault;
  }
  if (!again) {
    return;
  }
  // A session there is, its stream followed whatever became of its read: a
  // send's record the hub made meanwhile is said on its row (stream.ts
  // `followUnread`).
  followUnread(
    streamState,
    streamHost,
    target.instanceId,
    connectionState.status === "connected"
  );
  const listedOnline =
    fault.reason === "offline" &&
    boardState.machines.some(
      (machine) =>
        machine.machineId === fault.machineId && machine.status === "online"
    );
  if (fault.reason === "failed" || listedOnline) {
    readAgainLater(target.instanceId);
  } else if (
    fault.reason === "offline" &&
    fault.reconnectingUntil !== undefined
  ) {
    readAtDeadline(target.instanceId, fault.reconnectingUntil);
  }
}

/** The read each view waits for while its machine reconnects: at the hub's deadline for it. */
const deadlineReads = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Reads the view's data again at `deadline`, when the hub stops reading its
 * machine as reconnecting, unless a read has landed meanwhile (the machine
 * back, {@link readBehind}) or a newer one answered by then. Only the data:
 * the view turns from reconnecting to offline on the clock, read or not.
 */
function readAtDeadline(viewId: string, deadline: number): void {
  clearTimeout(deadlineReads.get(viewId));
  deadlineReads.set(
    viewId,
    setTimeout(
      () => {
        deadlineReads.delete(viewId);
        const held = sessionsState.sessions[viewId];
        const fault = held?.behind ?? held?.readFault;
        if (
          held &&
          !held.loading &&
          fault?.reason === "offline" &&
          fault.reconnectingUntil === deadline &&
          subscriptionIds().includes(viewId)
        ) {
          detach(readTranscript(viewId, "deadline"), "readTranscript");
        }
      },
      Math.max(0, deadline - Date.now())
    )
  );
}

/** The failed reads in a row, by view, and the read again each waits for. */
const failedReads = new Map<
  string,
  { count: number; timer: ReturnType<typeof setTimeout> | undefined }
>();

/** Schedules the read again after the latest failure, on {@link READ_AGAIN_MS}. */
function readAgainLater(viewId: string): void {
  const failed = failedReads.get(viewId) ?? { count: 0, timer: undefined };
  clearTimeout(failed.timer);
  const wait = READ_AGAIN_MS[Math.min(failed.count, READ_AGAIN_MS.length - 1)];
  failed.count += 1;
  failed.timer = setTimeout(() => {
    failed.timer = undefined;
    const held = sessionsState.sessions[viewId];
    if (
      held &&
      !held.loading &&
      (held.behind ?? held.readFault) &&
      subscriptionIds().includes(viewId)
    ) {
      detach(readTranscript(viewId, "backoff"), "readTranscript");
    }
  }, wait);
  failedReads.set(viewId, failed);
}

/** A read landed: the next failure waits the first delay again. */
function readLanded(viewId: string): void {
  clearTimeout(failedReads.get(viewId)?.timer);
  failedReads.delete(viewId);
  clearTimeout(deadlineReads.get(viewId));
  deadlineReads.delete(viewId);
}

/**
 * The newest page into the view, and its stream resumed from the page's
 * `seq` on the socket whose board names the page's hub run; a page that
 * lands before any board keeps its place for the first one
 * (subscriptions.svelte.ts `followHeld`), and one of another run than the open socket's is read
 * again (`otherRun`).
 *
 * A READ AGAIN KEEPS EVERY ROW THE READER HAS. Over rows already held (a
 * resync, a retry, the socket or the machine back, the hub restarted), the
 * newest page, read back until it meets them ({@link readBackToMeet}), is
 * merged into them by id ({@link mergeRows}): every row shown stays where it
 * is, under its id, and the list keeps its place by them. Nothing held, the
 * page is the transcript, and the view asks for older pages itself as its
 * reader nears the first rows ({@link readOlderPage}).
 *
 * A read that fails leaves the stream waiting for the next one (its cursor
 * stays `reading`), and that read is made on the next event that can answer
 * it: the machine online again ({@link readBehind}), the socket back
 * (hub/socket.svelte.ts `hubReached`), the backoff after a read the hub failed
 * ({@link readAgainLater}), or the reader's retry. None of these is a
 * catch-up: the pane's "Catching up…" follows the pane, never a read.
 *
 * `cancel` fires when a fresh read took this one's place: whatever this one
 * would have said is dropped, and it answers `skipped`.
 */
async function readNewestPage(
  target: SessionState,
  cause: ReadCause,
  cancel: AbortSignal
): Promise<TranscriptOutcome> {
  const viewId = target.instanceId;
  beginRead(streamState, viewId);
  target.loading = true;
  try {
    const asked = await readPage(viewId, {}, cancel);
    const answer:
      | { page: TranscriptPageRead; fault?: undefined }
      | { fault: TranscriptOutcome; page?: undefined } = asked.ok
      ? { page: asked.value }
      : { fault: pageFault(asked.refused) };
    if (cancel.aborted) {
      return { ok: true, skipped: true };
    }
    if (answer.fault) {
      if (!answer.fault.ok) {
        const { ok: _ok, status, ...fault } = answer.fault;
        // A 404 is the hub's answer that nothing goes by this id: asked
        // again, it says the same.
        readFailed(target, fault, status !== 404);
      }
      return answer.fault;
    }
    const heldBefore = target.blocks.length;
    const back = await readBackToMeet(target, answer.page, cancel);
    if (cancel.aborted) {
      return { ok: true, skipped: true };
    }
    // A page of another hub run than the open socket's (the hub restarted
    // between the read and the socket's board) resumes nothing here: it is
    // read again of the hub that answers now.
    const run = answer.page.hubRun ?? null;
    if (connectionState.status === "connected" && run !== hubRun()) {
      return await readNewestPage(target, "otherRun", cancel);
    }
    target.readFault = null;
    target.behind = null;
    readLanded(viewId);
    adoptTranscriptPage(target, {
      ...answer.page,
      blocks: back.blocks,
      branches: back.branches,
      cursor: back.cursor,
    });
    target.olderFault = back.older;
    adoptPage(streamState, streamHost, viewId, {
      seq: answer.page.seq ?? 0,
      run,
      connected: connectionState.status === "connected",
    });
    trackWorking(target);
    console.info(
      `[cawco] read ${viewId.slice(0, 8)} because ${cause}: ${answer.page.blocks.length} newest, ${back.blocks.length} read, ${heldBefore} held, ${target.blocks.length} rows`
    );
  } catch (error) {
    if (cancel.aborted) {
      return { ok: true, skipped: true };
    }
    const message = thrownReason(error);
    readFailed(target, { reason: "failed", message });
    return { ok: false, reason: "failed", message };
  } finally {
    // A read that was replaced leaves `loading` to the one that replaced it.
    if (!cancel.aborted) {
      target.loading = false;
    }
  }
  return { ok: true };
}

/** The page that ends at `cursor`, or why it could not be read. */
async function olderPage(
  viewId: string,
  cursor: string,
  cancel?: AbortSignal
): Promise<TranscriptPage | ReadFault> {
  try {
    const asked = await readPage(
      viewId,
      { cursor, limit: TRANSCRIPT_OLDER_PAGE },
      cancel
    );
    if (asked.ok) {
      return asked.value;
    }
    const { away, reconnectingMs } = machineAway(asked.refused.response);
    return readFaultOf(
      hubFailure(asked.refused),
      away,
      deadlineIn(reconnectingMs)
    );
  } catch (error) {
    return { reason: "failed", message: thrownReason(error) };
  }
}

/**
 * The one page older than what a view holds, put in front of it. Asked for by
 * whoever is reading near the first rows held — never ahead of a reader. One
 * page is out at a time, and nothing is asked once the conversation's start
 * is in hand or while the newest page is itself being read. An answer that
 * comes back to a transcript read again since, or to a cursor that has moved,
 * is dropped. A page that could not be read leaves the cursor where it was
 * and says why ({@link SessionState.olderFault}): asking again asks for the
 * same page.
 */
export function readOlderPage(viewId: string): Promise<void> {
  // The page already out answers for any ask that lands meanwhile.
  const inFlight = olderReads.get(viewId);
  if (inFlight) {
    return inFlight;
  }
  const target = sessionsState.sessions[viewId];
  const cursor = target?.cursor;
  if (!(target && cursor) || target.loading) {
    return Promise.resolve();
  }
  const read = readOlderInto(target, cursor);
  olderReads.set(viewId, read);
  return read;
}

/** The older-page reads in flight, by view: one page is out at a time. */
const olderReads = new Map<string, Promise<void>>();

async function readOlderInto(
  target: SessionState,
  cursor: string
): Promise<void> {
  const viewId = target.instanceId;
  const { reads } = target;
  target.hydrating = true;
  target.olderFault = null;
  const answer = await olderPage(viewId, cursor);
  // The read is over before anything it brought is written. Whoever its page
  // wakes asks for the next one in that same pass — a transcript reading back
  // to its reader's place, an open well reading to its start — and handed
  // this read again, they waited on a page already in: cleared behind the
  // writes, a reload far up a long transcript read one page and stopped,
  // with the tab blank behind its skeleton.
  olderReads.delete(viewId);
  target.hydrating = false;
  if (target.reads !== reads || target.cursor !== cursor) {
    return;
  }
  if ("blocks" in answer) {
    prependTranscriptPage(target, answer);
  } else {
    target.olderFault = answer;
  }
}
