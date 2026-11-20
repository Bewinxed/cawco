/**
 * What a wait waits on, settled or not: the one resolver dispatch, the board,
 * every task tool and a plan step read (wait-targets.ts has the grammar).
 *
 * | Target  | Settled when                                       | Flagged, still unsettled, when |
 * | ------- | -------------------------------------------------- | ------------------------------ |
 * | task    | in a done stage; a duplicate follows its survivor  | the project has no such task   |
 * | card    | answered; with `=<option>`, answered that option   | its page is deleted; answered another option |
 * | pin     | resolved                                           | its page or pin is gone        |
 * | pr      | merged                                             | closed unmerged                |
 * | run     | green                                              | red                            |
 * | session | its work item finished                             | its work item failed or was stopped |
 * | routine | a run said its condition is met, or the person marked it met | the hub stopped it at its deadline or after failing checks; it is paused, deleted, or has no condition |
 * | time    | its instant has passed ({@link WaitWorld.now})     | never                          |
 *
 * A task target that was dropped (not as a duplicate) settles as `dropped`:
 * the wait is removed (tasks.ts), and the answer says so. A flag stays until
 * someone removes or re-points the wait. A card's and a pin's `value` is
 * what it settled with: an attempt keeps it as its witness (dispatch.ts), so
 * a card answered differently since is told apart from one answered the
 * same way again.
 *
 * A PR's state is its task link row's (external-items.ts `prWait`), which
 * the project's GitHub poll reads and its events keep; a run's comes from
 * that poll itself (ingress.ts `githubWait`). A project with no GitHub
 * poller is refused either target where it is written ({@link readWait}).
 *
 * A condition's state is its routine's (routines.ts `conditionOf`): met is
 * latched there, so the wait stays settled until someone checks it again,
 * which un-meets it. Its `value` is `met`, an attempt's witness: one
 * dispatched on it hears once if it is un-met.
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
  githubTarget,
  ROUTINE_WAIT,
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

/** A pull request's state as its link row holds it, or an Actions run's as the poller last read it. */
export type GitHubWaitState =
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
  /** A pull request's state and title as its link row holds them; a run's as the project's poller last read them. */
  readonly github: (target: Extract<WaitTarget, { kind: "pr" | "run" }>) => {
    state: GitHubWaitState;
    title: string | null;
  };
  /** Whether the folder's history shows the task taken out of tasks/ (archived or deleted): done with. */
  readonly gone: (id: string) => boolean;
  /** The read's clock, ms since the epoch: one instant for every date the read settles. */
  readonly now: number;
  /** Pin `number` of artifact `artifactId`: what it stands on, and whether it is resolved; undefined when it is gone. */
  readonly pin: (
    artifactId: string,
    number: number
  ) => { label: string; resolved: boolean } | undefined;
  /** The project the waits are read in: a task target is one of its tasks. */
  readonly projectId: string;
  /** A routine by its whole id: its name and its condition (null: it has none); undefined when the hub has none. */
  readonly routine: (
    id: string
  ) => { condition: ConditionView | null; name: string } | undefined;
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

