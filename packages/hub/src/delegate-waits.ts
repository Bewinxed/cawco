/**
 * THE RULE FOR A DELEGATE'S ASK: whatever door an ask comes in by, while a
 * delegate waits on it its parent knows, and hears how it ended; an ask the
 * person holds is told so to every session above the delegate, up to the
 * one the person talks to, however deep it was asked. One rule
 * for every door: a harness's own prompt (server.ts, the machine's
 * `permission_request`), a session's `ask` and approvals (asks.ts), a
 * browser ask (browser-tools.ts), a connect ask (connect-asks.ts), a move
 * (moves.ts), a design proposal (design-system.ts), and an ask handed to the
 * parent that went to the person when the parent went to rest unanswered
 * (server.ts `escalateRoutedAsks`).
 *
 * As an ask starts waiting ({@link DelegateWaits.asked}), its asker's parent
 * (server.ts `delegateAskParent`: the session that started its work, live
 * or asleep with a conversation to wake from) is told one of three things:
 *
 * - an ask it may answer (a harness's prompt routed to it, a question): the
 *   ask itself, with how to answer it (server.ts `deliverDelegateAsk`);
 * - an ask only the person answers ({@link DelegateWaits.personOnly}): what
 *   it asks, that the person holds it, and that answer_delegate is refused
 *   for it;
 * - an ask it was handed that went to the person: that it is theirs now.
 *
 * As it leaves the pending ledger ({@link DelegateWaits.ended}) the parent
 * hears how: who answered and what they said, the person's take-over of a
 * browser, or its withdrawal; and a browser handed back, after its take-over
 * took the ask off every screen ({@link DelegateWaits.handedBack}). Only the
 * parent's own answer goes untold, and an ask no screen was shown.
 *
 * Each word is the hub's, under its own origin (core `DELEGATE_WAIT_ORIGIN`),
 * never the delegate's message: it wakes a parent at rest, and a send of it
 * that fails tells no session it failed. Its tag names the ask, its
 * delegate and what it asks. Each is told once: its send is
 * named by the ask and what it tells ({@link NoticeMark}), and the hub hands
 * a send it already holds a record of over once (server.ts
 * `deliverToSession`). That record is the mark, kept with the parent's
 * sends, so an ask parked again (a design proposal as the hub starts, a
 * prompt kept as a permit) tells its parent nothing it was told before,
 * however often the hub restarts. An ask handed to the parent to answer is
 * marked by its `delegate_events` row.
 *
 * A parent read `unknown` (as every live row is from a hub's start until
 * its machine registers) is told as any other: the send path keeps the
 * notice durably, owed in `sent_messages`, and hands it over as the
 * machine registers (server.ts `deliverToSession`, `away`), under the same
 * name, so a wait or an end told meanwhile reaches it once. A machine that
 * does not come back within its window has every send kept for it fail, by
 * the fleet's rule for every send. And as each machine registers the hub
 * asks the rule again of every ask still parked (server.ts, the agent's
 * register): one a parent could not hear as it parked (an ask its parent
 * could answer, not routed to it while it could not) is handed or told
 * then, and the marks keep what was told from going twice.
 */

import type { AskAnswer, AskRecord } from "@cawco/core/asks";
import type { PermissionRequestFrame } from "@cawco/core/frames";
import type { Envelope, InstanceRow } from "@cawco/core/protocol";
import { delegateWaitWords } from "@cawco/core/words/delegates";

/** The payload fields of the asks the hub raises and settles itself: only the person answers them. */
const PERSON_ONLY = [
  "browserAsk",
  "connectAsk",
  "designProposal",
  "memoryProposal",
  "move",
] as const;

/** What a notice tells of its ask, by which its send is named: each is told once. */
export type NoticeMark =
  "waits" | "persons-now" | "ended" | "handed-back" | "ended-with-hub";

/** How an ask left the ledger; `closed`: why the hub closed it, when it no longer applied. */
type AskEnd =
  | { kind: "answered"; answer?: AskAnswer }
  | { kind: "withdrawn"; closed: string | undefined };

/** How a withdrawn ask reads: closed by the hub, with why, or withdrawn. */
const withdrawnHow = (closed: string | undefined): string =>
  closed ? delegateWaitWords.closed(closed) : delegateWaitWords.withdrawn;

