/**
 * What CawCo's view components read beside their props: how a task opens and
 * where it links. Their data is their props alone, the view tools' answers
 * (a view reads the project only through its Query() tools); the frame
 * around the view (ViewOpenUI) sets this, so a card in a drawn view opens
 * the same sheet as the board's.
 */
import { getContext, setContext } from "svelte";
import {
  type StageKind,
  stageLabel,
  type TaskSummary,
} from "#lib/cawco/project-tasks.js";
import { dateTimeText } from "#lib/cawco/usage.js";

/** One row of the `tasks` view tool: the board's task, its file's own fields and its dates (hub views.ts `ViewTaskRow`). */
export type ViewTaskRow = TaskSummary & {
  dates: Record<string, number>;
  fields: Record<string, string>;
};

/** One row of the `stages` view tool's `stages`. */
export interface ViewStageRow {
  count: number;
  kind: StageKind;
  name: string;
}

export interface ViewContext {
  hrefOf: (id: string) => string;
  onopen: (id: string) => void;
}

const KEY = Symbol("cawco-view");

export const setViewContext = (context: ViewContext): ViewContext =>
  setContext(KEY, context);

export const viewContext = (): ViewContext => getContext<ViewContext>(KEY);

/** A value's rows, when it is a list of them; none when a Query has not answered yet. */
export const rowsOf = <T>(value: unknown): T[] =>
  Array.isArray(value) ? (value as T[]) : [];

/** The kind of each task's stage among `rows`, by id: what a card reads to say whether what it waits on has landed. */
export const kindsOf = (
  rows: ViewTaskRow[]
): ((id: string) => StageKind | null | undefined) => {
  const kinds = new Map(rows.map((row) => [row.id, row.kind]));
  return (id) => kinds.get(id);
};

/**
 * A value at a path inside a task ("dates.updatedAt", "fields.post_at",
 * "stage", "labels"), as words: a date in the app's own form ("17 Oct
 * 08:49") whether the view names it under `dates.` or as the file's field
 * that carries it, and a stage by its name.
 */
export function fieldText(task: ViewTaskRow, path: string): string {
  const [head, name] = path.split(".", 2);
  if (path === "stage") {
    return stageLabel(task.stage);
  }
  if ((head === "dates" || head === "fields") && name !== undefined) {
    const at = task.dates[name];
    if (at !== undefined) {
      return dateTimeText(at);
    }
  }
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
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}
