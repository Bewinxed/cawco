/**
 * Needs you's artifacts (core artifact-needs.ts): what each artifact waits
 * on the person for, derived from its doc and the person's own marks there,
 * never stored. The service reads an artifact's {@link ArtifactFacts} from
 * its doc once per change (service.ts `factsOf`); everything here is a rule
 * over them and over what the hub holds of its sessions (their plans, their
 * turns, whether they ended).
 *
 * Something reaches the person only when it holds a question for them. An
 * artifact asks only while it puts a pick to them: a decision page's cards
 * or a design graph's two or more directions (questions.ts), with its ask
 * line set (the panel's head, `artifacts.ask`), and is its session's to put
 * to the person: not a draft, not handed up to a parent that hasn't opened
 * it, not a maker's change held for one, not an option's media on a
 * decision page (the page asks, its Canvases and Previews are its
 * pictures), not a folder preview whose files can't be shown again. Its
 * ask is open while a question of it is open (questions.ts: no pick, no
 * note, no pin on it the agent answered and resolved, not taken or
 * withdrawn by the agent). What is written and not sent is an answer: Send
 * counts for nothing here. A page that asks no pick (a report, a canvas to
 * look at, a preview) never waits on him, opened or not; an agent's reply
 * on a pin that needs his choice is its session's question (core asks.ts),
 * never the artifact's. Answers the session hasn't read yet are its move,
 * and ask nothing more of the person; what is still open is still theirs
 * (rule 1).
 *
 * How it leaves, by rule:
 * 1. Answered: its reasons go as they are answered, a partial answer
 *    leaving the rest.
 * 2. The writer moved on ({@link movedOn}). One asked while its writer was
 *    at work on its plan ({@link ArtifactAsked.step}) leaves once that step
 *    is ticked or removed (Projects spec §5.2); while the step stands, or
 *    an open step's `waitsOn` names a card of it, the plan holds it
 *    ({@link planHolds}). One asked with no step waiting leaves once the
 *    writer's next turn ended with no new show of it
 *    ({@link ArtifactAsked.movedAt}). That retires its open questions,
 *    never an answer he hasn't read. A writer whose work item is live
 *    never moves on so: its item rests on its asks until they are answered
 *    or it ends (rule 4; hub work-items.ts `onPerson`), whatever its parent
 *    wakes it to say. Nor does one that showed an artifact another session
 *    made while that maker's item is live: the ask stands while its maker
 *    works, whoever showed it (service.ts `makerWorks`).
 * 3. Superseded: a revision, or a same-name create, is the same artifact:
 *    its item changes in place.
 * 4. Its session ended: it leaves Needs you and is one notice, "<harness>
 *    ended; …".
 * 5. Not now: the person's ✕, a notice id the item carries
 *    (`notNow`), acknowledged; a new `raisedAt` makes it another.
 * 6. A look clears its notices; only an answer clears an open question.
 */
import {
  type ArtifactNeed,
  type ArtifactNeedNotice,
  type ArtifactNeedNoticePart,
  type ArtifactPending,
  type ArtifactReason,
  type ArtifactStop,
  artifactStopHref,
  notNowId,
  projectPageAt,
  setupLanding,
} from "@cawco/core/artifact-needs";
import type { CanvasAuthor } from "@cawco/core/canvas";
import type { ArtifactAsked } from "@cawco/core/doc-meta";
import type { HarnessKind } from "@cawco/core/harness/kinds";
import { type KeptStep, stepNamesArtifact } from "@cawco/core/plan";
import { artifactLink } from "@cawco/core/references";
import type { ArtifactChange, ArtifactRow } from "../db/artifacts";
import { isSetupPage } from "../setup";

