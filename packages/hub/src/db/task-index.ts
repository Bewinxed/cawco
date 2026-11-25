/** The project-task index and who waits on what. */

import type { TaskLinkSummary } from "@cawco/core/external-items";
import type { OfferedMode } from "@cawco/core/harness/modes";
import type { RoutineTarget } from "@cawco/core/routine-kinds";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { DbCore } from "./core";
import {
  projects,
  projectTaskEdges,
  projectTaskFields,
  projectTaskLabels,
  projectTaskOutputs,
  projectTasks,
  taskTriggers,
} from "./schema";
import {
  summaryOf as linkSummaryOf,
  syncTaskLinks,
  waitLinks,
} from "./task-links";
import type { Tx } from "./tx";

/**
 * A routine's lines (task-file.ts `TRIGGER_FIELDS`) as the index read them:
 * what `task_triggers` copies, so the scheduler reads no file.
 */
export interface TriggerIndex {
  /** Its check's machines (`check_on:`); null with no check. */
  checkOn: string[] | null;
  /** Its check's command (`check:`), the `command` column; null with no check. */
  command: string | null;
  cron: string | null;
  dailyCapUsd: number | null;
  deadline: Date | null;
  keep: boolean;
  mode: OfferedMode | null;
  /**
   * The schedule's next slot from the read: kept only when the schedule
   * changed (a changed schedule starts from now) or none was kept; null
   * with no schedule, or one that does not parse.
   */
  nextSlot: Date | null;
  /** What of its lines does not read, its cron and zone included; null when all of it does. */
  problem: string | null;
  stop: string | null;
  target: RoutineTarget;
  timeZone: string | null;
}

/** One task file as a project's task index holds it (tasks.ts). */
export type TaskIndexRow = typeof projectTasks.$inferSelect & {
  /** What it waits on (`waits_on`), as its file lists them: a task as `tsk-12`, any other target as wait-targets.ts keeps it. */
  waitsOn: string[];
  labels: string[];
  /** The project folder files its work produces (`outputs:`), as its file lists them: what the project's Made list draws. */
  outputs: string[];
  /** Its file's own scalar fields (`priority`, `due`), as written. */
  fields: Record<string, string>;
  /**
   * The external items its file links (`issue:`, mode `record`, then
   * `links:`), as `task_links` holds them: written, each URL becomes the
   * task's row (task-links.ts `syncTaskLinks`), beside a row for each pull
   * request and Actions run `waitsOn` names; read, each link as its
   * item's mirror holds it, an Actions run's left out (it shows as a wait).
   */
  links: TaskLinkSummary[];
  /**
   * Written only: its routine's lines when its file makes it one, copied to
   * its trigger (a new trigger row when it has none); null when its file
   * makes it none, which leaves its trigger firing nothing; left out, its
   * trigger is not touched.
   */
  trigger?: TriggerIndex | null;
};

export interface TaskIndexDb {
  /** Forgets the index rows of task files that are gone. */
  readonly dropTaskIndex: (projectId: string, paths: string[]) => void;
  /** Files or refreshes rows of a project's task index, each by its file's path, its lists with it. */
  readonly putTaskIndex: (rows: TaskIndexRow[]) => void;
  /** Every row of a project's task index, in id order. */
  readonly taskIndex: (projectId: string) => TaskIndexRow[];
  /** The indexed tasks that wait on `target` (`waits_on:`, a task as `tsk-12`), by number: an indexed lookup. */
  readonly taskWaiters: (
    projectId: string,
    taskId: string
  ) => { id: string; path: string }[];
}

/**
 * A task's routine lines copied to its trigger: a trigger made for a task
 * whose file makes it a routine and that has none (made by you, until a
 * maker says otherwise: task-tools.ts writes who made it right after), its
 * next slot moved only when its schedule changed; a file that no longer
 * makes it one leaves its trigger with no target, which fires nothing and
 * keeps its runs.
 */
const copyTrigger = (
  tx: Tx,
  projectId: string,
  taskId: string,
  trigger: TriggerIndex | null
): void => {
  const ofTask = and(
    eq(taskTriggers.projectId, projectId),
    eq(taskTriggers.taskId, taskId)
  );
  const kept = tx.select().from(taskTriggers).where(ofTask).get();
  if (trigger === null) {
    if (kept?.target) {
      tx.update(taskTriggers).set({ target: null }).where(ofTask).run();
    }
    return;
  }
  const { nextSlot, ...copy } = trigger;
  if (!kept) {
    tx.insert(taskTriggers)
      .values({
        id: crypto.randomUUID(),
        projectId,
        taskId,
        ...copy,
        nextSlot,
        createdBy: "owner",
        createdAt: new Date(),
      })
      .run();
    return;
  }
  const rescheduled =
    kept.cron !== copy.cron ||
    kept.timeZone !== copy.timeZone ||
    (kept.nextSlot === null && nextSlot !== null);
  tx.update(taskTriggers)
    .set({ ...copy, ...(rescheduled ? { nextSlot } : {}) })
    .where(ofTask)
    .run();
};

/** Each written row's routine lines copied to its trigger ({@link copyTrigger}); a row that leaves them out touches none. */
const copyTriggers = (tx: Tx, rows: readonly TaskIndexRow[]): void => {
  for (const row of rows) {
    if (row.trigger !== undefined) {
      copyTrigger(tx, row.projectId, row.id, row.trigger);
    }
  }
};