/** A task target, a duplicate followed to its survivor. */
const taskState = (
  id: string,
  world: WaitWorld,
  seen: ReadonlySet<string> = new Set()
): WaitState => {
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

const GITHUB_SETTLED: ReadonlySet<GitHubWaitState> = new Set([
  "merged",
  "green",
]);

/** Each red state's flag, told to the person once per task's wait (wait-flags.ts). */
const GITHUB_FLAG: Partial<Record<GitHubWaitState, string>> = {
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
const githubState = (
  target: Extract<WaitTarget, { kind: "pr" | "run" }>,
  world: WaitWorld
): WaitState => {
  const read = world.github(target);
  const label =
    target.kind === "pr"
      ? `PR #${target.number}${read.title ? ` ${read.title}` : ""}`
      : `${read.title ?? "Actions run"} ${target.id}`;
  const base = {
    target: target.url,
    kind: target.kind,
    href: target.url,
    label,
  };
  const flag = GITHUB_FLAG[read.state];
  if (flag) {
    return flagged({ ...base, state: read.state }, flag);
  }
  return {
    ...base,
    settled: GITHUB_SETTLED.has(read.state),
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

/** Each stopped or paused condition's flag, read with its view. */
const conditionFlag = (condition: ConditionView): string | undefined => {
  const flags: Partial<Record<ConditionState, () => string>> = {
    "timed-out": () =>
      conditionWords.flagTimedOut(
        new Date(condition.deadline ?? Date.now()).toISOString().slice(0, 10)
      ),
    failing: () => conditionWords.flagFailing,
    paused: () => conditionWords.flagPaused,
  };
  return flags[condition.state]?.();
};

/**
 * A routine's condition: settled once met, flagged once the hub stopped
 * it unmet (its deadline, failing checks), it is paused, its routine is
 * deleted, or the routine has no condition at all.
 */
const routineState = (
  target: Extract<WaitTarget, { kind: "routine" }>,
  world: WaitWorld
): WaitState => {
  const href = referenceHref("routine", target.id);
  const routine = world.routine(target.id);
  const base = { target: waitHandle(target), kind: target.kind, href };
  if (!routine) {
    return flagged(
      {
        ...base,
        label: conditionWords.deletedLabel,
        state: conditionStateWords.deleted,
      },
      conditionWords.flagDeleted
    );
  }
  const { condition } = routine;
  if (!condition) {
    return flagged(
      { ...base, label: routine.name, state: "no condition" },
      conditionWords.flagNoCondition
    );
  }
  const named = {
    ...base,
    label: condition.statement,
    state: conditionStateWords[condition.state],
    condition: { ...condition, routineId: target.id },
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
      return githubState(target, world);
    case "session":
      return sessionState(target, world);
    case "routine":
      return routineState(target, world);
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
  /** Why the project cannot wait on a pull request or run (no GitHub connection), or nothing when it can. */
  readonly githubRefusal: () => string | undefined;
  /** The page a name, handle or id names, by its whole id and name; a refusal in words when it names none. */
  readonly page: (asked: string) => { id: string; name: string } | string;
  /** Whether page `artifactId` holds pin `number`. */
  readonly pinHeld: (artifactId: string, number: number) => boolean;
  /**
   * The project's routine a handle, id or name names, with its condition
   * (null: it has none); a refusal, its code and its words, when it names
   * none or the writer is in no project.
   */
  readonly routine: (asked: string) =>
    | { condition: string | null; id: string; name: string }
    | {
        code: "wait-routine-no-project" | "wait-routine-unknown";
        detail: string;
      };
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
 * page the writer may name, a pull request or run while the project has
 * GitHub, a session that runs a work item, a routine's condition, a date.
 * Otherwise its refusal, each cause under its own code.
 */
export const readWait = (written: string, reader: WaitReader) => {
  const said = written.trim();
  if (said.toLowerCase().startsWith(ROUTINE_WAIT)) {
    return readRoutine(said.slice(ROUTINE_WAIT.length).trim(), reader);
  }
  const task = taskTarget(said);
  if (task) {
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
    detail: `“${said}” names nothing the hub waits on: a task (tsk-12), a card (<page>#<card>), a pin (<page>/<number>), a GitHub pull request or Actions run, a session (<dir>#<id>), a routine's condition (routine:<handle>), or a date (2026-12-01, 2026-12-01T09:00+03:00).`,
  });
};

/** A link as a wait: a GitHub pull request or Actions run, while the project has GitHub. */
const readLink = (said: string, reader: WaitReader) => {
  const github = githubTarget(said);
  if (!github) {
    return problem(400, {
      code: "wait-link-unsettled",
      detail: `“${said}” is a link the hub cannot settle: wait on a GitHub pull request or Actions run, a task, a card, a pin, a session, a routine's condition (routine:<handle>) or a date.`,
    });
  }
  const refused = reader.githubRefusal();
  return refused
    ? problem(400, {
        code: "wait-github-unavailable",
        detail: `“${said}” cannot be waited on: ${refused}`,
      })
    : github;
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

/** `routine:<handle, id or name>` as one of the project's routines that has a condition. */
const readRoutine = (asked: string, reader: WaitReader) => {
  const routine = reader.routine(asked);
  if ("code" in routine) {
    return routine.code === "wait-routine-no-project"
      ? problem(400, {
          code: "wait-routine-no-project",
          detail: routine.detail,
        })
      : problem(400, { code: "wait-routine-unknown", detail: routine.detail });
  }
  if (routine.condition === null) {
    return problem(400, {
      code: "wait-routine-no-condition",
      detail: `Routine “${routine.name}” has no condition, so no run of it ever says met. Give it one (routine_update with condition: the statement that is true once met), or wait on something else.`,
    });
  }
  const target: WaitTarget = { kind: "routine", id: routine.id };
  return target;
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
