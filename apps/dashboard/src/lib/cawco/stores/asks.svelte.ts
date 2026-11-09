/**
 * The asks parked on sessions and who waits on the person: each ask as the
 * hub parks and settles it, in the order this device heard it against the
 * reads of `/api/pending`; the asks for the person across the fleet; and
 * what each session needs from you, held per board row.
 */

import {
  type Activity,
  sessionChain,
  waitingOnYou,
} from "@cawco/core/activity";
import type { FramePayload } from "@cawco/core/frames";
import type { Envelope } from "@cawco/core/protocol";
import type { PermissionResult } from "@cawco/core/session-messages";
import { sessionActivity } from "../activity";
import { type FrameOf, takeFrame } from "../hub/frames";
import { routedToParent } from "../transcript/present";
import {
  boardState,
  instanceIndex,
  isStale,
  pulseOf,
  type RowsMoved,
  rowsById,
} from "./board.svelte";
import { isSubscribed } from "./follows.svelte";
import { needsStore } from "./needs.svelte";
import {
  type BlockedRequest,
  type PendingPermission,
  session,
  sessionsState,
  trackWorking,
} from "./sessions.svelte";
import { workItemsState } from "./work-items.svelte";

/**
 * What each hub row's session needs from you ({@link activityNow}), held
 * per row: every list asks it of every row it holds, and asked afresh each
 * time, a turn ending somewhere re-ran it for the whole board. Each is
 * worked out again only when what it reads moves (its row, its pulse's
 * activity, its parked asks, its subscription). Made as the row arrives,
 * in the socket's or a read's handler, outside every component, so no
 * component's teardown takes it.
 */
class RowActivity {
  readonly id: string;
  readonly value = $derived.by(() => activityNow(this.id));
  constructor(id: string) {
    this.id = id;
  }
}

const rowActivity = new Map<string, RowActivity>();

/** Each row the board took holds its activity, and each row it let go lets its go. */
export function holdActivities({ moved, gone }: RowsMoved): void {
  for (const id of gone) {
    rowActivity.delete(id);
  }
  for (const row of moved) {
    if (!rowActivity.has(row.id)) {
      rowActivity.set(row.id, new RowActivity(row.id));
    }
  }
}

/**
 * The order this device hears the hub's word on asks in: each ask parked and
 * each ask settled takes the next number. A read of `/api/pending` notes the
 * number it was asked for at, and what was heard after that is newer than it.
 */
let askHeard = 0;

/** The number the last ask heard took: a read of `/api/pending` asked for now notes it. */
export const asksHeard = (): number => askHeard;

const hearAsk = (): number => {
  askHeard += 1;
  return askHeard;
};

/** The asks heard settled, by request id, with when; the oldest go past a few hundred. */
const askSettledHeard = new Map<string, number>();

const SETTLED_HEARD_KEPT = 512;

export const hearSettled = (requestId: string): void => {
  askSettledHeard.delete(requestId);
  askSettledHeard.set(requestId, hearAsk());
  if (askSettledHeard.size > SETTLED_HEARD_KEPT) {
    const [oldest] = askSettledHeard.keys();
    askSettledHeard.delete(oldest);
  }
};

/**
 * The hub's parked asks as `/api/pending` answered, read when `readFrom` was
 * heard. The read is the whole truth as of then: an ask settled while this
 * tab was away sent its `permission_settled` to nobody listening. What the
 * socket said since is newer than the read: an ask parked meanwhile (a
 * restarted hub hearing its agents replay theirs) stays, and one settled
 * meanwhile is not put back.
 */
export function adoptPending(
  pending: Envelope<FramePayload>[],
  readFrom: number
): void {
  const parked = new Set(pending.map((envelope) => envelope.requestId));
  const stands = (p: PendingPermission): boolean =>
    parked.has(p.requestId) || p.heard > readFrom;
  for (const target of Object.values(sessionsState.sessions)) {
    if (!target.pending.every(stands)) {
      target.pending = target.pending.filter(stands);
      trackWorking(target);
    }
  }
  for (const envelope of pending) {
    if ((askSettledHeard.get(envelope.requestId ?? "") ?? 0) <= readFrom) {
      adoptAskMachine(envelope);
      takeFrame(envelope.payload);
    }
  }
}

/**
 * An ask the hub parked for no session it keeps a row for (a project's
 * memory proposal, hub memory.ts): its answer names the envelope's machine,
 * since no row says one.
 */