export interface DelegateWaitsDeps {
  /** The name a session's answer carries (`AnswerFrom.name`). */
  readonly answererName: (row: InstanceRow) => string;
  /** Hands `parent` the ask as its own to answer, with how (server.ts `deliverDelegateAsk`). */
  readonly hand: (
    asker: InstanceRow,
    parent: InstanceRow,
    ask: Envelope
  ) => void;
  /** Whether the ask `requestId` was handed to a parent as its own to answer (its `delegate_events` ask). */
  readonly handed: (requestId: string) => boolean;
  /** The session `id`, as the hub holds it now. */
  readonly instance: (id: string) => InstanceRow | undefined;
  /** A session as a link to it, labelled by its board title. */
  readonly link: (row: InstanceRow) => string;
  /** The kind of the hub's own ask kept under `requestId` (asks.ts), if it is one. */
  readonly owned: (requestId: string) => AskRecord["asked"]["kind"] | undefined;
  /** The parent the asks of `asker` go to now; none for a session with no parent that can take them. */
  readonly parentOf: (asker: InstanceRow) => InstanceRow | undefined;
  /**
   * Says `body` to `parent` about `asker`, a delegate under it `depth`
   * sessions down (0: its own), under the note's `line`, in a send that
   * wakes it, named by the ask `requestId`, `mark` and, above the asker's
   * own parent, the session told: a send under a name already sent goes
   * nowhere.
   */
  readonly tell: (
    told: {
      asker: InstanceRow;
      /** How far above the asker's own parent `parent` stands: 0 for that parent. */
      depth: number;
      mark: NoticeMark;
      parent: InstanceRow;
      requestId: string;
      /** What the ask asks, in one line: carried on the notice's tag. */
      what: string;
    },
    line: string,
    body: string
  ) => void;
  /** A session as its board names it. */
  readonly title: (row: InstanceRow) => string;
}

const payloadOf = (ask: Envelope): Partial<PermissionRequestFrame> =>
  (ask.payload ?? {}) as Partial<PermissionRequestFrame>;

/** What the ask asks, in one line, as every surface says it. */
const whatOf = (ask: Envelope): string => {
  const payload = payloadOf(ask);
  return (
    payload.presentation?.summary?.trim() ||
    payload.browserAsk?.reason ||
    payload.toolName ||
    "an ask"
  );
};

/** Who answered, as the end's sentence names them. */
const byOf = (answer: AskAnswer | undefined): string => {
  if (answer?.via === "session" && answer.name) {
    return answer.name;
  }
  if (answer?.via === "fullSend") {
    return delegateWaitWords.fullSend;
  }
  return answer?.name
    ? delegateWaitWords.thePersonOn(answer.name)
    : delegateWaitWords.thePerson;
};

