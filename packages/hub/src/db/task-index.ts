/** The project-task index and who waits on what. */

import type { TaskLinkSummary } from "@cawco/core/external-items";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { DbCore } from "./core";
import {
  projects,
  projectTaskEdges,
  projectTaskFields,
  projectTaskLabels,
  projectTasks,
} from "./schema";
import { summaryOf as linkSummaryOf, syncTaskLinks } from "./task-links";

/** One task file as a project's task index holds it (tasks.ts). */
export type TaskIndexRow = typeof projectTasks.$inferSelect & {
  /** What it waits on (`waits_on`), as its file lists them: a task as `tsk-12`, any other target as wait-targets.ts keeps it. */
  waitsOn: string[];
  labels: string[];
  /** Its file's own scalar fields (`priority`, `due`), as written. */
  fields: Record<string, string>;
  /**
   * The external items its file links (`issue:`, mode `record`, then
   * `links:`), as `task_links` holds them: written, each URL becomes the
   * task's row (task-links.ts `syncTaskLinks`); read, each row as the source
   * last said it.
   */
  links: TaskLinkSummary[];
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

export const taskIndexDb = (core: DbCore): TaskIndexDb => {
  const { db, taskLinksOf } = core;

  return {
    taskIndex: (projectId) => {
      const ofTask = new Map<
        string,
        Pick<TaskIndexRow, "waitsOn" | "labels" | "fields">
      >();
      const linksOf = Map.groupBy(
        taskLinksOf.ofProject(projectId),
        (row) => row.taskId
      );
      const lists = (file: string) => {
        const known = ofTask.get(file);
        if (known) {
          return known;
        }
        const made: Pick<TaskIndexRow, "waitsOn" | "labels" | "fields"> = {
          waitsOn: [],
          labels: [],
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
          links: (linksOf.get(row.id) ?? []).map(linkSummaryOf),
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
        for (const { waitsOn, labels, fields, links, ...row } of rows.filter(
          (r) => live.has(r.projectId)
        )) {
          const { projectId, path: file } = row;
          syncTaskLinks(
            tx,
            projectId,
            row.id,
            links.map((link) => ({
              url: link.url,
              record: link.mode === "record",
            }))
          );
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
              | typeof projectTaskFields
          ) => and(eq(table.projectId, projectId), eq(table.path, file));
          tx.delete(projectTaskEdges).where(ofIt(projectTaskEdges)).run();
          tx.delete(projectTaskLabels).where(ofIt(projectTaskLabels)).run();
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
