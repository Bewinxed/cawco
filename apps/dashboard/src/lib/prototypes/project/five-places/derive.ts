/**
 * What the five places read off a project's records: the waits across
 * kinds (derived live, never stored: TOM, Need), each place's mark, and the
 * tasks a saved filter keeps.
 */
import { unhandled } from "@cawco/core/unhandled";
import type { ProjectRecords, Stage, Task } from "./records";

export type Filter = "all" | "needs" | "working" | "stuck";
export type View = "board" | "table" | "calendar" | "dependencies";
export type Read = "live" | "loading" | "stale";

const stageOf = (records: ProjectRecords, task: Task): Stage | undefined =>
  records.stages.find((stage) => stage.id === task.stage);

/** A task waits on the person: it stands in their stage, or its attempt asks or failed. */
export const needsYou = (records: ProjectRecords, task: Task): boolean =>
  stageOf(records, task)?.kind === "you" ||
  task.attempt?.state === "needs" ||
  task.attempt?.state === "failed";

const isWorking = (task: Task): boolean =>
  task.attempt?.state === "working" || task.attempt?.state === "queued";

const isStuck = (task: Task): boolean =>
  task.attempt?.state === "failed" || task.attempt?.state === "blocked";

export const keeps = (
  records: ProjectRecords,
  filter: Filter,
  task: Task
): boolean => {
  switch (filter) {
    case "all":
      return true;
    case "needs":
      return needsYou(records, task);
    case "working":
      return isWorking(task);
    case "stuck":
      return isStuck(task);
    default:
      return unhandled("filter", filter);
  }
};

export interface Waits {
  actions: number;
  /** Anything at all: the line is drawn only then. */
  any: boolean;
  asks: number;
  cap: boolean;
  decisions: number;
  tasks: number;
}

export const waitsOf = (records: ProjectRecords): Waits => {
  const tasks = records.tasks.filter((task) => needsYou(records, task)).length;
  const decisions = records.decisions.filter(
    (decision) => decision.group === "waits"
  ).length;
  const actions = records.actions.length;
  const asks = records.asks.length;
  const cap = records.spend.atCap;
  return {
    tasks,
    decisions,
    actions,
    asks,
    cap,
    any: tasks + decisions + actions + asks > 0 || cap,
  };
};

/** The tasks a filter keeps, counted the board's way: every task drawn or not. */
export const filterCounts = (
  records: ProjectRecords
): Record<Filter, number> => {
  const drawn = records.tasks;
  const total = records.stages.reduce((sum, stage) => sum + stage.total, 0);
  return {
    all: total,
    needs: drawn.filter((task) => needsYou(records, task)).length,
    working: drawn.filter(isWorking).length,
    stuck: drawn.filter(isStuck).length,
  };
};
