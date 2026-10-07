/**
 * What CawCo's A2UI components read beside their own props: the project's
 * tasks and stages as the board has them, and how a task opens. Set by
 * ViewA2ui around its surface, so a component drawn by svelte-a2ui reaches
 * the same tasks, cards and sheet as the board.
 */
import type { ViewData } from "@cawco/core";
import { getContext, setContext } from "svelte";
import type {
  Stage,
  StageKind,
  TaskSummary,
} from "#lib/cawco/project-tasks.js";

export interface ViewContext {
  readonly data: ViewData;
  hrefOf: (id: string) => string;
  kindOf: (id: string) => StageKind | null | undefined;
  onopen: (id: string) => void;
  readonly stages: Stage[];
  readonly tasks: TaskSummary[];
}

const KEY = Symbol("cawco-view");

export const setViewContext = (context: ViewContext): ViewContext =>
  setContext(KEY, context);

export const viewContext = (): ViewContext => getContext<ViewContext>(KEY);

/** The task a view names, as the board has it; null when the board has none. */
export const taskOf = (
  context: ViewContext,
  id: unknown
): TaskSummary | null =>
  typeof id === "string"
    ? (context.tasks.find((task) => task.id === id) ?? null)
    : null;

/** A value at a path inside a task ("dates.updatedAt", "labels"), as words. */
export function fieldText(task: Record<string, unknown>, path: string): string {
  let value: unknown = task;
  for (const part of path.split(".")) {
    value =
      value && typeof value === "object"
        ? (value as Record<string, unknown>)[part]
        : undefined;
  }
  if (value === undefined || value === null) {
    return "";
  }
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  if (typeof value === "number" && path.startsWith("dates.")) {
    return new Date(value).toLocaleString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}
