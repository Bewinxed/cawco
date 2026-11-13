/**
 * Needs you's artifacts (core artifact-needs.ts): what each artifact waits
 * on the person for, derived from its doc and the person's own marks there,
 * never stored. The service reads an artifact's {@link ArtifactFacts} from
 * its doc once per change (service.ts `factsOf`); everything here is a rule
 * over them and over what the hub holds of its sessions (their plans, their
 * turns, whether they ended).
 *
 * Only an open ask counts. An artifact asks when it is a page to pick on or
 * a canvas to judge with its ask line set (the panel's head, `artifacts.ask`;
 * a row made before asks were kept has none), and is its session's to put
 * to the person: not a draft, not handed up to a parent that hasn't
 * opened it, not a maker's change held for one, not an option's media on a
 * decision page (the page asks, its Canvases and Previews are its
 * pictures, before and after it is answered or gone), not a preview whose
 * folder is gone from its machine. Its ask is open while (a reason each,
 * strongest first) a canvas to judge was never opened and nothing on it
 * answers it; a decision page has a question open (questions.ts: no pick,
 * no note, no pin on it the agent answered and resolved, not taken or
 * withdrawn by the agent). What is written and not sent is an answer: Send
 * counts for nothing here. Any artifact of its session's that is the
 * person's (not a draft, not handed up or held, not an option's media, not
 * a working canvas: `draw`), a `try` preview too, also asks while an open
 * pin's last entry is the agent's reply marked as asking (`comment_reply`'s `asks`,
 * core comments.ts `pinAsks`) and the agent has not closed it: the person's
 * reply there or resolve answers it, a look does not. A reply that asks
 * nothing reaches the person only on the page. Never: a page or preview
 * with no ask and no pin asking, an answered one. Answers the session
 * hasn't read yet are its move, and ask nothing more of the person; what is
 * still open is still theirs (rule 1).
 *
 * How it leaves, by rule:
 * 1. Answered: its reasons go as they are answered, a partial answer
 *    leaving the rest.
 * 2. The writer moved on: with its plan not waiting on it
 *    ({@link planHolds}: not asked while at work on its plan,
 *    {@link ArtifactAsked.step}, and no open step naming a card or pin of
 *    it), the writer's next turn ended ({@link ArtifactAsked.movedAt}), with
 *    no new show of it. One asked at work on the plan stands until it is
 *    answered or deleted, whatever the plan's steps are rewritten to: its
 *    own ask record says so, and nothing else holds it. That retires its
 *    ask (not opened, questions open), never an answer he hasn't read. A
 *    writer whose work item is live never moves on so: its item rests on
 *    its asks until they are answered or it ends (rule 4; hub
 *    work-items.ts `onPerson`), whatever its parent wakes it to say.
 * 3. Superseded: a revision, or a same-name create, is the same artifact:
 *    its item changes in place.
 * 4. Its session ended: it leaves Needs you and is one notice, "<harness>
 *    ended; …".
 * 5. Not now: the person's ✕, a notice id the item carries
 *    (`notNow`), acknowledged; a new `raisedAt` makes it another.
 * 6. A look: opening a canvas to judge clears "not opened", and opening
 *    anything clears its notices; only an answer clears an open question.
 */
import {
  type ArtifactNeed,
  type ArtifactNeedNotice,
  type ArtifactNeedNoticePart,
  type ArtifactPending,
  type ArtifactReason,
  type ArtifactStop,
  artifactLink,
  artifactStopHref,
  type HarnessKind,
  notNowId,
  type PlanStep,
  setupLanding,
  stepNamesArtifact,
} from "@cawco/core";
import type { CanvasAuthor } from "@cawco/core/canvas";
import { unhandled } from "@cawco/core/unhandled";
import type { ArtifactChange, ArtifactRow } from "../db/artifacts";
import { isSetupPage } from "../setup";

