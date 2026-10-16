/**
 * A task standing beside the session that worked it (SessionPane's
 * SideSplit, its task surface): a task's review opens its session this way,
 * the transcript in its own layout and the decision still in the task's
 * pane. Kept per session in this tab's sessionStorage, so a reload keeps the
 * task beside; the session's address stays the workspace's own (it rewrites
 * a session tab's URL, query and all: workspace.svelte.ts `project`).
 */
import { goto } from "$app/navigation";
import { rowHref } from "../links";
import { readJson, writeJson } from "../storage";

export interface Beside {
  projectId: string;
  taskId: string;
}

const KEY = "cawco.task-beside";

let held = $state<Record<string, Beside>>(
  readJson<Record<string, Beside>>(KEY, {}, "session")
);

const keep = () => writeJson(KEY, held, "session");

/** The task beside session `instanceId`, when one stands there. */
export const besideOf = (instanceId: string): Beside | null =>
  held[instanceId] ?? null;

/** Stands task `taskId` beside session `instanceId`. */
export function standBeside(instanceId: string, beside: Beside): void {
  held = { ...held, [instanceId]: beside };
  keep();
}

/** Puts the task beside session `instanceId` away. */
export function putAway(instanceId: string): void {
  const { [instanceId]: _, ...rest } = held;
  held = rest;
  keep();
}

/** Opens session `instanceId` with task `taskId` beside it. */
export function openBeside(
  instanceId: string,
  projectId: string,
  taskId: string
): Promise<void> {
  standBeside(instanceId, { projectId, taskId });
  return goto(rowHref(instanceId));
}
