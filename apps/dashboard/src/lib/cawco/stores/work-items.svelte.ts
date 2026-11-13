/**
 * Every work item a parent's delegate tray has been told of: read when the
 * parent's view opens, then kept by `work_item` frames; and a failed one's
 * dismissal and retry.
 */

import { detach } from "@cawco/core/detach";
import type { WorkItemSummary } from "@cawco/core/protocol";
import { workWords } from "@cawco/core/words/work";
import { hub } from "#lib/platform/hub.js";
import { type HubAnswer, hubData, hubRefusal } from "#lib/platform/hub-read.js";
import { heardFrame, heardSince, readLeaves } from "../heard";
import type { FrameOf } from "../hub/frames";
import { load } from "../hub/load";
import { equal } from "./same";

export const workItemsState = $state({
  /**
   * Every work item a parent's delegate tray has been told of, by item id:
   * read when the parent's view opens, then kept by `work_item` frames.
   */
  workItems: {} as Record<string, WorkItemSummary>,
});

/** Views whose delegate tray has been read — frames keep it after that. */
const trayRead = new Set<string>();

/**
 * A reconnect: the work-item frames broadcast while the socket was away are
 * lost, so every tray read so far is read again.
 */
export function rereadTrays(): void {
  const read = [...trayRead];
  trayRead.clear();
  for (const instanceId of read) {
    detach(loadWorkItems(instanceId), "loadWorkItems");
  }
}

/** The work items a view's delegate tray opens with (`GET /api/work-items`). */
export async function loadWorkItems(instanceId: string): Promise<void> {
  if (trayRead.has(instanceId)) {
    return;
  }
  trayRead.add(instanceId);
  const mark = readLeaves();
  const items = await load(
    hubData(hub.api["work-items"].get({ query: { parent: instanceId } }))
  );
  if (!items) {
    trayRead.delete(instanceId);
    return;
  }
  for (const item of items) {
    keepWorkItem(item, mark);
  }
}

/** A work item as a read that left at `mark` answered it, unless a frame for it came since. */
function keepWorkItem(item: WorkItemSummary, mark: number): void {
  if (!heardSince(`work_item:${item.id}`, mark)) {
    workItemsState.workItems[item.id] = item;
  }
}

/**
 * Takes a failed chip off its tray on every screen, with why: the reader's
 * reason, or the later item that replaced it. The hub records both.
 */
export function dismissWorkItem(
  id: string,
  why: { reason: string } | { replacedBy: string }
): Promise<void> {
  return workItemAct(
    hub.api["work-items"]({ id }).dismiss.post(why),
    workWords.notDismissedThen
  );
}

/**
 * Retry: the reader's word to the failed delegate's own session, which
 * reopens the same item there; answered once the session has read it.
 */
export function retryWorkItem(id: string): Promise<void> {
  return workItemAct(
    hub.api["work-items"]({ id }).retry.post(),
    workWords.notRetriedThen
  );
}

async function workItemAct(
  call: Promise<HubAnswer<WorkItemSummary>>,
  outcome: string
): Promise<void> {
  const mark = readLeaves();
  keepWorkItem(
    await hubData(call, (refused) => hubRefusal(refused, outcome)),
    mark
  );
}

export function takeWorkItem(frame: FrameOf<"work_item">): void {
  heardFrame(`work_item:${frame.item.id}`);
  if (!equal(workItemsState.workItems[frame.item.id], frame.item)) {
    workItemsState.workItems[frame.item.id] = frame.item;
  }
}

/** The work items the delegate trays were told of. */
export const workItemsStore = {
  /** The work item a delegate session runs, when its parent's tray was told of it. */
  workItemFor: (instanceId: string): WorkItemSummary | undefined =>
    Object.values(workItemsState.workItems).find(
      (item) => item.instanceId === instanceId
    ),
};