/** What an artifact's doc and row say, read once per change of either. */
export interface ArtifactFacts {
  /** Its questions (questions.ts `answersOf`: a page's cards, a design graph's pick between its directions), answered or taken, of those not withdrawn; null when it puts no pick to the person. */
  answers: { answered: number; asked: number } | null;
  asked: ArtifactAsked | null;
  /** The latest revision's changes the person hasn't looked at. */
  changes: { count: number; revision: number } | null;
  /** Resolved pins whose closing answer is newer than the person's look, by number. */
  closed: { at: string; pin: number }[];
  draft: boolean;
  /** The first decision, in page order, with no answer. */
  firstOpen: string | null;
  /** Why a folder preview's files can't be shown again (doc `meta.sourceGone`, folder-move.ts); null while they can. */
  gone: string | null;
  /** Handed up to a parent session that hasn't opened it, or a maker's change held for it: not the person's yet. */
  handed: boolean;
  /** A design graph's pick has its answer: a value, pick or note set on it (never a dial or a tuned move alone, core `answersIn`), or the agent took or withdrew it. */
  judged: boolean;
  /** When the person last had it on screen (a view's word), ISO. */
  lookedAt: string | null;
  /** An option's media on a decision page of its session (its Canvas or Preview piece), now or before that page went. */
  media: boolean;
  /** Made for its maker's own reading (`meta.reading`): never the person's to act on. */
  reading: boolean;
  /** When its session last published or changed it (`meta.revisedAt`), ISO. */
  revisedAt: string | null;
  /** What Send sends now: picks, notes and values since the last Send, dials too. */
  unsent: number;
  /** Of those, his answers (core `answersIn`): what may send the page by itself ({@link answeredWhole}). */
  unsentAnswers: number;
  /** Made by a design check's verifier (hub work-item-state.ts `isVerifierParent`): the hub's own helper's working material, never the person's to act on. */
  verifier: boolean;
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
  steps: readonly KeptStep[];
}

const ms = (iso: string | null | undefined): number => {
  const at = iso ? Date.parse(iso) : Number.NaN;
  return Number.isNaN(at) ? 0 : at;
};

/**
 * Whether `row` is put to the person: a page to pick on or a design graph to
 * judge, its ask line set, its session's to put to the person (not a draft,
 * not handed up or held, not an option's media, its folder not gone).
 */
const putToPerson = (row: ArtifactRow, facts: ArtifactFacts): boolean =>
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
 * Whether `row` carries an ask: it is put to the person and puts a pick to
 * them (`facts.answers`: a question of it, open or answered).
 */
const asks = (row: ArtifactRow, facts: ArtifactFacts): boolean =>
  putToPerson(row, facts) && facts.answers !== null;

/** An artifact with a question open. */
const unanswered = (facts: ArtifactFacts): boolean =>
  facts.answers !== null && facts.answers.answered < facts.answers.asked;

/**
 * Whether `row` could wait on the person or notice them at all, read from
 * its facts alone: the rest of its rules need its sessions (their plans,
 * their turns, whether they ended), read only for these. One a design
 * check's verifier made never does: it is the hub's helper's working
 * material, and Needs you holds only what the session he works with put
 * there (the owner's page-route pick, 2026-11-15). Nor does one its maker
 * made for its own reading (`facts.reading`). Read from the row and
 * doc alone (no held version, no other page's media), it is what the
 * artifact's row keeps as `may_wait` (schema.ts `artifacts.mayWait`), so
 * the lane reads only those that may.
 */
export const mayWait = (row: ArtifactRow, facts: ArtifactFacts): boolean =>
  !(facts.verifier || facts.reading || facts.draft) &&
  row.heldFor === null &&
  row.does !== "try" &&
  ((asks(row, facts) && unanswered(facts)) ||
    facts.closed.length > 0 ||
    (facts.changes !== null &&
      facts.changes.count > 0 &&
      row.openedRevision !== null &&
      row.openedRevision < row.revision));

