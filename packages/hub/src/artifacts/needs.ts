/**
 * Needs you's artifacts (core artifact-needs.ts): what each artifact waits
 * on the person for, derived from its doc and the person's own marks there,
 * never stored. The service reads an artifact's {@link ArtifactFacts} from
 * its doc once per change (service.ts `factsOf`); everything here is a rule
 * over them and over what the hub holds of its sessions (their plans, their
 * turns, whether they ended).
 *
 * What counts (a reason each, strongest first): shown and never opened, for
 * a page or canvas to pick on or judge; a decision page's picks not made;
 * picks, notes, pins and ink written and not sent; an agent's answer on an
 * open pin newer than the person's look at it (core comments.ts
 * `newAnswer`). Never: a `try` preview, a `draw` canvas with nothing
 * pinned, a draft, and one the person can't act on yet: handed up to a
 * parent that hasn't opened it, or a maker's change held for it. Picks sent
 * that the session hasn't read yet are its move, and ask nothing more of
 * the person; what is still unpicked is still theirs (rule 1).
 *
 * How it leaves, by rule:
 * 1. Answered: its reasons go as they are answered, a partial answer
 *    leaving the rest.
 * 2. The writer moved on: the plan step the hub set waiting on it
 *    ({@link ArtifactAsked.step}) ticked or removed, or with no step waiting
 *    on it, the writer's next turn ended ({@link ArtifactAsked.movedAt}),
 *    with no new show of it. That retires its ask (not opened, picks), never
 *    the person's own unsent marks or an answer he hasn't read.
 * 3. Superseded: a revision, or a same-name create, is the same artifact:
 *    its item changes in place.
 * 4. Its session ended: it leaves Needs you and is one notice, "<harness>
 *    ended; …".
 * 5. Not now: the person's ✕, a notice id the item carries
 *    (`notNow`), acknowledged; a new `raisedAt` makes it another.
 * 6. A look: opening it clears "not opened" and the notices; only an answer
 *    clears picks or unsent.
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
} from "@cawco/core";
import type { ArtifactRow } from "../db/artifacts";

/**
 * The artifact's latest ask, kept in its doc (`meta.asked`): the session
 * whose tool call made it (create, update, revise, show), when, the plan
 * step the hub set waiting on it, and when the writer's next turn ended
 * with no step waiting on it and no new show.
 */
export interface ArtifactAsked {
  at: string;
  by: string;
  movedAt?: string;
  step?: string;
  /** The Caw thread a lead's turn answered as it asked: where its item opens, his panel beside it. */
  thread?: string;
}

/** What an artifact's doc and row say, read once per change of either. */
export interface ArtifactFacts {
  /** The agent's newest answer on an open pin, ISO; null when it has none. */
  answeredAt: string | null;
  /** Open pins with an answer newer than the person's look, by number. */
  answers: number[];
  asked: ArtifactAsked | null;
  /** The latest revision's changes the person hasn't looked at. */
  changes: { count: number; revision: number } | null;
  /** Resolved pins whose closing answer is newer than the person's look, by number. */
  closed: { at: string; pin: number }[];
  draft: boolean;
  /** The first decision, in page order, not picked. */
  firstUnpicked: string | null;
  /** The first pin, by number, that holds something not sent. */
  firstUnsentPin: number | null;
  /** Handed up to a parent session that hasn't opened it, or a maker's change held for it: not the person's yet. */
  handed: boolean;
  /** When the person last had it on screen (a view's word), ISO. */
  lookedAt: string | null;
  picks: { asked: number; made: number } | null;
  /** Pins on it, open or resolved. */
  pins: number;
  /** When its session last published or changed it (`meta.revisedAt`), ISO. */
  revisedAt: string | null;
  /** What Send sends now: picks and notes since the last Send, pins with anything unsent, loose ink. */
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
  /** The writer's plan: the steps a wait on it stands on. */
  steps: PlanStep[];
}

const ms = (iso: string | null | undefined): number => {
  const at = iso ? Date.parse(iso) : Number.NaN;
  return Number.isNaN(at) ? 0 : at;
};

/** Whether `row` asks anything of the person at all. */
const asks = (row: ArtifactRow, facts: ArtifactFacts): boolean =>
  !(
    facts.draft ||
    facts.handed ||
    row.heldFor !== null ||
    row.does === "try" ||
    (row.does === "draw" && facts.pins === 0)
  );

/**
 * Whether `row` could wait on the person or notice them at all, read from
 * its facts alone: the rest of its rules need its sessions (their plans,
 * their turns, whether they ended), read only for these.
 */
