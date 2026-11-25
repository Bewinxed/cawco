/**
 * What a wait waits on, settled or not: the one resolver dispatch, the board,
 * every task tool and a plan step read (wait-targets.ts has the grammar).
 *
 * | Target  | Settled when                                       | Flagged, still unsettled, when |
 * | ------- | -------------------------------------------------- | ------------------------------ |
 * | task    | in a done stage; a duplicate follows its survivor  | the project has no such task; a routine paused, held (its deadline, failing slots, a question), dropped or gone unstopped |
 * | card    | answered; with `=<option>`, answered that option   | its page is deleted; answered another option |
 * | pin     | resolved                                           | its page or pin is gone        |
 * | pr      | merged                                             | closed unmerged                |
 * | run     | green                                              | red                            |
 * | session | its work item finished                             | its work item failed or was stopped |
 * | time    | its instant has passed ({@link WaitWorld.now})     | never                          |
 *
 * A task target that was dropped (not as a duplicate) settles as `dropped`:
 * the wait is removed (tasks.ts), and the answer says so. A flag stays until
 * someone removes or re-points the wait. A card's and a pin's `value` is
 * what it settled with: an attempt keeps it as its witness (dispatch.ts), so
 * a card answered differently since is told apart from one answered the
 * same way again.
 *
 * A PR's and a run's state is its item's mirror row's (links.ts
 * `linkWait`), which the project's poll of its forge reads and its events
 * keep, so it outlives a restart. A project with no watch on that forge
 * poller is refused either target where it is written ({@link readWait}).
 *
 * A task that is a routine (§5.5) settles only by its stop: its task in a
 * done stage (a run said stop, or the person moved it there). A routine
 * dropped or taken out of tasks/ without its stop never releases held work:
 * the wait is flagged, never removed. Its `value` is `met` once done, an
 * attempt's witness: one dispatched on it hears once if it leaves done. A
 * wait on a routine that never stops (no stop condition) is refused where
 * it is written ({@link readWait}).
 *
 * A date settles once the read's clock passes it and stays settled. Nothing
 * else moves when a date passes, so the minute's tick in waits.ts tells the
 * project (tasks.ts `waitsMoved`) and the plans that wait on one.
 */

import { referenceHref } from "@cawco/core/references";
import type { ConditionState, ConditionView } from "@cawco/core/routine-kinds";
import type { WaitState } from "@cawco/core/task-views";
import type { StageKind } from "@cawco/core/views";
import {
  linkTarget,
  taskTarget,
  timeTarget,
  type WaitTarget,
  waitHandle,
  waitTarget,
} from "@cawco/core/wait-targets";
import {
  conditionStateWords,
  conditionWords,
} from "@cawco/core/words/conditions";
import { taskLinkWords } from "@cawco/core/words/task-links";
import { problem } from "elysia";
import type { WorkItemState } from "./db/schema";
import { type RoutineFacts, stopViewOf } from "./routine-stop";

/** A pull request's or an Actions run's state as its mirror row holds it; `checking` before the poll read it. */
export type LinkWaitState =
  "open" | "merged" | "closed" | "running" | "green" | "red" | "checking";

/** What the resolver reads of the hub, each answer the thing's own state now. */
export interface WaitWorld {
  /** Card `card` of page `artifactId`: its question, whether the page asks it, the pick it holds (null: none) and the options picked in it; undefined once the page is deleted. */
  readonly card: (
    artifactId: string,
    card: string
  ) =>
    | {
        asked: boolean;
        page: string;
        picked: readonly string[];
        question: string;
        value: string | null;
      }
    | undefined;
  /** Whether the folder's history shows the task taken out of tasks/ (archived or deleted): done with. */
  readonly gone: (id: string) => boolean;
  /** A pull request's or run's state and title as its mirror row holds them. */
  readonly link: (target: Extract<WaitTarget, { kind: "pr" | "run" }>) => {
    state: LinkWaitState;
    title: string | null;
  };
  /** The read's clock, ms since the epoch: one instant for every date the read settles. */
  readonly now: number;
  /** Pin `number` of artifact `artifactId`: what it stands on, and whether it is resolved; undefined when it is gone. */
  readonly pin: (
    artifactId: string,
    number: number
  ) => { label: string; resolved: boolean } | undefined;
  /** The project the waits are read in: a task target is one of its tasks. */
  readonly projectId: string;
  /**
   * The routine a task of the project is or was (its trigger, by task id),
   * with why its task closed; undefined for a task that is no routine. Read
   * even when the task is gone, so a routine taken out flags its waits.
   */
  readonly routine: (taskId: string) =>
    | (Omit<RoutineFacts, "stop"> & {
        closeReason: string | null;
        id: string;
        stop: string | null;
      })
    | undefined;
  /** A session by its whole id: its title and its work item's state (null: it runs none); undefined when the hub has none. */
  readonly session: (
    instanceId: string
  ) => { item: WorkItemState | null; title: string } | undefined;
  /** One of the project's tasks as its index holds it; undefined when it has none. */
  readonly task: (id: string) =>
    | {
        duplicateOf: string | null;
        kind: StageKind | null;
        stage: string;
        title: string;
      }
    | undefined;
}