/**
 * The artifact's latest ask, kept in its doc (`meta.asked`): the session
 * whose tool call made it (create, update, revise, show), when, the step
 * it was asked at while the session was at work on its plan (`step`: set,
 * the plan waits on it until it is answered or deleted, {@link planHolds}),
 * and when the writer's next turn ended with its plan not waiting on it and
 * no new show.
 */
export interface ArtifactAsked {
  at: string;
  by: string;
  movedAt?: string;
  step?: string;
}

/** What an artifact's doc and row say, read once per change of either. */
export interface ArtifactFacts {
  /** A decision page's questions (questions.ts `answersOf`): answered or taken, of those not withdrawn; none for any other artifact. */
  answers: { answered: number; asked: number } | null;
  asked: ArtifactAsked | null;
  /** Open pins whose agent's reply asks the person something (core `pinAsks`), not closed by the agent, by number. */
  asking: number[];
  /** The newest of those replies, ISO; null when no pin asks. */
  askingAt: string | null;
  /** The latest revision's changes the person hasn't looked at. */
  changes: { count: number; revision: number } | null;
  /** Resolved pins whose closing answer is newer than the person's look, by number. */
  closed: { at: string; pin: number }[];
  draft: boolean;
  /** The first decision, in page order, with no answer. */
  firstOpen: string | null;
  /** Its folder isn't on its machine any more, in the daemon's words (core preview-proxy `folderGone`); null while it was there at its last start. */
  gone: string | null;
  /** Handed up to a parent session that hasn't opened it, or a maker's change held for it: not the person's yet. */
  handed: boolean;
  /** A canvas to judge has its answer: a value, pick or note set on it, or the agent took or withdrew it. */
  judged: boolean;
  /** When the person last had it on screen (a view's word), ISO. */
  lookedAt: string | null;
  /** An option's media on a decision page of its session (its Canvas or Preview piece), now or before that page went. */
  media: boolean;
  /** When its session last published or changed it (`meta.revisedAt`), ISO. */
  revisedAt: string | null;
  /** What Send sends now: picks and notes since the last Send. */
  unsent: number;
}

/** What the hub holds of an artifact's sessions, as its rules read it. */
export interface ArtifactSessions {
  /** Its holder ended (finished, archived, deleted): the person's marks go to Caw now. */
  ended: boolean;
  /** The holder's harness, for an ended notice; null when the hub holds no session. */
  harness: HarnessKind | null;
  /** The holder's machine; null when the hub holds no session. */
  machineId: string | null;
  /** A project's setup page: its project is set up (hub tasks.ts `isSetUp`), which says where it lands (core `setupLanding`); false for any other artifact. */
  setUp: boolean;
  /** The writer's plan's steps: an open one naming a card or pin of it holds its ask ({@link planHolds}). */
  steps: readonly PlanStep[];
}

const ms = (iso: string | null | undefined): number => {
  const at = iso ? Date.parse(iso) : Number.NaN;
  return Number.isNaN(at) ? 0 : at;
};

/**
 * Whether `row` carries an ask: a page to pick on or a canvas to judge, its
 * ask line set, its session's to put to the person.
 */
const asks = (row: ArtifactRow, facts: ArtifactFacts): boolean =>
  (row.does === "pick" || row.does === "judge") &&
  row.ask.trim() !== "" &&
  !(
    facts.draft ||
    facts.handed ||
    facts.media ||
    facts.gone !== null ||
    row.heldFor !== null
  );

/**
 * Whether `row` has a pin asking the person, and is theirs to be asked on:
 * not a draft, not handed up or held, not an option's media, not a working
 * canvas (`draw`: the agent's drawing for the next agent).
 */
const pinsAsk = (row: ArtifactRow, facts: ArtifactFacts): boolean =>
  facts.asking.length > 0 &&
  row.does !== "draw" &&
  !(facts.draft || facts.handed || facts.media || row.heldFor !== null);

