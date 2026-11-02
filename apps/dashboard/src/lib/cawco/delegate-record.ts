import type { DelegateEvent, DelegateSummary } from "@cawco/core/protocol";
import type { DelegateAskEvent, DelegateReportEvent } from "./types";

/**
 * What a delegate's card draws of its traffic with its parent: the hub's
 * summary as read when the card came on screen, with every event pushed
 * since folded on top.
 */
export interface DelegateRecord {
  /** How many asks it routed to the parent, answered or not. */
  asks: number;
  /** Its asks still waiting on an answer, oldest first. */
  pending: DelegateAskEvent[];
  /** Its newest report, or null before its first. */
  report: DelegateReportEvent | null;
  /** How many turns it reported. */
  reports: number;
}

/**
 * The read summary (none yet: nothing read) and the pushed events, in id
 * order. A pushed event at or below the summary's `through` is already
 * counted in it; one above came after it, so it adds to the counts, files a
 * report as the newest, parks an ask, or settles the ask its answer names.
 */
export function delegateRecord(
  read: DelegateSummary | undefined,
  heard: readonly DelegateEvent[]
): DelegateRecord {
  const through = read?.through ?? 0;
  let report = read?.report ?? null;
  let reports = read?.reports ?? 0;
  let asks = read?.asks ?? 0;
  let pending = read?.pending ?? [];
  for (const event of heard) {
    if (event.id <= through) {
      continue;
    }
    if (event.kind === "report") {
      reports += 1;
      report = event;
    } else if (event.kind === "ask") {
      asks += 1;
      pending = event.status === "pending" ? [...pending, event] : pending;
    } else {
      pending = pending.filter((ask) => ask.requestId !== event.requestId);
    }
  }
  return { report, reports, asks, pending };
}