const flagged = (
  base: Omit<WaitState, "dropped" | "flag" | "settled" | "value">,
  flag: string
): WaitState => ({
  ...base,
  settled: false,
  flag,
  value: null,
  dropped: false,
});

/**
 * A task that is a routine: settled only once done (its stop), flagged
 * while paused, held or ended without its stop; never removed.
 */
const routineTaskState = (
  id: string,
  world: WaitWorld,
  routine: NonNullable<ReturnType<WaitWorld["routine"]>>
): WaitState => {
  const href = referenceHref("task", `${world.projectId}/${id}`);
  const task = world.task(id);
  const base = { target: id, kind: "task" as const, href };
  const label = task?.title ?? routine.stop ?? id;
  if (!routine.stop) {
    return flagged(
      { ...base, label, state: "no stop condition" },
      conditionWords.flagNoCondition
    );
  }
  const condition: ConditionView = stopViewOf(
    { ...routine, stop: routine.stop },
    task ? task.kind : "gone",
    routine.closeReason
  );
  const named = {
    ...base,
    label,
    state: conditionStateWords[condition.state],
    condition: { ...condition, routineId: routine.id },
  };
  const flag = conditionFlag(condition);
  if (flag) {
    return flagged(named, flag);
  }
  const met = condition.state === "met";
  return {
    ...named,
    settled: met,
    flag: null,
    value: met ? "met" : null,
    dropped: false,
  };
};

/** A task target, a duplicate followed to its survivor. */
const taskState = (
  id: string,
  world: WaitWorld,
  seen: ReadonlySet<string> = new Set()
): WaitState => {
  const routine = world.routine(id);
  if (routine) {
    return routineTaskState(id, world, routine);
  }
  const href = referenceHref("task", `${world.projectId}/${id}`);
  const task = world.task(id);
  const base = { target: id, kind: "task" as const, href };
  if (!task) {
    return world.gone(id)
      ? {
          ...base,
          label: id,
          settled: true,
          state: "archived",
          flag: null,
          value: null,
          dropped: false,
        }
      : flagged(
          { ...base, label: id, state: "missing" },
          "is not in the project"
        );
  }
  const named = { ...base, label: task.title };
  if (task.kind === "done") {
    return {
      ...named,
      settled: true,
      state: "done",
      flag: null,
      value: null,
      dropped: false,
    };
  }
  if (task.kind === "dropped" && task.duplicateOf && !seen.has(id)) {
    const survivor = taskState(task.duplicateOf, world, new Set([...seen, id]));
    return {
      ...survivor,
      target: id,
      state: `duplicate, ${survivor.state}`,
      dropped: false,
    };
  }
  if (task.kind === "dropped") {
    return {
      ...named,
      settled: true,
      state: "dropped",
      flag: null,
      value: null,
      dropped: true,
    };
  }
  return {
    ...named,
    settled: false,
    state: task.stage || "no stage",
    flag: null,
    value: null,
    dropped: false,
  };
};

const LINK_SETTLED: ReadonlySet<LinkWaitState> = new Set(["merged", "green"]);

/** Each red state's flag, told to the person once per task's wait (wait-flags.ts). */
const LINK_FLAG: Partial<Record<LinkWaitState, string>> = {
  closed: taskLinkWords.closedUnmerged,
  red: taskLinkWords.runFailed,
};

/**
 * A card target: settled once answered, flagged once its page is deleted or
 * asks it no more. One that names an option settles only on that option's
 * pick, and is flagged on any other: a proposal's task waits on its Do it,
 * and a Not now leaves it held, never ready.
 */
