/**
 * What narrows a project's tasks, kept in the URL so a link opens the same:
 * `?q=` words in the id or title, `label=`, `type=`, `field.<key>=` a
 * field's value (any number of them), the hub's own list query names
 * (tasks.ts `/api/projects/:id/tasks`). It is applied to the rows the hub
 * listed, which carry each of these, so every view narrows at once: the
 * board, the table, the pipeline, the canvas and the calendar, and the
 * board's Archived rail.
 */
import type { TaskSummary } from "#lib/cawco/project-tasks.js";

export interface TaskFilter {
  /** Field key and value pairs, every one of which must match. */
  fields: [string, string][];
  label: string | null;
  q: string;
  type: string | null;
}

export const NO_FILTER: TaskFilter = {
  q: "",
  label: null,
  type: null,
  fields: [],
};

/** The hub's name for a field filter (tasks.ts `FIELD_PARAM`). */
const FIELD = "field.";

/** What a filter reads off the URL (SvelteKit's read-only params fit). */
type Params = Pick<URLSearchParams, "get" | "entries">;

export function filterOf(params: Params): TaskFilter {
  return {
    q: params.get("q") ?? "",
    label: params.get("label"),
    type: params.get("type"),
    fields: [...params.entries()]
      .filter(([key]) => key.startsWith(FIELD) && key.length > FIELD.length)
      .map(([key, value]) => [key.slice(FIELD.length), value]),
  };
}

/** Writes the filter into `query`, each part only while it is set. */
export function writeFilter(query: URLSearchParams, filter: TaskFilter): void {
  if (filter.q.trim()) {
    query.set("q", filter.q.trim());
  }
  if (filter.label) {
    query.set("label", filter.label);
  }
  if (filter.type) {
    query.set("type", filter.type);
  }
  for (const [key, value] of filter.fields) {
    if (key && value) {
      query.set(`${FIELD}${key}`, value);
    }
  }
}

/** How many narrowings stand, for the Filter button's count. */
export const activeCount = (filter: TaskFilter): number =>
  (filter.q.trim() ? 1 : 0) +
  (filter.label ? 1 : 0) +
  (filter.type ? 1 : 0) +
  filter.fields.filter(([key, value]) => key && value).length;

/** Whether the filter keeps `task`. */
function keeps(task: TaskSummary, filter: TaskFilter): boolean {
  const words = filter.q.trim().toLowerCase();
  return (
    (!words || `${task.id} ${task.title}`.toLowerCase().includes(words)) &&
    (!filter.label || task.labels.includes(filter.label)) &&
    (!filter.type || task.type === filter.type) &&
    filter.fields.every(
      ([key, value]) => !(key && value) || task.fields[key] === value
    )
  );
}

/** The tasks the filter keeps, live or archived alike. */
export const applyFilter = (
  tasks: TaskSummary[],
  filter: TaskFilter
): TaskSummary[] =>
  activeCount(filter) === 0
    ? tasks
    : tasks.filter((task) => keeps(task, filter));