/**
 * Whether what the person wrote on `row` goes to its session by itself
 * (the owner, 2026-11-05: no Send once he has answered; artifacts/service.ts
 * `sendAnswered`): a page to pick on or a design graph's pick with every
 * question answered, taken or withdrawn, or a design graph with no pick and
 * a value, pick or note of his set on it, an answer of his not sent yet.
 * Values he is only trying out (core `answersIn`: a dial, a tuned
 * move) never send it: they go with the next pick or Send (the owner,
 * 2026-11-21: "Only Pick or Send wakes it"). A project's setup page never
 * does: its Send sets the project up. Nor does one not the person's (a
 * draft, handed up or held, an option's media).
 */
export const answeredWhole = (
  row: ArtifactRow,
  facts: ArtifactFacts
): boolean => {
  if (
    !putToPerson(row, facts) ||
    isSetupPage(row) ||
    facts.unsentAnswers === 0
  ) {
    return false;
  }
  return facts.answers
    ? facts.answers.answered === facts.answers.asked
    : row.does === "judge";
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
 * Whether the writer's plan holds artifact `id`'s ask: the step it was asked
 * at (`asked.step`, the artifact's own ask record) still stands open in the
 * plan, or an open step's `waitsOn` names a card or pin of it.
 */
export const planHolds = (
  id: string,
  asked: ArtifactAsked | null,
  steps: readonly KeptStep[]
): boolean =>
  steps.some(
    (step) =>
      stepNamesArtifact(step, id) ||
      (asked?.step !== undefined &&
        step.id === asked.step &&
        step.status !== "completed")
  );

/**
 * Rule 2: the writer moved on. Its plan holding the ask keeps it
 * ({@link planHolds}); one asked at a step leaves once that step is ticked
 * or removed (Projects spec §5.2); one asked at none leaves once the
 * writer's next turn ended with nothing of its plan holding it.
 */
export const movedOn = (
  id: string,
  asked: ArtifactAsked | null,
  steps: readonly KeptStep[]
): boolean =>
  asked !== null &&
  !planHolds(id, asked, steps) &&
  (asked.step !== undefined || asked.movedAt !== undefined);

/**
 * What `row` waits on the person for: its open questions, rules 1 and 2
 * applied; none when nothing is asked of them.
 */
const reasonsOf = (
  row: ArtifactRow,
  facts: ArtifactFacts,
  steps: readonly KeptStep[]
): ArtifactReason[] =>
  facts.answers &&
  asks(row, facts) &&
  unanswered(facts) &&
  !movedOn(row.id, facts.asked, steps)
    ? [{ kind: "answers", ...facts.answers }]
    : [];

/** When it became pending: its publish; ms epoch. */
const raisedAtOf = (row: ArtifactRow, facts: ArtifactFacts): number =>
  ms(facts.revisedAt) || row.createdAt.getTime();

/** Where its panel opens it: at its first open card, else its top. */
const stopOf = (
  reason: ArtifactReason | undefined,
  facts: ArtifactFacts
): ArtifactStop =>
  reason && facts.firstOpen ? { card: facts.firstOpen } : { top: true };

/**
 * Where its item opens: a project's setup page, which no panel opens
 * (service `boardOf`), where it lands (core `setupLanding`); the session
 * that holds it, at `stop`; a project's page that outlived its session,
 * in its project's Decisions tab (core `projectPageAt`). At `stop`'s card
 * when it names one.
 */
const hrefOf = (
  row: ArtifactRow,
  stop: ArtifactStop,
  setUp: boolean
): string => {
  const card = "card" in stop ? stop.card : null;
  if (row.projectId !== null && isSetupPage(row)) {
    return setupLanding(row.projectId, setUp, card);
  }
  if (row.instanceId !== null) {
    return artifactStopHref(row.instanceId, row.id, stop);
  }
  if (row.projectId !== null) {
    return projectPageAt(row.projectId, row.name, card);
  }
  // Every artifact but a project's page goes with its session (db/schema.ts `artifacts.instanceId`).
  throw new Error(`Artifact ${row.id} has neither a session nor a project.`);
};

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
    facts.reading ||
    row.heldFor !== null ||
    row.does === "try"
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