const cardState = (
  target: Extract<WaitTarget, { kind: "card" }>,
  world: WaitWorld
): WaitState => {
  const href = referenceHref("decision", `${target.artifactId}/${target.card}`);
  const card = world.card(target.artifactId, target.card);
  const base = { target: waitHandle(target), kind: target.kind, href };
  if (!card) {
    return flagged(
      { ...base, label: target.card, state: "deleted" },
      "was deleted with its page"
    );
  }
  const named = { ...base, label: card.question || target.card };
  if (!card.asked) {
    return flagged(
      { ...named, state: "missing" },
      `is no longer asked on ${card.page}`
    );
  }
  if (
    target.option &&
    card.value !== null &&
    !card.picked.includes(target.option)
  ) {
    return flagged(
      { ...named, state: "answered otherwise" },
      `was picked “${card.value}”, not “${target.option}”`
    );
  }
  return {
    ...named,
    settled: card.value !== null,
    state: card.value === null ? "open" : "picked",
    flag: null,
    value: card.value,
    dropped: false,
  };
};

/** A pin target: settled once resolved, flagged once it is gone. */
const pinState = (
  target: Extract<WaitTarget, { kind: "pin" }>,
  world: WaitWorld
): WaitState => {
  const href = referenceHref("pin", `${target.artifactId}/${target.number}`);
  const pin = world.pin(target.artifactId, target.number);
  const base = { target: waitHandle(target), kind: target.kind, href };
  if (!pin) {
    return flagged(
      { ...base, label: `pin ${target.number}`, state: "gone" },
      "is gone"
    );
  }
  return {
    ...base,
    label: pin.label,
    settled: pin.resolved,
    state: pin.resolved ? "resolved" : "open",
    flag: null,
    value: pin.resolved ? "resolved" : null,
    dropped: false,
  };
};

/** A pull request or run: settled once merged or green, flagged once closed unmerged or red. */
const linkState = (
  target: Extract<WaitTarget, { kind: "pr" | "run" }>,
  world: WaitWorld
): WaitState => {
  const read = world.link(target);
  const label =
    target.kind === "pr"
      ? `${taskLinkWords.changeRequest(target.provider)} ${target.ref}${read.title ? ` ${read.title}` : ""}`
      : `${read.title ?? "Actions run"} ${target.id}`;
  const base = {
    target: target.url,
    kind: target.kind,
    href: target.url,
    label,
  };
  const flag = LINK_FLAG[read.state];
  if (flag) {
    return flagged({ ...base, state: read.state }, flag);
  }
  return {
    ...base,
    settled: LINK_SETTLED.has(read.state),
    state: read.state,
    flag: null,
    value: null,
    dropped: false,
  };
};

/** A session: settled once its work item finished, flagged once it failed or was stopped. */
const sessionState = (
  target: Extract<WaitTarget, { kind: "session" }>,
  world: WaitWorld
): WaitState => {
  const href = referenceHref("session", target.instanceId);
  const session = world.session(target.instanceId);
  const base = { target: waitHandle(target), kind: target.kind, href };
  if (!session) {
    return flagged(
      { ...base, label: waitHandle(target), state: "gone" },
      "is gone"
    );
  }
  const named = { ...base, label: session.title };
  if (session.item === "failed" || session.item === "cancelled") {
    return flagged(
      { ...named, state: session.item },
      session.item === "failed" ? "ended failed" : "was stopped"
    );
  }
  return {
    ...named,
    settled: session.item === "done",
    state: session.item === "done" ? "finished" : "working",
    flag: null,
    value: null,
    dropped: false,
  };
};

/** Each held, paused or ended routine's flag, read with its stop's view. */
const conditionFlag = (condition: ConditionView): string | undefined => {
  const flags: Partial<Record<ConditionState, () => string>> = {
    "timed-out": () =>
      conditionWords.flagTimedOut(
        new Date(condition.deadline ?? Date.now()).toISOString().slice(0, 10)
      ),
    failing: () => conditionWords.flagFailing,
    asked: () => conditionWords.flagAsked,
    paused: () => conditionWords.flagPaused,
    deleted: () => conditionWords.flagDeleted,
  };
  return flags[condition.state]?.();
};

/** A date: settled once the read's clock has passed it. */
const timeState = (
  target: Extract<WaitTarget, { kind: "time" }>,
  world: WaitWorld
): WaitState => {
  const passed = target.at <= world.now;
  const iso = new Date(target.at).toISOString();
  return {
    target: waitHandle(target),
    kind: target.kind,
    href: "",
    label: taskLinkWords.dateLabel(iso.slice(0, 10), iso.slice(11, 16)),
    settled: passed,
    state: passed ? taskLinkWords.datePassed : taskLinkWords.dateNotYet,
    flag: null,
    value: null,
    dropped: false,
  };
};

/**
 * Whether `target` is settled, and where it stands: THE resolver. Every
 * reader of a wait (tasks.ts readiness, dispatch, the board, the task tools,
 * a plan step) asks it here.
 */