export const createDelegateWaits = (deps: DelegateWaitsDeps) => {
  /** The session that made the ask: its own row, or the one it names as its origin. */
  const askerOf = (ask: Envelope): InstanceRow | undefined => {
    const payload = payloadOf(ask);
    return deps.instance(payload.originInstanceId ?? ask.instanceId ?? "");
  };

  /**
   * The asker and the sessions above it that hear of its asks, nearest
   * first: its parent, that parent's, and on up to the session the person
   * talks to (Caw, or whoever started the tree). None when it has no parent.
   */
  const pairOf = (
    instanceId: string | undefined
  ):
    | { above: InstanceRow[]; asker: InstanceRow; parent: InstanceRow }
    | undefined => {
    const asker = instanceId ? deps.instance(instanceId) : undefined;
    if (!asker) {
      return;
    }
    const above: InstanceRow[] = [];
    const seen = new Set([asker.id]);
    let next = deps.parentOf(asker);
    while (next && !seen.has(next.id)) {
      above.push(next);
      seen.add(next.id);
      next = deps.parentOf(next);
    }
    const [parent] = above;
    return parent ? { above, asker, parent } : undefined;
  };

  /**
   * One notice of the ask `requestId` to the asker's parent, and with
   * `all` to every session above it too: an ask the person holds is told up
   * the whole tree, so the session the person talks to knows of an ask two
   * deep as it waits and as it ends; one handed to the parent to answer is
   * that parent's alone.
   */
  const tellUp = (
    pair: NonNullable<ReturnType<typeof pairOf>>,
    notice: { mark: NoticeMark; requestId: string; what: string },
    all: boolean,
    line: string,
    body: string
  ): void => {
    for (const [depth, parent] of (all
      ? pair.above
      : [pair.parent]
    ).entries()) {
      deps.tell({ ...notice, asker: pair.asker, parent, depth }, line, body);
    }
  };

  /** How `end` reads, for the ask `ask`. */
  const howOf = (ask: Envelope, end: AskEnd): string => {
    if (end.kind === "withdrawn") {
      return withdrawnHow(end.closed);
    }
    const { answer } = end;
    const { browserAsk, connectAsk, requestKind } = payloadOf(ask);
    // A take-over and a sign-in settle their asks with no answer of their own.
    if (browserAsk && !answer) {
      return delegateWaitWords.tookOver;
    }
    if (connectAsk && !answer) {
      return delegateWaitWords.connected;
    }
    if (!answer) {
      return delegateWaitWords.settled;
    }
    if (answer.via === "harness") {
      return delegateWaitWords.harness;
    }
    const by = byOf(answer);
    const asked = browserAsk || connectAsk || requestKind === "question";
    if (answer.behavior === "deny") {
      return asked
        ? delegateWaitWords.declined(by)
        : delegateWaitWords.denied(by);
    }
    return asked
      ? delegateWaitWords.answered(by)
      : delegateWaitWords.approved(by);
  };

  const waits = {
    /**
     * Whether only the person may answer `ask`: one the hub raised and
     * settles itself (an approval, a browser or connect ask, a move, a
     * memory or design proposal). A question and a session's own prompt its
     * parent may answer.
     */
    personOnly(ask: Envelope): boolean {
      const owned = deps.owned(ask.requestId ?? "");
      if (owned) {
        return owned === "approve";
      }
      const payload = payloadOf(ask) as Record<string, unknown>;
      return PERSON_ONLY.some((field) => payload[field] !== undefined);
    },

    /**
     * `ask` started waiting, on the person or its parent, or (`escalated`) an
     * ask handed to the parent went to the person: the parent is told, as
     * the rule says, once.
     */
    asked(ask: Envelope, escalated = false): void {
      const asker = askerOf(ask);
      const pair = asker ? pairOf(asker.id) : undefined;
      if (!pair) {
        return;
      }
      const { parent } = pair;
      const requestId = ask.requestId ?? "";
      const name = deps.link(pair.asker);
      if (escalated) {
        tellUp(
          pair,
          { mark: "persons-now", requestId, what: whatOf(ask) },
          true,
          delegateWaitWords.personsNowLine(deps.title(pair.asker)),
          delegateWaitWords.personsNow(name, requestId)
        );
        return;
      }
      if (!waits.personOnly(ask)) {
        if (!deps.handed(requestId)) {
          deps.hand(pair.asker, parent, ask);
        }
        return;
      }
      const browser = payloadOf(ask).browserAsk;
      const said = browser
        ? delegateWaitWords.browserHeld(name, browser.origin, browser.reason)
        : delegateWaitWords.held(name, whatOf(ask));
      tellUp(
        pair,
        { mark: "waits", requestId, what: whatOf(ask) },
        true,
        delegateWaitWords.waitsLine(deps.title(pair.asker)),
        `${said} ${delegateWaitWords.personOnly}`
      );
    },

    /**
     * `ask` left the pending ledger, answered (with what won and where, when
     * the hub knows) or cancelled: its asker's parent hears how, unless the
     * parent answered it itself. `shown` is false for an ask no screen was
     * shown, which nobody was told of. `closed`: why the hub closed it
     * because it no longer applied, which the parent hears with it.
     */
    ended(
      ask: Envelope,
      outcome: "answered" | "cancelled",
      answer: AskAnswer | undefined,
      shown: boolean,
      closed?: string
    ): void {
      const asker = askerOf(ask);
      const pair = asker && shown ? pairOf(asker.id) : undefined;
      if (!pair) {
        return;
      }
      const end: AskEnd =
        outcome === "answered"
          ? { kind: "answered", ...(answer ? { answer } : {}) }
          : { kind: "withdrawn", closed };
      if (
        answer?.via === "session" &&
        answer.name === deps.answererName(pair.parent)
      ) {
        return;
      }
      const title = deps.title(pair.asker);
      // A take-over takes the ask off every screen; its call waits on.
      const taken =
        end.kind === "answered" && !answer && !!payloadOf(ask).browserAsk;
      // The person's: one only they answer, or one handed to the parent
      // that went to them (its routing taken off). The sessions above were
      // told it waits, and hear it end.
      const persons =
        waits.personOnly(ask) ||
        (payloadOf(ask) as { routedTo?: string }).routedTo !== "parent";
      tellUp(
        pair,
        {
          mark: "ended",
          requestId: ask.requestId ?? "",
          what: whatOf(ask),
        },
        persons,
        taken
          ? delegateWaitWords.tookOverLine(title)
          : delegateWaitWords.endedLine(title),
        delegateWaitWords.ended(
          deps.link(pair.asker),
          whatOf(ask),
          howOf(ask, end)
        )
      );
    },

    /**
     * The person handed back the browser `instanceId`'s ask `reason` had them
     * take over: its call goes on, and its parent hears so.
     */
    handedBack(
      instanceId: string,
      requestId: string,
      reason: string,
      origin: string | null
    ): void {
      const pair = pairOf(instanceId);
      if (!pair) {
        return;
      }
      tellUp(
        pair,
        { mark: "handed-back", requestId, what: reason },
        true,
        delegateWaitWords.endedLine(deps.title(pair.asker)),
        delegateWaitWords.ended(
          deps.link(pair.asker),
          reason,
          delegateWaitWords.handedBack(origin)
        )
      );
    },

    /**
     * The ask `requestId`, which `delegate` asked and its parent was told
     * waits on the person (`what`), ended with the hub that held it: its
     * call was refused as that hub went, and it never settled. Its parent
     * hears so, once, as the next hub starts (server.ts, the boot's sweep).
     */
    endedWithHub(delegate: string, requestId: string, what: string): void {
      const pair = pairOf(delegate);
      if (!pair) {
        return;
      }
      tellUp(
        pair,
        { mark: "ended-with-hub", requestId, what },
        true,
        delegateWaitWords.endedLine(deps.title(pair.asker)),
        delegateWaitWords.ended(
          deps.link(pair.asker),
          what,
          delegateWaitWords.endedWithHub
        )
      );
    },
  };
  return waits;
};