export const taskIndexDb = (core: DbCore): TaskIndexDb => {
  const { db, taskLinksOf } = core;

  return {
    taskIndex: (projectId) => {
      const ofTask = new Map<
        string,
        Pick<TaskIndexRow, "waitsOn" | "labels" | "outputs" | "fields">
      >();
      const linksOf = Map.groupBy(
        taskLinksOf.ofProject(projectId),
        (row) => row.link.taskId
      );
      const lists = (file: string) => {
        const known = ofTask.get(file);
        if (known) {
          return known;
        }
        const made: Pick<
          TaskIndexRow,
          "waitsOn" | "labels" | "outputs" | "fields"
        > = {
          waitsOn: [],
          labels: [],
          outputs: [],
          fields: {},
        };
        ofTask.set(file, made);
        return made;
      };
      for (const edge of db
        .select()
        .from(projectTaskEdges)
        .where(eq(projectTaskEdges.projectId, projectId))
        .orderBy(sql`rowid`)
        .all()) {
        lists(edge.path).waitsOn.push(edge.otherId);
      }
      for (const labelled of db
        .select()
        .from(projectTaskLabels)
        .where(eq(projectTaskLabels.projectId, projectId))
        .orderBy(sql`rowid`)
        .all()) {
        lists(labelled.path).labels.push(labelled.label);
      }
      for (const output of db
        .select()
        .from(projectTaskOutputs)
        .where(eq(projectTaskOutputs.projectId, projectId))
        .orderBy(sql`rowid`)
        .all()) {
        lists(output.path).outputs.push(output.output);
      }
      for (const field of db
        .select()
        .from(projectTaskFields)
        .where(eq(projectTaskFields.projectId, projectId))
        .orderBy(sql`rowid`)
        .all()) {
        lists(field.path).fields[field.key] = field.value;
      }
      return db
        .select()
        .from(projectTasks)
        .where(eq(projectTasks.projectId, projectId))
        .orderBy(asc(projectTasks.number), asc(projectTasks.path))
        .all()
        .map((row) => ({
          ...row,
          ...lists(row.path),
          links: (linksOf.get(row.id) ?? []).flatMap(
            (linked) => linkSummaryOf(linked) ?? []
          ),
        }));
    },
    taskWaiters: (projectId, taskId) =>
      db
        .select({ id: projectTasks.id, path: projectTasks.path })
        .from(projectTaskEdges)
        .innerJoin(
          projectTasks,
          and(
            eq(projectTasks.projectId, projectTaskEdges.projectId),
            eq(projectTasks.path, projectTaskEdges.path)
          )
        )
        .where(
          and(
            eq(projectTaskEdges.projectId, projectId),
            eq(projectTaskEdges.kind, "waits_on"),
            eq(projectTaskEdges.otherId, taskId)
          )
        )
        .orderBy(asc(projectTasks.number), asc(projectTasks.path))
        .all(),
    putTaskIndex: (rows) => {
      if (rows.length === 0) {
        return;
      }
      db.transaction((tx) => {
        // An index is read from a project's folder off the write path: a
        // project deleted meanwhile has no tasks left to index.
        const live = new Set(
          tx
            .select({ id: projects.id })
            .from(projects)
            .where(
              inArray(projects.id, [...new Set(rows.map((r) => r.projectId))])
            )
            .all()
            .map((project) => project.id)
        );
        const kept = rows.filter((r) => live.has(r.projectId));
        copyTriggers(tx, kept);
        for (const {
          waitsOn,
          labels,
          outputs,
          fields,
          links,
          trigger: _trigger,
          ...row
        } of kept) {
          const { projectId, path: file } = row;
          syncTaskLinks(tx, projectId, row.id, [
            ...links.map((link) => ({
              url: link.url,
              record: link.mode === "record",
            })),
            // A wait on a run is a link row too, so it is read and settles as a pull request's.
            ...waitLinks(waitsOn),
          ]);
          tx.insert(projectTasks)
            .values(row)
            .onConflictDoUpdate({
              target: [projectTasks.projectId, projectTasks.path],
              set: row,
            })
            .run();
          // Its lists as its file has them now, in its file's order.
          const ofIt = (
            table:
              | typeof projectTaskEdges
              | typeof projectTaskLabels
              | typeof projectTaskOutputs
              | typeof projectTaskFields
          ) => and(eq(table.projectId, projectId), eq(table.path, file));
          tx.delete(projectTaskEdges).where(ofIt(projectTaskEdges)).run();
          tx.delete(projectTaskLabels).where(ofIt(projectTaskLabels)).run();
          tx.delete(projectTaskOutputs).where(ofIt(projectTaskOutputs)).run();
          tx.delete(projectTaskFields).where(ofIt(projectTaskFields)).run();
          const edges = [...new Set(waitsOn)].map((otherId) => ({
            kind: "waits_on" as const,
            otherId,
          }));
          if (edges.length > 0) {
            tx.insert(projectTaskEdges)
              .values(edges.map((edge) => ({ projectId, path: file, ...edge })))
              .run();
          }
          const named = [...new Set(labels)];
          if (named.length > 0) {
            tx.insert(projectTaskLabels)
              .values(named.map((label) => ({ projectId, path: file, label })))
              .run();
          }
          const produced = [...new Set(outputs)];
          if (produced.length > 0) {
            tx.insert(projectTaskOutputs)
              .values(
                produced.map((output) => ({ projectId, path: file, output }))
              )
              .run();
          }
          const scalars = Object.entries(fields);
          if (scalars.length > 0) {
            tx.insert(projectTaskFields)
              .values(
                scalars.map(([key, value]) => ({
                  projectId,
                  path: file,
                  key,
                  value,
                }))
              )
              .run();
          }
        }
      });
    },
    dropTaskIndex: (projectId, paths) => {
      if (paths.length === 0) {
        return;
      }
      db.delete(projectTasks)
        .where(
          and(
            eq(projectTasks.projectId, projectId),
            inArray(projectTasks.path, paths)
          )
        )
        .run();
    },
  };
};
