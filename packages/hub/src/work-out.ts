import type { WaitWitness } from "@cawco/core/task-views";
import {
  headOf,
  itemBlockOf,
  lastWaitOf,
  type WorkItemRow,
  type WorkspaceRow,
} from "./db/project-work";

/** A time the database reads as a date, as the ISO string it is sent as; null stays null. */
const iso = (at: Date | null) => at?.toISOString() ?? null;

/**
 * A work item as the API answers it: its times the ISO strings they are
 * sent as, and what it landed as one `landed` (stored-types.ts
 * `WorkLanding`), as it was answered while that was one JSON column: null
 * when no commit of it was recorded. A landing whose record did not
 * read is `landedUnread` beside it, as it was stored. `outputs` are the
 * outputs it declared (project-work.ts `workItemOutputs`), answered as they
 * were while they were one JSON column: null when none. Its block is one
 * `blocked` (stored-types.ts `ItemBlock`), as it was answered while that
 * was one JSON column: null when it has none that reads; a block that did
 * not read is `blockedUnread` beside it, as it was stored. `waitedOn` is
 * what it was dispatched on (project-work.ts `workItemWaits`), null when
 * none, and `waitHistory` its waits since its last delivered message, the
 * last one's end and reason its live wait's while that lasts, null when it
 * has none that reads; each as answered while it was one JSON column, what
 * did not read beside it (`waitsUnread`, `waitHistoryUnread`).
 */
export const workItemOut = (
  {
    landedSha,
    landedOnto,
    landedAt,
    blockedKind,
    blockedName,
    blockedSince,
    waitCount,
    waitLastUntil,
    waitLastReason,
    ...item
  }: WorkItemRow,
  outputs: string[],
  waits: WaitWitness[]
) => {
  const last = lastWaitOf({ ...item, waitLastUntil, waitLastReason });
  return {
    ...item,
    blocked: itemBlockOf({ blockedKind, blockedName, blockedSince }),
    waitedOn: waits.length > 0 ? waits : null,
    waitHistory:
      waitCount > 0 && last
        ? { count: waitCount, until: last.until.getTime(), reason: last.reason }
        : null,
    outputs: outputs.length > 0 ? outputs : null,
    landed:
      landedSha === null
        ? null
        : {
            sha: landedSha,
            onto: landedOnto,
            ...(landedAt ? { at: landedAt.getTime() } : {}),
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
  };
};

/**
 * A workspace as the API answers it: its times the ISO strings they are
 * sent as, and where it was cut from as one `cutFrom`, as it was answered
 * while that was one JSON column: null for one cut from its repository, or
 * whose source did not read (`cutFromUnread` beside it, as it was stored).
 * Where its clone was as it retired is one `head` (core `WorkspaceCut`), as
 * it was answered while that was one JSON column: null when it has none
 * that reads; a head that did not read is `headUnread` beside it, as it was
 * stored.
 */
export const workspaceOut = ({
  cutFromWorkspace,
  cutFromCommit,
  cutFromLanded,
  headBranch,
  headCommit,
  headCarry,
  ...workspace
}: WorkspaceRow) => ({
  ...workspace,
  head: headOf({ headBranch, headCommit, headCarry }),
  cutFrom:
    cutFromWorkspace !== null &&
    cutFromCommit !== null &&
    cutFromLanded !== null
      ? {
          workspace: cutFromWorkspace,
          commit: cutFromCommit,
          landed: cutFromLanded,
        }
      : null,
  createdAt: workspace.createdAt.toISOString(),
  heldAt: iso(workspace.heldAt),
});
