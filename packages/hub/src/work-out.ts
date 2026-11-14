import type { WorkItemRow, WorkspaceRow } from "./db/project-work";

/** A time the database reads as a date, as the ISO string it is sent as; null stays null. */
const iso = (at: Date | null) => at?.toISOString() ?? null;

/**
 * A work item as the API answers it: its times the ISO strings they are
 * sent as, and what it landed as one `landed` (stored-types.ts
 * `WorkLanding`), as it was answered while that was one JSON column: null
 * when no commit of it was recorded. `passed` is its landing gate's
 * commands (project-work.ts `landedChecks`). A landing whose record did not
 * read is `landedUnread` beside it, as it was stored.
 */
export const workItemOut = (
  { landedSha, landedOnto, landedAt, landedGateTree, ...item }: WorkItemRow,
  passed: string[]
) => ({
  ...item,
  landed:
    landedSha === null
      ? null
      : {
          sha: landedSha,
          onto: landedOnto,
          ...(landedAt ? { at: landedAt.getTime() } : {}),
          ...(landedGateTree ? { gate: { passed, tree: landedGateTree } } : {}),
        },
  createdAt: item.createdAt.toISOString(),
  dismissedAt: iso(item.dismissedAt),
  endedAt: iso(item.endedAt),
  groupReportedAt: iso(item.groupReportedAt),
  heldAsleepAt: iso(item.heldAsleepAt),
  heldAt: iso(item.heldAt),
  landingSince: iso(item.landingSince),
  lastTurnAt: iso(item.lastTurnAt),
  stoppingAt: iso(item.stoppingAt),
  unmetAt: iso(item.unmetAt),
  waitResumeBy: iso(item.waitResumeBy),
  waitUntil: iso(item.waitUntil),
});

/** A workspace as the API answers it: its times the ISO strings they are sent as. */
export const workspaceOut = (workspace: WorkspaceRow) => ({
  ...workspace,
  createdAt: workspace.createdAt.toISOString(),
  heldAt: iso(workspace.heldAt),
});