const settled = (target: WaitTarget, world: WaitWorld): WaitState => {
  switch (target.kind) {
    case "task":
      return taskState(target.id, world);
    case "card":
      return cardState(target, world);
    case "pin":
      return pinState(target, world);
    case "pr":
    case "run":
      return linkState(target, world);
    case "session":
      return sessionState(target, world);
    case "time":
      return timeState(target, world);
  }
};

/** {@link settled} for a wait as a file keeps it; one that reads as no target is flagged. */
export const settledHandle = (handle: string, world: WaitWorld): WaitState => {
  const target = waitTarget(handle);
  return target
    ? settled(target, world)
    : flagged(
        {
          target: handle,
          kind: "task",
          href: "",
          label: handle,
          state: "unreadable",
        },
        "is not a target the hub reads"
      );
};

/** Waits in the order every reader shows them: unsettled first, each kind's order kept. */
export const unsettledFirst = <T extends { settled: boolean }>(
  waits: readonly T[]
): T[] => [
  ...waits.filter((wait) => !wait.settled),
  ...waits.filter((wait) => wait.settled),
];

// --- what an agent or the dashboard writes ------------------------------------

/** What reading a written wait asks of the hub; each refusal said in words. */
export interface WaitReader {
  /** The cards page `artifactId` asks, each with its options' ids (none for a page that is not a program). */
  readonly cards: (
    artifactId: string
  ) => { id: string; options: readonly string[] }[];
  /** Why the project cannot wait on this pull or merge request or run (no watch reads its forge), or nothing when it can. */
  readonly linkRefusal: (
    target: Extract<WaitTarget, { kind: "pr" | "run" }>
  ) => string | undefined;
  /** The page a name, handle or id names, by its whole id and name; a refusal in words when it names none. */
  readonly page: (asked: string) => { id: string; name: string } | string;
  /** Whether page `artifactId` holds pin `number`. */
  readonly pinHeld: (artifactId: string, number: number) => boolean;
  /**
   * The routine a task of the project is (§5.5): its title and its stop
   * condition (null: it runs until ended); undefined for a task that is no
   * routine.
   */
  readonly routine: (
    taskId: string
  ) => { stop: string | null; title: string } | undefined;
  /** The session a handle names, and whether it runs a work item; a refusal in words when it names none. */
  readonly session: (
    handle: string
  ) => { dir: string; id: string; item: boolean } | string;
}

const HANDLE_HEX = /^[0-9a-f-]{6,}$/iu;
const PIN_NUMBER = /^\d{1,6}$/u;
const WEB = /^https?:\/\//iu;
/** What starts a written date: `2026-12-01`. */
const DAY_FIRST = /^\d{4}-\d{2}-\d{2}/u;

/** A session handle (`cockpit#5a167bde`) as a session target, refused when it names none or runs no work item. */
const sessionWait = (written: string, reader: WaitReader) => {
  const session = reader.session(written);
  if (typeof session === "string") {
    return problem(400, { code: "wait-session-unknown", detail: session });
  }
  if (!session.item) {
    return problem(400, {
      code: "wait-session-no-item",
      detail: `“${written}” is a session that runs no work item, so it never finishes: wait on its task or a card instead.`,
    });
  }
  const target: WaitTarget = {
    kind: "session",
    dir: session.dir,
    instanceId: session.id,
  };
  return target;
};

/**
 * A wait as an agent or the dashboard writes it, read into its target: a
 * task (whose being in the project the caller checks), a card or a pin of a
 * page the writer may name, a pull or merge request or run while the
 * project reads its forge, a session that runs a work item, a date; a task that is a routine
 * only when it has a stop condition.
 * Otherwise its refusal, each cause under its own code.
 */
