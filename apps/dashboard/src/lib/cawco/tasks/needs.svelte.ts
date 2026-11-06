/**
 * Whether a task waits on you now, one answer for every place that says it
 * (the board's Needs you filter, a card's foot, the task's own TaskNeeds):
 * - the hub says so (`needsYou`, core task-views.ts `needsYouOf`: its
 *   stage is of kind `you`, or it waits on a decision card not picked yet);
 * - a session of one of its attempts asks you something (a permission or a
 *   question its parent does not answer): live, from the fleet's asks;
 * - a session of one of its attempts has a card or canvas in Needs you;
 * - an approved action filed for it waits on your decision, or failed;
 * and never while its stage is done or dropped (core `needsYouOf`), whatever
 * it still waits on.
 *
 * The project a card stands in is the page's (`setTaskProject`): an
 * action names its task within its project.
 */
import { needsYouOf, picksOf } from "@cawco/core/task-views";
import { getContext, setContext } from "svelte";
import { cawco } from "../client.svelte";
import type { TaskSummary, TaskView } from "../project-tasks";

type Attempted = Pick<TaskSummary | TaskView, "attempts">;

/** A card wait's page, by its artifact: `cawco:decision/<artifact>/<card>`. */
export const CARD_PAGE = /^cawco:decision\/([^/#?]+)/u;

/** When the artifact (a decision page) became pending on the person, as Needs you holds it; null when it is not. */
export const pendingSince = (artifactId: string): number | null =>
  cawco.artifactNeedsOpen.find((need) => need.artifactId === artifactId)
    ?.raisedAt ?? null;

/** The asks its attempts' sessions stand on. */
export const asksOf = (task: Attempted) => {
  const sessions = new Set(task.attempts.map((attempt) => attempt.instanceId));
  return cawco.blocked.filter((blocked) => sessions.has(blocked.instanceId));
};

/** The cards and canvases its attempts' sessions have in Needs you. */
const cardsOf = (task: Attempted) => {
  const sessions = new Set(task.attempts.map((attempt) => attempt.instanceId));
  return cawco.artifactNeedsOpen.filter((need) =>
    sessions.has(need.instanceId)
  );
};

/** The approved actions filed for it that wait on you. */
export const actionsOf = (projectId: string, taskId: string) =>
  cawco.actions.filter(
    (action) => action.projectId === projectId && action.taskId === taskId
  );

/** It waits on you now, for any reason. */
export const waitsOnYou = (
  projectId: string,
  task: Attempted & Pick<TaskSummary, "id" | "kind" | "waits">
): boolean =>
  needsYouOf(
    task.kind,
    task.waits,
    asksOf(task).length > 0 ||
      cardsOf(task).length > 0 ||
      actionsOf(projectId, task.id).length > 0
  );

/**
 * Since when a task has waited on you, ms epoch: the oldest of its reasons'
 * times (an attempt's ask raised; a card or canvas of an attempt's session
 * gone pending; an approved action filed; a card it waits on whose page
 * went pending; a stage of kind `you`, since its newest attempt handed in),
 * else its last change. Needs you walks the waits oldest first by it.
 */
export function waitingSince(
  projectId: string,
  task: Attempted &
    Pick<TaskSummary, "id" | "kind" | "needsYou" | "updatedAt" | "waits">
): number {
  const times = [
    ...asksOf(task).map((one) => one.request.raisedAt),
    ...cardsOf(task).map((need) => need.raisedAt),
    ...actionsOf(projectId, task.id).map((action) => action.createdAt),
    ...picksOf(task.kind, task.waits).map((wait) => {
      const page = CARD_PAGE.exec(wait.href)?.[1];
      return page ? pendingSince(page) : null;
    }),
    task.kind === "you"
      ? (task.attempts[0]?.result?.at ?? task.attempts[0]?.endedAt)
      : null,
  ].filter((at): at is number => typeof at === "number");
  return times.length > 0 ? Math.min(...times) : task.updatedAt;
}

const KEY = Symbol("task-project");

/** The project the cards drawn under here stand in. */
export function setTaskProject(projectId: () => string): void {
  setContext(KEY, projectId);
}

/** Read as a component starts; call what it answers to read the project. */
export function taskProject(): (() => string) | undefined {
  return getContext<(() => string) | undefined>(KEY);
}