/** A canvas to judge no view has had on screen yet and nothing answers (rule 6). */
const unjudged = (row: ArtifactRow, facts: ArtifactFacts): boolean =>
  row.does === "judge" && row.openedRevision === null && !facts.judged;

/** A decision page with a question open. */
const unanswered = (facts: ArtifactFacts): boolean =>
  facts.answers !== null && facts.answers.answered < facts.answers.asked;

/**
 * Whether `row` could wait on the person or notice them at all, read from
 * its facts alone: the rest of its rules need its sessions (their plans,
 * their turns, whether they ended), read only for these.
 */
export const mayWait = (row: ArtifactRow, facts: ArtifactFacts): boolean =>
  pinsAsk(row, facts) ||
  (!facts.draft &&
    row.heldFor === null &&
    row.does !== "try" &&
    ((asks(row, facts) && (unjudged(row, facts) || unanswered(facts))) ||
      facts.closed.length > 0 ||
      (facts.changes !== null &&
        facts.changes.count > 0 &&
        row.openedRevision !== null &&
        row.openedRevision < row.revision)));

/**
 * Whether what the person wrote on `row` goes to its session by itself
 * (the owner, 2026-11-05: no Send once he has answered; artifacts/service.ts
 * `sendAnswered`): a page to pick on with every question answered, taken or
 * withdrawn, or a canvas to judge with its answer set, its picks, notes or
 * values not sent yet. A project's setup page never does: its Send sets
 * the project up. Nor does one not the person's (a draft, handed up or
 * held, an option's media).
 */
export const answeredWhole = (
  row: ArtifactRow,
  facts: ArtifactFacts
): boolean => {
  if (!asks(row, facts) || isSetupPage(row) || facts.unsent === 0) {
    return false;
  }
  return facts.answers
    ? facts.answers.answered === facts.answers.asked
    : row.does === "judge" && facts.judged;
};

/**
 * Whether the person's answers on a page are news to its session: a pick,
 * note or value of his (a key of `state`) changed after both the session's
 * last read (`artifact_read` stamps `readSeq`) and its last notice to read
 * (`deliveredSeq`, which a Send stamps). Answers it had settle the page
 * with nothing sent to it (artifacts/service.ts `sendAnswered`).
 */
export const answersUnheard = (
  row: Pick<ArtifactRow, "deliveredSeq" | "readSeq">,
  changes: readonly ArtifactChange[],
  state: Readonly<Record<string, unknown>>
): boolean =>
  [...unheardKeys(heardSeq(row), changes)].some((key) => key in state);

/**
 * How far its session has had a page's answers: its last read
 * (`artifact_read` stamps `readSeq`) or its last notice to read
 * (`deliveredSeq`), whichever is later.
 */
export const heardSeq = (
  row: Pick<ArtifactRow, "deliveredSeq" | "readSeq">
): number => Math.max(row.readSeq, row.deliveredSeq);

/**
 * The seq a session's read of an artifact counts as its read through (what
 * artifacts/service.ts stamps as its `readSeq`): a read counts only for the
 * state it returned. Through `row.seq` when it returned every answer of the
 * person's its session hadn't had (a key of `state` he changed after
 * {@link heardSeq}); else up to, never past, the first of them it left out,
 * which stays news ({@link answersUnheard}). A canvas's read returns none of
 * its state; a page's read `since` a seq returns what changed after it.
 */
export const readThrough = (
  row: Pick<ArtifactRow, "deliveredSeq" | "readSeq" | "seq">,
  changes: readonly ArtifactChange[],
  state: Readonly<Record<string, unknown>>,
  returned: (key: string) => boolean
): number => {
  const heard = heardSeq(row);
  const left = changes
    .filter(
      (change) =>
        change.by === "person" &&
        change.seq > heard &&
        change.key in state &&
        !returned(change.key)
    )
    .map((change) => change.seq);
  return left.length === 0 ? row.seq : Math.max(heard, Math.min(...left) - 1);
};