export const mayWait = (row: ArtifactRow, facts: ArtifactFacts): boolean =>
  !facts.draft &&
  row.heldFor === null &&
  row.does !== "try" &&
  ((row.openedRevision === null &&
    (row.does === "pick" || row.does === "judge")) ||
    (facts.picks !== null && facts.picks.made < facts.picks.asked) ||
    facts.unsent > 0 ||
    facts.answers.length > 0 ||
    facts.closed.length > 0 ||
    (facts.changes !== null &&
      facts.changes.count > 0 &&
      row.openedRevision !== null &&
      row.openedRevision < row.revision));

/**
 * Rule 2: the writer moved on. A step of its plan waiting on the artifact
 * holds the ask; the step the hub set ticked, removed or no longer waiting
 * lets it go, and so does the writer's next turn ending with none waiting.
 */
export const movedOn = (
  id: string,
  asked: ArtifactAsked | null,
  steps: readonly PlanStep[]
): boolean => {
  if (!asked) {
    return false;
  }
  if (
    steps.some(
      (step) => step.status !== "completed" && step.waitsOn?.artifactId === id
    )
  ) {
    return false;
  }
  return asked.step !== undefined || asked.movedAt !== undefined;
};

/** What `row` waits on the person for, its rules 1, 2 and 6 applied; strongest first. */
export const reasonsOf = (
  row: ArtifactRow,
  facts: ArtifactFacts,
  steps: readonly PlanStep[]
): ArtifactReason[] => {
  if (!asks(row, facts)) {
    return [];
  }
  const retired = movedOn(row.id, facts.asked, steps);
  const reasons: ArtifactReason[] = [];
  if (
    !retired &&
    (row.does === "pick" || row.does === "judge") &&
    row.openedRevision === null
  ) {
    reasons.push({ kind: "unopened" });
  }
  if (!retired && facts.picks && facts.picks.made < facts.picks.asked) {
    reasons.push({ kind: "picks", ...facts.picks });
  }
  if (facts.unsent > 0) {
    reasons.push({ kind: "unsent", count: facts.unsent });
  }
  const [pin] = facts.answers;
  if (pin !== undefined) {
    reasons.push({ kind: "answer", count: facts.answers.length, pin });
  }
  return reasons;
};

/** When it became pending: its publish, or the agent's newest answer on an open pin; ms epoch. */
export const raisedAtOf = (row: ArtifactRow, facts: ArtifactFacts): number =>
  Math.max(
    ms(facts.revisedAt) || row.createdAt.getTime(),
    ms(facts.answeredAt)
  );

/** Where its panel opens it: at its strongest reason's first stop. */
export const stopOf = (
  reason: ArtifactReason | undefined,
  facts: ArtifactFacts
): ArtifactStop => {
  switch (reason?.kind) {
    case "picks":
      return facts.firstUnpicked
        ? { card: facts.firstUnpicked }
        : { top: true };
    case "unsent":
      return facts.firstUnsentPin === null
        ? { top: true }
        : { pin: facts.firstUnsentPin };
    case "answer":
      return { pin: reason.pin };
    case "unopened":
    case undefined:
      return { top: true };
    default: {
      const unhandled: never = reason;
      throw new Error(`unhandled reason: ${JSON.stringify(unhandled)}`);
    }
  }
};

/** Where its item opens: the thread a lead asked in, else the session that holds it. */
const viewOf = (row: ArtifactRow, facts: ArtifactFacts): string =>
  facts.asked?.thread && facts.asked.by === row.instanceId
    ? `thread:${facts.asked.thread}`
    : (row.instanceId as string);

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
    name: row.name,
    ask: row.ask || row.name,
    link: artifactLink(row.id, row.name),
    pending,
    raisedAt,
    stop,
    href: artifactStopHref(viewOf(row, facts), row.id, stop),
    notNow: notNowId(row.id, raisedAt),
    parked: false,
    unsent: facts.unsent,
  };
};

/** Its notice in Caw's panel, one row per artifact, or none. */
export const noticeOf = (
  row: ArtifactRow,
  facts: ArtifactFacts,
  sessions: ArtifactSessions
): ArtifactNeedNotice | null => {
  if (facts.draft || row.heldFor !== null || row.does === "try") {
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
    name: row.name,
    at,
    parts,
    stop,
    href:
      row.instanceId === null
        ? null
        : artifactStopHref(viewOf(row, facts), row.id, stop),
  };
};
