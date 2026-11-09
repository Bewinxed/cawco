import type { WorkItemRow, WorkspaceRow } from "./db/project-work";

/** A time the database reads as a date, as the ISO string it is sent as; null stays null. */
const iso = (at: Date | null) => at?.toISOString() ?? null;

/** A work item as the API answers it: its times the ISO strings they are sent as. */
export const workItemOut = (item: WorkItemRow) => ({
  ...item,
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

/**
 * A workspace as the API answers it: when it was made, the ISO string it is
 * sent as. `heldAt`, which may be null, stays typed as a date: the shipped
 * app's openapi.json declares it an optional date-time, and a nullable
 * string is what the wire check refuses against it.
 */
export const workspaceOut = (workspace: WorkspaceRow) => ({
  ...workspace,
  createdAt: workspace.createdAt.toISOString(),
});
