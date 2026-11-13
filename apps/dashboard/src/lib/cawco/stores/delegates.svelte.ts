/**
 * A session's children: what its tray lists (its delegates' work items and
 * the sessions it started), and what each delegate asked its parent and was
 * answered, read as its card comes on screen and kept by the hub's pushes.
 */

import { detach } from "@cawco/core/detach";
import {
  DELEGATE_SUMMARIES_LIMIT,
  type DelegateEvent,
  type DelegateSummary,
  type InstanceRow,
  type WorkItemSummary,
} from "@cawco/core/protocol";
import { hub } from "#lib/platform/hub.js";
import { hubData } from "#lib/platform/hub-read.js";
import { type DelegateRecord, delegateRecord } from "../delegate-record";
import { resolveSessionTitle } from "../links";
import { activityFor } from "./asks.svelte";
import { boardStore, rowById } from "./board.svelte";
import { workItemsState } from "./work-items.svelte";

/**
 * One child a session's tray lists (DelegateTray): a delegate, by its work
 * item, or a session it started with `start_session`, which runs none. The
 * chip and its panel read only this; the acts on a failure (retry, replaced
 * by, dismiss) are a work item's, and only a chip with `work` offers them.
 */
export interface TrayChild {
  /** The work item's landing wait (WorkItemSummary `checkQueue`); null on a started session. */
  checkQueue: WorkItemSummary["checkQueue"];
  createdAt: number;
  dismissedAt: number | null;
  endedAt: number | null;
  /** Why it failed, first lines; "" when it has not, or said nothing. */
  error: string;
  /** Its chip's key: the work item's id, or the started session's own. */
  id: string;
  instanceId: string;
  /** Its machine's pause, while it holds the work item's session; null on a started session. */
  machinePaused: string | null;
  /** What the work item waits for to start; null on a started session. */
  queued: WorkItemSummary["queued"];
  /** Its account's limit stopping the work item's session, in words; null on a started session. */
  stalled: string | null;
  state: WorkItemSummary["state"];
  title: string;
  /** The delegate's work item; null on a started session. */
  work: WorkItemSummary | null;
}

/**
 * A session another one started with `start_session` (or a continuation
 * of one): it names its starter and runs no work item, the one thing that
 * tells it from a delegate (core `InstanceRow.workItemId`).
 */
const isStarted = (
  row: InstanceRow
): row is InstanceRow & { parentInstanceId: string } =>
  !!row.parentInstanceId && !row.workItemId;

/** The sessions each session started that run no work item, by their starter. */
const startedBy = $derived.by(() => {
  const by = new Map<string, InstanceRow[]>();
  for (const row of boardStore.instances) {
    if (isStarted(row)) {
      const parent = row.parentInstanceId;
      by.set(parent, [...(by.get(parent) ?? []), row]);
    }
  }
  return by;
});

const epochMs = (at: string | number | Date | null | undefined): number =>
  at === null || at === undefined ? 0 : new Date(at).getTime() || 0;

const itemChild = (item: WorkItemSummary): TrayChild => ({
  id: item.id,
  instanceId: item.instanceId,
  title: item.title,
  state: item.state,
  createdAt: item.createdAt,
  endedAt: item.endedAt,
  dismissedAt: item.dismissedAt,
  error: item.firstLines.error,
  queued: item.queued,
  checkQueue: item.checkQueue,
  machinePaused: item.machinePaused,
  stalled: item.stalled,
  work: item,
});

/**
 * A started session as its tray says it: what its turn is doing. It is
 * persistent, so its "done" is a turn that ended (and a later turn takes
 * the chip back, DelegateTray `admitWaiting`); stopped is "cancelled", and
 * a session that errored "failed", with no work item to retry or dismiss.
 */
const sessionChild = (row: InstanceRow): TrayChild => {
  const state = ((): TrayChild["state"] => {
    switch (row.status) {
      case "starting":
        return "starting";
      case "error":
        return "failed";
      case "stopping":
      case "stopped":
      case "discarded":
        return "cancelled";
      case "moving":
      case "running":
      case "sleeping":
      case "unknown":
        break;
    }
    return activityFor(row.id) === "idle" ? "done" : "running";
  })();
  return {
    id: row.id,
    instanceId: row.id,
    title: resolveSessionTitle({
      title: row.title ?? row.derivedTitle,
      cwd: row.cwd,
      id: row.id,
    }),
    state,
    createdAt: epochMs(row.createdAt),
    // A turn ends at its own time; a stop or a failure when the row last moved.
    endedAt:
      state === "starting" || state === "running"
        ? null
        : (state === "done" && epochMs(row.turnEndedAt)) ||
          epochMs(row.updatedAt),
    dismissedAt: null,
    error: state === "failed" ? (row.lastError ?? "") : "",
    queued: null,
    checkQueue: null,
    machinePaused: null,
    stalled: null,
    work: null,
  };
};

const delegatesState = $state<{
  /**
   * What the hub summed up of each delegate whose card came on screen, keyed
   * by the delegate ({@link readDelegate}). Kept apart from the session it
   * belongs to because the reader of this traffic is the *parent*: a
   * delegate card renders its child's exchange, not its own.
   */
  delegateRead: Record<string, DelegateSummary>;

  /**
   * The delegate events pushed while this page stood, keyed by the delegate
   * they are about, in id order; those a later read already counts are
   * dropped as it lands.
   */
  delegateHeard: Record<string, DelegateEvent[]>;
}>({
  delegateRead: {},
  delegateHeard: {},
});

/**
 * The delegates whose summaries this connection read or is reading, by the
 * parent whose transcript draws their cards: each is read once per
 * connection, and pushes keep it after that.
 */