export function adoptAskMachine(envelope: Envelope<FramePayload>): void {
  const frame = envelope.payload;
  if (
    frame.kind !== "permission_request" ||
    !envelope.machineId ||
    instanceIndex.byId.has(frame.instanceId)
  ) {
    return;
  }
  const target = session(frame.instanceId);
  if (!target.machineId) {
    target.machineId = envelope.machineId;
  }
}

/**
 * An ask the hub parked: on its session, and off any other it stood on
 * before (its session folded into the one it went on in).
 */
export function takePermissionRequest(
  frame: FrameOf<"permission_request">
): void {
  const target = session(frame.instanceId);
  const { routedTo } = frame as { routedTo?: "parent" };
  // An ask is parked in one session: one the hub parked again under
  // another (its session folded into the one it went on in) leaves
  // the session it stood in.
  for (const other of Object.values(sessionsState.sessions)) {
    if (
      other !== target &&
      other.pending.some((p) => p.requestId === frame.requestId)
    ) {
      other.pending = other.pending.filter(
        (p) => p.requestId !== frame.requestId
      );
      trackWorking(other);
    }
  }
  const existing = target.pending.find((p) => p.requestId === frame.requestId);
  if (existing) {
    // A re-broadcast (the parent died) clears the tag, so the ask returns
    // to the user's queue; a fresh arrival keeps it out. Either way the
    // stored entry follows the latest word from the hub.
    existing.routedTo = routedTo;
    existing.raisedAt = frame.raisedAt;
    existing.presentation = frame.presentation;
    // A proposal's session moved on (a fold): its card follows.
    existing.originInstanceId = frame.originInstanceId;
    existing.heard = hearAsk();
  } else {
    target.pending.push({
      heard: hearAsk(),
      requestId: frame.requestId,
      instanceId: frame.instanceId,
      toolName: frame.toolName,
      input: frame.input,
      presentation: frame.presentation,
      suggestions: frame.suggestions,
      routedTo,
      toolUseId: frame.toolUseId,
      raisedAt: frame.raisedAt,
      originInstanceId: frame.originInstanceId,
      browserAsk: frame.browserAsk,
      connectAsk: frame.connectAsk,
    });
  }
  trackWorking(target);
  target.lastActivityAt = new Date();
}

/** The answers a permission card offers — the keyboard has one key for each. */
export type PermissionAnswer = "allow" | "deny" | "always";

/**
 * What an answer means on the wire. `always` hands the SDK's own suggestions
 * back as `updatedPermissions`: they are what stops the next identical call
 * from asking again, and the SDK is the only one that knows how to phrase them.
 */
export function permissionAnswer(
  request: PendingPermission,
  answer: PermissionAnswer
): PermissionResult {
  // A browser ask's Deny refuses and says nothing more: its card takes no words.
  if (answer === "deny") {
    return {
      behavior: "deny",
      message: request.browserAsk ? "" : "User denied permission",
    };
  }
  return {
    behavior: "allow",
    updatedInput: request.input,
    ...(answer === "always" && { updatedPermissions: request.suggestions }),
  };
}

/**
 * Who started each delegate, by its instance id, from its work item: a
 * delegate's row may not be on the board (asleep, its item over and taken
 * up again) while its ask stands, and its work item still names its parent.
 */
const itemParents = $derived(
  new Map(
    Object.values(workItemsState.workItems).map((item) => [
      item.instanceId,
      item.parentInstanceId,
    ])
  )
);

/** The session that started `instanceId`, by its row, else by its work item; null for none. */
function parentOf(instanceId: string): string | null {
  return (
    rowsById.get(instanceId)?.parentInstanceId ??
    itemParents.get(instanceId) ??
    null
  );
}

/**
 * The sessions waiting on the person (core `waitingOnYou`): an ask parked
 * under it for the person (not one routed to its parent), its delegates'
 * at any depth included, or an artifact of it in Needs you. The set it gave
 * before while it holds the same sessions, so a frame that moved an ask's
 * words wakes no row's activity.
 */
const waiting = $derived.by((): ReadonlySet<string> => {
  const now = waitingOnYou({
    asks: Object.values(sessionsState.sessions).flatMap((target) =>
      target.pending.map((request) => ({
        instanceId: target.instanceId,
        routedTo: request.routedTo,
      }))
    ),
    artifacts: needsStore.artifactNeedsOpen,
    parentOf,
  });
  if (
    now.size === waitingWas.size &&
    [...now].every((id) => waitingWas.has(id))
  ) {
    return waitingWas;
  }
  waitingWas = now;
  return now;
});

let waitingWas: ReadonlySet<string> = new Set();

/**
 * What a session needs from you — `idle` for one nothing has been heard
 * from. A hub row's is held per row ({@link RowActivity}).
 */
