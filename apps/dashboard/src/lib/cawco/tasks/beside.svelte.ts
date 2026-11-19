/**
 * A task standing beside a conversation (SessionPane's SideSplit, its task
 * surface): on a desk the side card beside the transcript, on a phone and
 * in a desk's pane under 900px the sheet the preview rises in (SideSheet).
 * It stands there two ways: a task or to-do chip pressed in the
 * conversation (ThingReference, through the conversation's own
 * {@link besideHere}), and a task's review opening the session that worked
 * it (`openBeside`), the transcript in its own layout and the decision
 * still in the task's pane. Kept per session in this tab's sessionStorage,
 * so a reload keeps the task beside; the session's address stays the
 * workspace's own (it rewrites a session tab's URL, query and all:
 * workspace.svelte.ts `project`).
 */

import { getContext, setContext, untrack } from "svelte";
import { z } from "zod";
import { BesideSchema } from "#lib/cawco/stored-shapes.js";
import { readJson, writeJson } from "#lib/platform/storage.js";
import { goto } from "$app/navigation";
import { rowHref } from "../links";

export interface Beside {
  projectId: string;
  taskId: string;
  /** The to-do a chip named: the task opens at it (TodoList `linked`). */
  todo?: string;
}

const KEY = "cawco.task-beside";

let held = $state<Record<string, Beside>>(
  readJson(KEY, z.record(z.string(), BesideSchema), {}, "session")
);
/** How many times a task was stood beside each session: the side brings Task to the front at each. */
let asks = $state<Record<string, number>>({});

const keep = () => writeJson(KEY, held, "session");

/** The task beside session `instanceId`, when one stands there. */
export const besideOf = (instanceId: string): Beside | null =>
  held[instanceId] ?? null;

/** Counts each task stood beside session `instanceId`, so the side shows Task for each, a preview open or not. */
export const besideAsked = (instanceId: string): number =>
  asks[instanceId] ?? 0;

/** Stands task `taskId` beside session `instanceId`, in place of any that stood there, and brings it to the front. */
export function standBeside(instanceId: string, beside: Beside): void {
  // A write, never a read: an effect that stands a task beside does not run again for it.
  untrack(() => {
    held = { ...held, [instanceId]: beside };
    asks = { ...asks, [instanceId]: besideAsked(instanceId) + 1 };
    keep();
  });
}

/** Puts the task beside session `instanceId` away. */
export function putAway(instanceId: string): void {
  untrack(() => {
    const { [instanceId]: _, ...rest } = held;
    held = rest;
    keep();
  });
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

const HERE = Symbol("task-beside");

/**
 * The components under this one stand in a conversation that can hold a
 * task beside it: `at` answers its session, or null where nothing stands
 * beside it (a conversation docked in a project's panel).
 */
export function provideBeside(at: () => string | null): void {
  setContext(HERE, at);
}

/** The session a task chip here stands its task beside; none outside a conversation (a project's page, Home, an artifact's own tab). */
export const besideHere = (): (() => string | null) | undefined =>
  getContext<(() => string | null) | undefined>(HERE);