/** The keys of `state` the person changed after seq `heard`: his answers news to whoever had the page up to it. */
export const unheardKeys = (
  heard: number,
  changes: readonly ArtifactChange[]
): Set<string> =>
  new Set(
    changes
      .filter((change) => change.by === "person" && change.seq > heard)
      .map((change) => change.key)
  );

/**
 * Whether a change to a page's doc by `by` sends what the person wrote on
 * it now (artifacts/service.ts `answersMoved`): never his own, which pushes
 * the quiet delivery back and sends it from there (`personMarked`); anyone
 * else's (the agent's reply or close, the hub's bookkeeping) when it
 * leaves the page answered whole and no delivery of his changes is
 * `coming`, whose timer it never moves.
 */
export const sendsOnChange = (
  by: CanvasAuthor,
  page: { coming: boolean; whole: boolean }
): boolean => by !== "person" && !page.coming && page.whole;

/**
 * Whether the writer's plan holds artifact `id`'s ask: it was asked while
 * the session was at work on its plan (`asked.step`, the artifact's own ask
 * record), which holds it until it is answered or deleted whatever the
 * steps become, or an open step's `waitsOn` names a card or pin of it.
 */
export const planHolds = (
  id: string,
  asked: ArtifactAsked | null,
  steps: readonly PlanStep[]
): boolean =>
  asked?.step !== undefined ||
  steps.some((step) => stepNamesArtifact(step, id));

/**
 * Rule 2: the writer moved on. Its plan holding the ask keeps it
 * ({@link planHolds}); else the writer's next turn ending with nothing of
 * its plan holding it lets it go.
 */
export const movedOn = (
  id: string,
  asked: ArtifactAsked | null,
  steps: readonly PlanStep[]
): boolean =>
  asked !== null && !planHolds(id, asked, steps) && asked.movedAt !== undefined;

/**
 * What `row` waits on the person for, strongest first: its open ask's
 * reasons, rules 1, 2 and 6 applied, then its pins asking (only a reply or a
 * resolve answers those); none when nothing is asked of them.
 */
const reasonsOf = (
  row: ArtifactRow,
  facts: ArtifactFacts,
  steps: readonly PlanStep[]
): ArtifactReason[] => {
  const reasons: ArtifactReason[] = [];
  if (asks(row, facts)) {
    const retired = movedOn(row.id, facts.asked, steps);
    if (!retired && unjudged(row, facts)) {
      reasons.push({ kind: "unopened" });
    }
    if (!retired && facts.answers && unanswered(facts)) {
      reasons.push({ kind: "answers", ...facts.answers });
    }
  }
  const [pin] = facts.asking;
  if (pin !== undefined && pinsAsk(row, facts)) {
    reasons.push({ kind: "answer", count: facts.asking.length, pin });
  }
  return reasons;
};

/** When it became pending: its publish, or the agent's newest reply that asks; ms epoch. */
const raisedAtOf = (row: ArtifactRow, facts: ArtifactFacts): number =>
  Math.max(ms(facts.revisedAt) || row.createdAt.getTime(), ms(facts.askingAt));

/** Where its panel opens it: at its strongest reason's first stop. */
const stopOf = (
  reason: ArtifactReason | undefined,
  facts: ArtifactFacts
): ArtifactStop => {
  switch (reason?.kind) {
    case "answers":
      return facts.firstOpen ? { card: facts.firstOpen } : { top: true };
    case "answer":
      return { pin: reason.pin };
    case "unopened":
    case undefined:
      return { top: true };
    default:
      unhandled("reason", reason);
  }
};

/**
 * Where its item opens: the session that holds it, at `stop`; a project's
 * setup page, which no panel opens (service `boardOf`), where it lands
 * (core `setupLanding`), at `stop`'s card when it names one.
 */
const hrefOf = (
  row: ArtifactRow,
  stop: ArtifactStop,
  setUp: boolean
): string =>
  row.projectId !== null && isSetupPage(row)
    ? setupLanding(row.projectId, setUp, "card" in stop ? stop.card : null)
    : artifactStopHref(row.instanceId as string, row.id, stop);

