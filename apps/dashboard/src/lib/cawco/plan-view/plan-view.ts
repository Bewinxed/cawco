/**
 * A session's plan as the person reads it: its tasks in the plan's order,
 * each with the to-dos the plan names under it, where each stands, who is
 * on it, and what a held one waits for. Derived from the hub's plan
 * (core plan.ts `SessionPlan`, its steps' words and done state its
 * records') and the sessions working it: this session and its delegates.
 *
 * Who is on a step is read from the sessions' own plans: a delegate is on
 * the records its own plan holds under way (a delegate's plan names the
 * same tasks and to-dos, `tsk-12`, `tsk-12:td-3`), or the task it is an
 * attempt at. This session is on its own steps under way that no delegate
 * holds.
 */
import type { PlanStep, SessionPlan } from "@cawco/core/plan";
import { stepRecord } from "@cawco/core/plan";
import { taskTarget, waitTarget } from "@cawco/core/wait-targets";
import { planWords } from "@cawco/core/words/plan";
import type { StepState } from "../connect/StepMark.svelte";

/** A session working the plan: this one or a delegate of it. */
export interface PlanWorker {
  /** Its session. */
  id: string;
  /** Its title, as the tray and the sidebar name it. */
  name: string;
  /** What it is doing this minute, its live transcript's newest line; absent between turns. */
  now?: string;
  /** The records it is on: those its own plan holds under way, or the task it is an attempt at, by handle. */
  on: string[];
  /** The session whose plan this is. */
  self: boolean;
  /** Its status word while it works no turn (workspace/session-status.ts): Idle, Needs you, Stopped. */
  status: string;
  /** Working a turn now, or between turns. */
  working: boolean;
}

/** What a held step waits for, in words, and whether that is the person. */
interface PlanWait {
  /** What it waits on, said: "Waits on Comments rail and sheet", "Waits until 1 Dec". */
  words: string;
  /** It waits on the person: a card or a pin of theirs to answer. */
  you: boolean;
}

/** One line of the plan: a task, or a to-do under it. */
export interface PlanRow {
  /** Its record, by handle: `tsk-12`, `tsk-12:td-3`. */
  handle: string;
  state: StepState;
  /** The to-dos the plan names under it. */
  todos: PlanRow[];
  /** Its to-dos done, of all (a task's row). */
  todosDone: number;
  /** What it waits for, while it waits. */
  wait?: PlanWait;
  /** Who is on it, while it is under way. */
  who?: PlanWorker;
  /** Its record's words: the task's title, the to-do's text. */
  words: string;
}

/** What a wait handle names, in words: a task's title from the plan, a session's title, a pull request, a run, a day. */
function waitOf(
  handle: string,
  steps: readonly PlanStep[],
  workers: readonly PlanWorker[]
): PlanWait {
  const target = waitTarget(handle);
  if (!target) {
    return { you: false, words: planWords.waitsOn(handle) };
  }
  switch (target.kind) {
    case "card":
    case "pin":
      return { you: true, words: planWords.needsYou };
    case "task": {
      const id = taskTarget(target.id) ?? target.id;
      const task = steps.find((one) => one.id === id);
      return { you: false, words: planWords.waitsOn(task?.content ?? id) };
    }
    case "session": {
      const worker = workers.find((one) => one.id === target.instanceId);
      return {
        you: false,
        words: planWords.waitsOn(worker?.name ?? target.dir),
      };
    }
    case "pr":
      return {
        you: false,
        words: planWords.waitsOn(planWords.pullRequest(target.number)),
      };
    case "run":
      return { you: false, words: planWords.waitsOn(planWords.ciRun) };
    case "time":
      return { you: false, words: planWords.waitsUntil(dayOf(target.at)) };
  }
}

/** A wait's day, in the reader's own zone and language, its hour when it is not midnight. */
function dayOf(at: number): string {
  const when = new Date(at);
  const midnight = when.getHours() === 0 && when.getMinutes() === 0;
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    ...(midnight ? {} : { hour: "2-digit", minute: "2-digit" }),
  }).format(when);
}

/** Where a step stands, read in this order: gone, done, held, under way, not started. */
function stateOf(step: PlanStep, wait: PlanWait | undefined): StepState {
  if (step.gone) {
    return "gone";
  }
  if (step.status === "completed") {
    return "done";
  }
  if (wait) {
    return wait.you ? "you" : "waits";
  }
  return step.status === "in_progress" ? "current" : "future";
}

/** A to-do's row hung under its task's: its count, and the task under way while it is. */
function hang(parent: PlanRow, row: PlanRow): void {
  parent.todos.push(row);
  if (row.state === "done") {
    parent.todosDone += 1;
  }
  // A to-do under way puts its task under way, by whoever holds it.
  if (row.state === "current") {
    if (parent.state === "future") {
      parent.state = "current";
    }
    parent.who ??= row.who;
  }
}

/** The plan's tasks in its order, each with its to-dos and who is on each. */
export function planRows(
  plan: SessionPlan,
  workers: readonly PlanWorker[]
): PlanRow[] {
  const self = workers.find((one) => one.self);
  const holder = (handle: string): PlanWorker | undefined => {
    const { task } = stepRecord(handle);
    const delegates = workers.filter((one) => !one.self);
    return (
      delegates.find((one) => one.on.includes(handle)) ??
      delegates.find((one) =>
        one.on.some((held) => stepRecord(held).task === task)
      ) ??
      self
    );
  };
  const rows: PlanRow[] = [];
  for (const step of plan.steps) {
    const wait = step.waitsOn
      ? waitOf(step.waitsOn, plan.steps, workers)
      : undefined;
    const state = stateOf(step, wait);
    const row: PlanRow = {
      handle: step.id,
      words: step.content,
      state,
      wait,
      who: state === "current" ? holder(step.id) : undefined,
      todos: [],
      todosDone: 0,
    };
    const parent = step.depth > 0 ? rows.at(-1) : undefined;
    if (parent) {
      hang(parent, row);
    } else {
      rows.push(row);
    }
  }
  return rows;
}

/** How far the plan has got: its tasks done, of all, and how many are under way. */
export function planCount(rows: readonly PlanRow[]): {
  done: number;
  total: number;
  moving: number;
} {
  return {
    done: rows.filter((row) => row.state === "done").length,
    total: rows.length,
    moving: rows.filter((row) => row.state === "current").length,
  };
}

/** The to-dos under way under a task: what its row names as moving now. */
export const movingTodos = (row: PlanRow): PlanRow[] =>
  row.todos.filter((todo) => todo.state === "current");

/** The done tasks at the plan's head, before its first task not done. */
export function doneHead(rows: readonly PlanRow[]): number {
  const first = rows.findIndex((row) => row.state !== "done");
  return first < 0 ? rows.length : first;
}
