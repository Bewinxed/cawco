/**
 * Whether a task waits on you now, one answer for every place that says it
 * (the board's Needs you filter, a card's foot, the task's own TaskNeeds):
 * - the hub says so (`needsYou`: its stage is of kind `you`, or its last
 *   attempt failed);
 * - a session of one of its attempts asks you something (a permission or a
 *   question its parent does not answer): live, from the fleet's asks;
 * - an approved action filed for it waits on your decision, or failed.
 *
 * The project a card stands in is the page's (`setTaskProject`): an
 * action names its task within its project.
 */
import { getContext, setContext } from "svelte";
import { cawco } from "../client.svelte";
import type { TaskSummary, TaskView } from "../project-tasks";

type Attempted = Pick<TaskSummary | TaskView, "attempts">;

/** The asks its attempts' sessions stand on. */
export const asksOf = (task: Attempted) => {
  const sessions = new Set(task.attempts.map((attempt) => attempt.instanceId));
  return cawco.blocked.filter((blocked) => sessions.has(blocked.instanceId));
};

/** The approved actions filed for it that wait on you. */
export const actionsOf = (projectId: string, taskId: string) =>
  cawco.actions.filter(
    (action) => action.projectId === projectId && action.taskId === taskId
  );

/** It waits on you now, for any reason. */
export const waitsOnYou = (
  projectId: string,
  task: Attempted & Pick<TaskSummary, "id" | "needsYou">
): boolean =>
  task.needsYou ||
  asksOf(task).length > 0 ||
  actionsOf(projectId, task.id).length > 0;

const KEY = Symbol("task-project");

/** The project the cards drawn under here stand in. */
export function setTaskProject(projectId: () => string): void {
  setContext(KEY, projectId);
}

/** Read as a component starts; call what it answers to read the project. */
export function taskProject(): (() => string) | undefined {
  return getContext<(() => string) | undefined>(KEY);
}
