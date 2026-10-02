/**
 * What may be archived (taken off Finished without opening it): a session
 * or a workflow run that has stopped doing anything, with nothing under it
 * still doing something. One rule for every door: the dashboard offers no
 * archive where it fails, and the hub refuses `POST /api/seen` archives of
 * it. Each side supplies what it knows: what a session or run is doing now,
 * and what hangs under it (a session's delegates and the runs it started, a
 * run's step sessions and child runs).
 */
import type { WorkflowRunStatus } from "./workflow";

/** What a session or run is doing now: a turn, an ask waiting on the owner, or nothing. */
export type Doing = "working" | "blocked" | "idle";

/**
 * A run's status as what it is doing: a run that has not ended is working,
 * between steps too, and one parked on a question waits on the owner.
 */
export const runDoing = (status: WorkflowRunStatus): Doing => {
  if (status === "waiting") {
    return "blocked";
  }
  return status === "running" ? "working" : "idle";
};

export interface ArchiveView {
  /** Sessions and runs directly under `id`. */
  childrenOf: (id: string) => readonly string[];
  /** What `id` is doing now. */
  doing: (id: string) => Doing;
}

/**
 * Why `id` cannot be archived, or `null` when it can: it, or something
 * anywhere under it, is still doing something.
 */
export function archiveRefusal(id: string, view: ArchiveView): string | null {
  const seen = new Set<string>();
  const walk = (at: string): string | null => {
    if (seen.has(at)) {
      return null;
    }
    seen.add(at);
    const doing = view.doing(at);
    if (doing !== "idle") {
      const what =
        doing === "blocked" ? "is waiting on you" : "is still working";
      return at === id ? `It ${what}.` : `Something under it ${what} (${at}).`;
    }
    for (const child of view.childrenOf(at)) {
      const why = walk(child);
      if (why) {
        return why;
      }
    }
    return null;
  };
  return walk(id);
}
