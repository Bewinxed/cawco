/**
 * The tasks waiting on the person by themselves (core needs-rows.ts):
 * each in a stage of kind `you` (its review) or whose routine failed,
 * newest first. A session's question or an artifact's pick is no task's:
 * the dashboard gathers each under the conversation that holds it.
 */

import type {
  NeedsRow,
  NeedsRowsRead,
  NeedsRowTask,
} from "@cawco/core/needs-rows";
import { ElysiaStatus } from "elysia";
import type { DbShape } from "./db";
import type { Tasks } from "./tasks";

type TaskSummary = Extract<
  Awaited<ReturnType<Tasks["list"]>>,
  { tasks: unknown }
>["tasks"][number];

export interface NeedsRowsDeps {
  readonly db: Pick<DbShape, "listProjects">;
  readonly tasks: Pick<Tasks, "list">;
}

export const createNeedsRows = (deps: NeedsRowsDeps) => ({
  /** The tasks waiting on the person, newest first, and a sentence per project whose tasks could not be read. */
  async read(): Promise<NeedsRowsRead> {
    const read = await Promise.all(
      deps.db.listProjects().map(async (project) => {
        const unread = (why: string) => ({
          missing: [`${project.name}'s tasks could not be read: ${why}`],
          rows: [],
        });
        const list = await deps.tasks
          .list(project.id)
          .catch((error: unknown) =>
            error instanceof Error ? error : new Error(String(error))
          );
        if (list instanceof Error) {
          return unread(list.message);
        }
        if (list instanceof ElysiaStatus) {
          return unread(list.response.detail);
        }
        return {
          missing: [],
          rows: list.tasks.flatMap((task): NeedsRow[] => {
            const waits = waitsOf(task);
            return waits
              ? [
                  {
                    key: `task:${project.id}:${task.id}`,
                    task: rowTask(project.id, task, waits),
                    at: task.updatedAt,
                  },
                ]
              : [];
          }),
        };
      })
    );
    return {
      missing: read.flatMap((one) => one.missing),
      rows: read
        .flatMap((one) => one.rows)
        .sort((a, b) => b.at - a.at || a.key.localeCompare(b.key)),
    };
  },
});

/** A project's task as a row's task. */
const rowTask = (
  projectId: string,
  task: TaskSummary,
  waits: NeedsRowTask["waits"]
): NeedsRowTask => ({
  id: task.id,
  projectId,
  title: task.title,
  stage: task.stage,
  waits,
});

/** Why a task waits on the person by itself: in review (a stage of kind `you`), or its routine failed; null when it does not. */
const waitsOf = (task: {
  kind: string | null;
  needsYou: boolean;
}): NeedsRowTask["waits"] | null => {
  if (!task.needsYou) {
    return null;
  }
  return task.kind === "you" ? "review" : "failed";
};

export type NeedsRows = ReturnType<typeof createNeedsRows>;