export const readWait = (written: string, reader: WaitReader) => {
  const said = written.trim();
  const task = taskTarget(said);
  if (task) {
    // A routine with no stop never ends: nothing waiting on it would go.
    const routine = reader.routine(task);
    if (routine && routine.stop === null) {
      return problem(400, {
        code: "wait-routine-never-ends",
        detail: `${task} (“${routine.title}”) is a routine with no stop condition, so it never moves to done and nothing waiting on it would go. Give it one (task_update with stop: the statement true once it may stop), or wait on something else.`,
      });
    }
    const target: WaitTarget = { kind: "task", id: task };
    return target;
  }
  if (DAY_FIRST.test(said)) {
    return (
      timeTarget(said) ??
      problem(400, {
        code: "wait-time-unread",
        detail: `“${said}” is not a date the hub reads: write an ISO 8601 date or date-time, such as 2026-12-01 or 2026-12-01T09:00+03:00 (no offset is UTC).`,
      })
    );
  }
  if (WEB.test(said)) {
    return readLink(said, reader);
  }
  if (waitTarget(said)?.kind === "session") {
    return sessionWait(said, reader);
  }
  const hash = said.lastIndexOf("#");
  if (hash > 0 && hash < said.length - 1) {
    return readCard(said, hash, reader);
  }
  const slash = said.lastIndexOf("/");
  if (slash > 0 && PIN_NUMBER.test(said.slice(slash + 1))) {
    return readPin(said, slash, reader);
  }
  return problem(400, {
    code: "wait-target-unknown",
    detail: `Can't wait on “${said}”. Use a task (tsk-12), a card (<page>#<card>), a pin (<page>/<number>), a pull or merge request on GitHub, GitLab or Gitea, a GitHub Actions run, a session (<dir>#<id>) or a date (2026-12-01, 2026-12-01T09:00+03:00).`,
  });
};

/** A link as a wait: a pull or merge request on GitHub, GitLab or Gitea, or a GitHub Actions run, while the project reads its forge. */
const readLink = (said: string, reader: WaitReader) => {
  const link = linkTarget(said);
  if (!link) {
    return problem(400, {
      code: "wait-link-unsettled",
      detail: `Can't wait on the link “${said}”. Use a pull or merge request on GitHub, GitLab or Gitea, a GitHub Actions run, a task or routine, a card, a pin, a session or a date.`,
    });
  }
  const refused = reader.linkRefusal(link);
  return refused
    ? problem(400, {
        code: "wait-github-unavailable",
        detail: `“${said}” cannot be waited on: ${refused}`,
      })
    : link;
};

/** `<page>#<card>` or `<page>#<card>=<option>` as a card the page asks; else a session handle (`cockpit#5a167bde`). */
const readCard = (said: string, hash: number, reader: WaitReader) => {
  const page = reader.page(said.slice(0, hash));
  const [card = "", option, ...rest] = said.slice(hash + 1).split("=");
  if (typeof page === "string") {
    return HANDLE_HEX.test(card) && option === undefined
      ? sessionWait(said, reader)
      : problem(400, { code: "wait-page-unknown", detail: page });
  }
  const cards = reader.cards(page.id);
  const asked = cards.find((one) => one.id === card);
  if (!asked) {
    return problem(400, {
      code: "wait-card-unknown",
      detail: `${page.name} asks no card “${card}”. Its cards: ${cards.map((one) => one.id).join(", ") || "none"}.`,
    });
  }
  if (option === undefined) {
    const any: WaitTarget = { kind: "card", artifactId: page.id, card };
    return any;
  }
  const picked: WaitTarget = {
    kind: "card",
    artifactId: page.id,
    card,
    option,
  };
  return option && rest.length === 0 && asked.options.includes(option)
    ? picked
    : problem(400, {
        code: "wait-option-unknown",
        detail: `The card “${card}” on ${page.name} has no option “${option}”. Its options: ${asked.options.join(", ") || "none"}.`,
      });
};

/** `<page>/<number>` as a pin the page holds. */
const readPin = (said: string, slash: number, reader: WaitReader) => {
  const page = reader.page(said.slice(0, slash));
  if (typeof page === "string") {
    return problem(400, { code: "wait-page-unknown", detail: page });
  }
  const number = Number(said.slice(slash + 1));
  const target: WaitTarget = { kind: "pin", artifactId: page.id, number };
  return reader.pinHeld(page.id, number)
    ? target
    : problem(400, {
        code: "wait-pin-unknown",
        detail: `${page.name} holds no pin ${number}.`,
      });
};

// --- cycles -----------------------------------------------------------------------

/**
 * A cycle reachable from `start` through `next`, its ends the same task
 * (`[a, b, a]`, `[c, c]`); undefined when none is. Asked with a write applied
 * before it lands: the graph had no cycle before, so any found runs through
 * the write, and the write is refused with it, by name.
 */
export const cycleFrom = (
  start: string,
  next: (id: string) => readonly string[]
): string[] | undefined => {
  const done = new Set<string>();
  const walk = (at: string, path: string[]): string[] | undefined => {
    for (const to of next(at)) {
      const back = path.indexOf(to);
      if (back !== -1) {
        return [...path.slice(back), to];
      }
      if (!done.has(to)) {
        const found = walk(to, [...path, to]);
        if (found) {
          return found;
        }
      }
    }
    done.add(at);
  };
  return walk(start, [start]);
};
