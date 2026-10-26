/**
 * A task's edges, its front matter's links to other tasks (hub task-file.ts
 * reads them, tasks.ts carries out what each makes the hub do): `waits_on`,
 * what it waits on, any kind wait-targets.ts reads; `part_of`, the task it
 * is a part of, whose waits it inherits; `found_in`, the task or pin it was
 * found in, written by the hub; `duplicate_of`, the task it repeats, which
 * closes it. A leaf: the dashboard's task graph reads it too.
 */
export const TASK_EDGES = [
  "waits_on",
  "part_of",
  "found_in",
  "duplicate_of",
] as const;
export type TaskEdge = (typeof TASK_EDGES)[number];
