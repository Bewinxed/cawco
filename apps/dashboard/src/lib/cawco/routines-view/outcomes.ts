/**
 * The Routines view's one model: the project's routines (its tasks that
 * start on their own, as the hub reads them) grouped under the outcome
 * sentence each one serves, and each group's one reading of where it
 * stands, worked out from its routines alone. An outcome is that sentence
 * and nothing more: no record, no state of its own (the owner, 2026-11-22).
 */
import type { TaskRoutine } from "@cawco/core/task-views";

/** One routine as the view reads it: its task's id and title, and its trigger. */
export interface RoutineItem {
  /** The ready answers its run's question offers; empty when it asks none. */
  choices: string[];
  /** Its task is done: a run stopped it, its work finished. */
  done: boolean;
  id: string;
  /** The outcome it serves, his sentence; null when it serves none. */
  outcome: string | null;
  routine: TaskRoutine;
  /** Its task's title: the routine's name. */
  title: string;
}

/**
 * Where a routine, or an outcome by its routines, stands, worst first: a
 * run's question waits on him; it was turned off after failing (or its
 * deadline passed); it runs on its own; it was paused; it stopped, its
 * work done. An outcome is paused only when every routine under it is.
 */
const STANDINGS = ["asks", "failing", "paused", "running", "finished"] as const;
export type Standing = (typeof STANDINGS)[number];

/** The two standings that need him: the only loud ones. */
export const needsHim = (standing: Standing): boolean =>
  standing === "asks" || standing === "failing";

export function standingOf(item: RoutineItem): Standing {
  const { routine } = item;
  if (routine.needs?.why === "asked") {
    return "asks";
  }
  if (routine.needs) {
    return "failing";
  }
  if (item.done) {
    return "finished";
  }
  return routine.enabled ? "running" : "paused";
}

/** A run of it is going now. */
export const goingNow = (item: RoutineItem): boolean => {
  const state = item.routine.lastRun?.state;
  return state === "starting" || state === "running";
};

export interface Outcome {
  /** The routine its reading names: the one that needs him, when one does. */
  lead: RoutineItem;
  /** Its routines, the ones that need him first. */
  routines: RoutineItem[];
  /** His sentence; null for the routines that serve none. */
  sentence: string | null;
  /** The worst standing among its routines. */
  standing: Standing;
}

const rank = (standing: Standing): number => STANDINGS.indexOf(standing);

/**
 * The routines as outcomes, in the order he reads them: what needs him
 * first, then what runs, what he paused, what finished; the routines under
 * no outcome last whatever they hold. Within an outcome, the routine that
 * needs him leads. The order inside a standing is the order the routines
 * came in, so a group stays where it was while nothing changes.
 */
function outcomesOf(items: readonly RoutineItem[]): Outcome[] {
  const groups = new Map<string | null, RoutineItem[]>();
  for (const item of items) {
    const group = groups.get(item.outcome) ?? [];
    group.push(item);
    groups.set(item.outcome, group);
  }
  const outcomes = [...groups].flatMap(([sentence, group]): Outcome[] => {
    const routines = [...group].sort(
      (a, b) => rank(standingOf(a)) - rank(standingOf(b))
    );
    const [lead] = routines;
    // A group holds at least the routine that made it.
    if (!lead) {
      return [];
    }
    const open = routines.map(standingOf).filter((each) => each !== "finished");
    const standing = open.sort((a, b) => rank(a) - rank(b))[0] ?? "finished";
    return [{ sentence, routines, standing, lead }];
  });
  return outcomes.sort((a, b) => {
    if ((a.sentence === null) !== (b.sentence === null)) {
      return a.sentence === null ? 1 : -1;
    }
    return rank(a.standing) - rank(b.standing);
  });
}

/**
 * Keeps the outcomes where he first saw them while the view stays open:
 * one he just answered or set going again stays in its place, showing
 * what came of it, rather than jumping down as its standing changes. A new
 * read (the view opened again) orders them afresh.
 */
export function keepOrder(): (items: readonly RoutineItem[]) => Outcome[] {
  const seen: (string | null)[] = [];
  return (items) => {
    const outcomes = outcomesOf(items);
    for (const outcome of outcomes) {
      if (!seen.includes(outcome.sentence)) {
        seen.push(outcome.sentence);
      }
    }
    return [...outcomes].sort(
      (a, b) => seen.indexOf(a.sentence) - seen.indexOf(b.sentence)
    );
  };
}

/** Where his act on a routine that needs him stands, as the hub answered it. */
export type ActState =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "done"; said: string }
  | { kind: "refused"; said: string };

/** What each outcome's group takes from the view: what stands open, his acts, and the clock. */
export interface GroupProps {
  acts: Record<string, ActState>;
  onanswer: (id: string, answer: string) => void;
  onopen: (id: string) => void;
  onturnon: (id: string) => void;
  /** The routine standing open beside the view; null when none. */
  opened: string | null;
  timeOf: (ms: number) => string;
}

/** A routine of it needs him, or he just acted on one here: it stands with what needs him. */
export const leadsOf = (
  outcome: Outcome,
  acts: Record<string, ActState>
): boolean =>
  outcome.routines.some(
    (item) => item.routine.needs !== null || acts[item.id]?.kind === "done"
  );

/** A run of one of its routines asks him, or he just answered one here: its field wants room. */
export const asksOf = (
  outcome: Outcome,
  acts: Record<string, ActState>
): boolean =>
  outcome.routines.some(
    (item) =>
      item.routine.needs?.why === "asked" ||
      (acts[item.id]?.kind === "done" &&
        item.routine.lastRun?.verdict === "ask")
  );