/** Its pending state as its own list reads it (Files, the panel's menu): null when it asks nothing now. */
export const pendingOf = (
  row: ArtifactRow,
  facts: ArtifactFacts,
  sessions: ArtifactSessions
): ArtifactPending | null => {
  const pending = reasonsOf(row, facts, sessions.steps);
  return pending.length > 0
    ? { pending, raisedAt: raisedAtOf(row, facts) }
    : null;
};

/** Its Needs-you item, or none: it asks nothing, or its session ended (rule 4, a notice instead). */
export const needOf = (
  row: ArtifactRow,
  facts: ArtifactFacts,
  sessions: ArtifactSessions
): ArtifactNeed | null => {
  if (row.instanceId === null || sessions.ended || !sessions.machineId) {
    return null;
  }
  const pending = reasonsOf(row, facts, sessions.steps);
  if (pending.length === 0) {
    return null;
  }
  const raisedAt = raisedAtOf(row, facts);
  const stop = stopOf(pending[0], facts);
  return {
    kind: "artifact",
    artifactId: row.id,
    artifactKind: row.kind,
    instanceId: row.instanceId,
    machineId: sessions.machineId,
    project: row.projectId,
    title: row.title,
    ask: row.ask,
    link: artifactLink(row.id, row.title),
    pending,
    raisedAt,
    stop,
    href: hrefOf(row, stop, sessions.setUp),
    notNow: notNowId(row.id, raisedAt),
    parked: false,
    unsent: facts.unsent,
    ownSend: facts.answers !== null,
  };
};

/** Its notice in Caw's panel, one row per artifact, or none. */
export const noticeOf = (
  row: ArtifactRow,
  facts: ArtifactFacts,
  sessions: ArtifactSessions
): ArtifactNeedNotice | null => {
  if (
    facts.draft ||
    row.heldFor !== null ||
    (row.does === "try" && !pinsAsk(row, facts))
  ) {
    return null;
  }
  const reasons = reasonsOf(row, facts, sessions.steps);
  const parts: ArtifactNeedNoticePart[] = [];
  let at = 0;
  const ended = row.instanceId === null || sessions.ended;
  const [strongest] = reasons;
  if (ended && strongest) {
    parts.push({
      kind: "ended",
      id: `artifact-ended:${row.id}:${row.instanceId ?? "gone"}`,
      harness: sessions.harness,
      reason: strongest,
    });
    at = Math.max(at, raisedAtOf(row, facts));
  }
  // Rule 6: a look clears these. A revision only notices when it asks nothing.
  const { changes } = facts;
  if (
    reasons.length === 0 &&
    changes &&
    changes.count > 0 &&
    changes.revision === row.revision &&
    row.openedRevision !== null &&
    row.openedRevision < row.revision
  ) {
    parts.push({
      kind: "changed",
      id: `artifact-changed:${row.id}:${row.revision}`,
      count: changes.count,
    });
    at = Math.max(at, ms(facts.revisedAt));
  }
  const looked = ms(facts.lookedAt);
  const closed = facts.closed.filter((one) => ms(one.at) > looked);
  const [first] = closed;
  if (first) {
    const latest = Math.max(...closed.map((one) => ms(one.at)));
    parts.push({
      kind: "closed",
      id: `artifact-closed:${row.id}:${latest}`,
      count: closed.length,
      pin: first.pin,
    });
    at = Math.max(at, latest);
  }
  if (parts.length === 0) {
    return null;
  }
  const stop = stopOf(ended ? strongest : undefined, facts);
  return {
    artifactId: row.id,
    artifactKind: row.kind,
    instanceId: row.instanceId,
    machineId: sessions.machineId,
    project: row.projectId,
    title: row.title,
    at,
    parts,
    stop,
    href: row.instanceId === null ? null : hrefOf(row, stop, sessions.setUp),
  };
};