export function activityFor(instanceId: string): Activity {
  return rowActivity.get(instanceId)?.value ?? activityNow(instanceId);
}

/** What a session needs from you — `idle` for one nothing has been heard from. */
function activityNow(instanceId: string): Activity {
  const row = rowsById.get(instanceId);
  return sessionActivity({
    waiting: waiting.has(instanceId),
    moving: row?.status === "moving",
    runningDelegates: row?.runningDelegates ?? 0,
    session: sessionsState.sessions[instanceId],
    subscribed: isSubscribed(instanceId),
    pulse: pulseOf(instanceId)?.activity,
  });
}

/**
 * Every permission waiting on the user, across every machine. This is the
 * question the fleet view exists to answer, so it is derived from the sessions
 * themselves rather than tracked separately: once per change to what it
 * reads, each asking session's own row read by its id.
 */
const blocked = $derived.by((): BlockedRequest[] => {
  const rows: BlockedRequest[] = [];
  for (const target of Object.values(sessionsState.sessions)) {
    if (target.pending.length === 0) {
      continue;
    }
    // Every ask the hub holds is listed, whatever its session's row says:
    // the hub settles the asks of a process that ended, and keeps the ones
    // that outlive it (a question `ask` put, a post held for you) until they
    // are answered or the session ends for good. One whose machine the hub
    // cannot reach (`unknown`) is marked stale. Across a reconnect the asks
    // hold as last read until the hub's read replaces them (`adoptPending`).
    const row = rowsById.get(target.instanceId);
    const machine = boardState.machines.find(
      (one) => one.machineId === target.machineId
    );
    for (const request of target.pending) {
      // A delegate's ask is the parent's to answer, not the user's: it stays on
      // the delegate's own transcript but never lands in this queue.
      if (routedToParent(request)) {
        continue;
      }
      rows.push({
        instanceId: target.instanceId,
        machineId: target.machineId,
        hostname: machine?.hostname ?? target.machineId,
        cwd: target.cwd,
        request,
        stale: row !== undefined && isStale(row),
      });
    }
  }
  // The very list it gave before while it says the same asks the same
  // way: a frame that moved a session's transcript re-asks this, and a
  // new list woke every list that leaves the asks out.
  if (
    rows.length === blockedWas.length &&
    rows.every((one, i) => sameAsk(one, blockedWas[i]))
  ) {
    return blockedWas;
  }
  blockedWas = rows;
  return rows;
});

let blockedWas: BlockedRequest[] = [];

const sameAsk = (a: BlockedRequest, b: BlockedRequest | undefined): boolean =>
  b !== undefined &&
  a.request === b.request &&
  a.instanceId === b.instanceId &&
  a.machineId === b.machineId &&
  a.hostname === b.hostname &&
  a.cwd === b.cwd &&
  a.stale === b.stale;

/** Who waits on the person, and what each session is doing. */
export const asksStore = {
  /**
   * What a session needs from you — `idle` for one nothing has been heard
   * from. A hub row's is held per row ({@link RowActivity}).
   */
  activityOf: activityFor,
  /**
   * Whether the session's own main loop is in a turn, its delegates and
   * subagents aside: what a project's Caw is doing himself, where
   * `activityOf` counts a conversation as working while any attempt it parents runs.
   * The same sources as `activityOf`: an open session's frames, else the
   * daemon's pulse.
   */
  busyOf: (instanceId: string): boolean => {
    const target = sessionsState.sessions[instanceId];
    if (target && isSubscribed(instanceId)) {
      return target.busy;
    }
    return pulseOf(instanceId)?.busy ?? false;
  },
  currentToolOf: (
    instanceId: string
  ): { name: string; glance: string } | null => {
    const target = sessionsState.sessions[instanceId];
    if (target && isSubscribed(instanceId)) {
      return target.currentTool;
    }
    return pulseOf(instanceId)?.currentTool ?? null;
  },
  get blocked(): BlockedRequest[] {
    return blocked;
  },
  /**
   * The asks for the person that delegates of `instanceId` parked, at any
   * depth under it: its pane draws each as its own (core `waitingOnYou`'s
   * `parentOf`), so an ask asked two deep reaches the session the person
   * talks to as it is asked.
   */
  asksUnder(instanceId: string): BlockedRequest[] {
    return blocked.filter(
      (row) =>
        row.instanceId !== instanceId &&
        sessionChain(row.instanceId, parentOf).includes(instanceId)
    );
  },
  /** How many sessions wait on the person (core `waitingOnYou`): asks for them, cards and canvases in Needs you. */
  get waitingCount(): number {
    return waiting.size;
  },
};