const delegatesRead = new Map<string, Set<string>>();

/** The delegates asked for since the last batch left, by parent. */
const delegatesAsked = new Map<string, Set<string>>();

/**
 * A delegate card came on screen: its summary is read with every other card
 * that came on screen in the same task, a batch per parent of at most
 * {@link DELEGATE_SUMMARIES_LIMIT}. The cold load reads what the screen
 * draws, never every delegate the parent ever ran.
 */
export function readDelegate(parent: string, instanceId: string): void {
  const read = delegatesRead.get(parent) ?? new Set<string>();
  if (read.has(instanceId)) {
    return;
  }
  delegatesRead.set(parent, read.add(instanceId));
  const asked = delegatesAsked.get(parent) ?? new Set<string>();
  if (delegatesAsked.size === 0) {
    queueMicrotask(sendDelegateReads);
  }
  delegatesAsked.set(parent, asked.add(instanceId));
}

/**
 * A reconnect: the delegate events broadcast while the socket was away are
 * lost, so every summary read so far is read again.
 */
export function rereadDelegates(): void {
  const read = [...delegatesRead];
  delegatesRead.clear();
  for (const [parent, delegates] of read) {
    for (const instanceId of delegates) {
      readDelegate(parent, instanceId);
    }
  }
}

function sendDelegateReads(): void {
  const asked = [...delegatesAsked];
  delegatesAsked.clear();
  for (const [parent, delegates] of asked) {
    const all = [...delegates];
    for (let at = 0; at < all.length; at += DELEGATE_SUMMARIES_LIMIT) {
      detach(
        loadDelegates(parent, all.slice(at, at + DELEGATE_SUMMARIES_LIMIT)),
        "loadDelegates"
      );
    }
  }
}

/**
 * What these delegates asked their parent, what it answered and what they
 * reported, before their cards came on screen (`POST /api/delegate-summaries`).
 * Broadcast as it happens *and* readable here, for the same reason the
 * hand-offs are: an exchange that settled an hour ago is still the record,
 * and a settled ask is never pushed again. A read that fails leaves the
 * cards on the transcript markers, and the next time they come on screen
 * tries again.
 */
async function loadDelegates(
  parent: string,
  delegates: string[]
): Promise<void> {
  let summaries: DelegateSummary[];
  try {
    summaries = await hubData(
      hub.api["delegate-summaries"].post({ parent, instances: delegates }),
      ({ response }) => new Error(`${response.status} ${response.statusText}`)
    );
  } catch (error) {
    console.error("[cawco] /api/delegate-summaries failed:", error);
    const read = delegatesRead.get(parent);
    for (const instanceId of delegates) {
      read?.delete(instanceId);
    }
    return;
  }
  for (const summary of summaries) {
    // A reconnect's read can land before the one it replaced: the newer stays.
    if (
      (delegatesState.delegateRead[summary.instanceId]?.through ?? 0) >
      summary.through
    ) {
      continue;
    }
    delegatesState.delegateRead[summary.instanceId] = summary;
    const heard = delegatesState.delegateHeard[summary.instanceId];
    if (heard) {
      delegatesState.delegateHeard[summary.instanceId] = heard.filter(
        (event) => event.id > summary.through
      );
    }
  }
}

/**
 * Files one of the hub's pushed delegate events under the delegate it is
 * about, in id order. The read and the pushes overlap by however long the
 * read was out: a row already held, or one the delegate's read summary
 * already counts, is dropped ({@link delegateRecord} folds the rest).
 */
export function hearDelegateEvent(event: DelegateEvent): void {
  if (
    event.id <= (delegatesState.delegateRead[event.instanceId]?.through ?? 0)
  ) {
    return;
  }
  // Written, then read back: a `$state` write lands on the proxy and never on
  // the literal, so filing into the literal would put the row where the UI
  // cannot see it.
  delegatesState.delegateHeard[event.instanceId] ??= [];
  const list = delegatesState.delegateHeard[event.instanceId];
  if (list.some((row) => row.id === event.id)) {
    return;
  }
  const after = list.findIndex((row) => row.id > event.id);
  if (after === -1) {
    list.push(event);
  } else {
    list.splice(after, 0, event);
  }
}

/** A session's tray of what it started, and each delegate's exchange with its parent. */
export const delegatesStore = {
  /**
   * What one delegate's card draws of its exchange with its parent, once
   * {@link readDelegate} asked for it. Empty for a delegate whose traffic
   * predates the table: its card falls back to reading the markers out of
   * the parent's transcript.
   */
  delegateOf: (instanceId: string): DelegateRecord =>
    delegateRecord(
      delegatesState.delegateRead[instanceId],
      delegatesState.delegateHeard[instanceId] ?? []
    ),
  /**
   * What a session's tray lists, oldest first: the work items it delegated,
   * and the sessions it started that run none ({@link startedBy}). Only what
   * it made: a project's conversation does not list its project's other
   * work (hub work-items.ts `trayOf`).
   */
  trayOf: (instanceId: string): TrayChild[] =>
    [
      ...Object.values(workItemsState.workItems)
        .filter((item) => item.parentInstanceId === instanceId)
        .map(itemChild),
      ...(startedBy.get(instanceId) ?? []).map(sessionChild),
    ].sort((a, b) => a.createdAt - b.createdAt),
  /** A delegate's or a started session's tray entry, by its instance id. */
  trayChildFor: (instanceId: string): TrayChild | undefined => {
    const item = Object.values(workItemsState.workItems).find(
      (each) => each.instanceId === instanceId
    );
    if (item) {
      return itemChild(item);
    }
    const row = rowById(instanceId);
    return row && isStarted(row) ? sessionChild(row) : undefined;
  },
};
