/**
 * What the views thread (views/worker.ts) hears moved: the keys of each
 * kind of row it keeps, as the hub's change log names them (db/board-log.ts),
 * taken on the turn after the write that moved them and sent on in one
 * message. The thread reads again by key only what a change names.
 */
import type { BoardChangeKind } from "../db/board-log";

/** Each kind of row the views keep, by the keys that moved. */
export interface ViewChanges {
  /** Artifacts, and the changes made to them, by artifact id. */
  artifacts?: string[];
  /** Machines' facts (their names), by id. */
  machines?: string[];
  /** Projects (their names, their places), by id. */
  projects?: string[];
  /** Machines whose purged sessions moved, by id. */
  purged?: string[];
  /** Routines and their runs, by routine id. */
  routines?: string[];
  /** Sessions: their row, their conversations, their step under way, by id. */
  sessions?: string[];
  /** Projects whose tasks or task labels moved, by project id. */
  tasks?: string[];
  /** Work items and their texts, by id. */
  workItems?: string[];
  /** Workspaces whose branch moved, by id. */
  workspaces?: string[];
}

export type ViewKind = keyof ViewChanges;

/** Every kind the views keep, in the order a message's are read again. */
export const VIEW_KINDS: readonly ViewKind[] = [
  "projects",
  "machines",
  "purged",
  "sessions",
  "workItems",
  "workspaces",
  "artifacts",
  "tasks",
  "routines",
];

/** The views kind each logged change is heard as; none for a change only the board reads. */
export const VIEW_OF: Record<BoardChangeKind, ViewKind | null> = {
  session: "sessions",
  machine: "machines",
  delegates: null,
  stall: null,
  machine_status: null,
  inventory: null,
  former: null,
  continuation: null,
  view_session: "sessions",
  view_work_item: "workItems",
  view_workspace: "workspaces",
  view_artifact: "artifacts",
  view_tasks: "tasks",
  view_routine: "routines",
  view_project: "projects",
  view_purged: "purged",
};

/** Changes gathered between two sends, each kind's keys once. */
export const createViewChanges = () => {
  const owed = new Map<ViewKind, Set<string>>();
  return {
    add(kind: ViewKind, id: string): void {
      let ids = owed.get(kind);
      if (!ids) {
        ids = new Set();
        owed.set(kind, ids);
      }
      ids.add(id);
    },
    /** What was gathered, taken; undefined when nothing was. */
    take(): ViewChanges | undefined {
      if (owed.size === 0) {
        return undefined;
      }
      const taken: ViewChanges = {};
      for (const [kind, ids] of owed) {
        taken[kind] = [...ids];
      }
      owed.clear();
      return taken;
    },
  };
};
