import type { WorkItemRow } from "./db/project-work";

/**
 * What holds a live work item right now: each reason the hub leaves it
 * alone, named, in the one order its holds are read. A guard reads the
 * holds it cares about ({@link itemHolds}) and acts on the first.
 *
 * From its row:
 * - `held`: an interrupt, or a sleep past its limit, holds it (`heldAt`):
 *   only its parent, its conversation or the person wakes it.
 * - `stopping`: a stop asked for it is under way (`stoppingAt`).
 * - `blocked`: its delegate type, machine or account is missing
 *   (`blocked`).
 * - `waiting`: it declared a wait (`waitUntil`, wait_item).
 * - `waitResuming`: a hub restart resumes its declared wait
 *   (`waitResumeBy`).
 * - `landing`: its merge checks or its landing run (`landingSince`, any
 *   phase but `completing`).
 * - `completing`: its submission waits on its own delegates (`landingSince`
 *   in phase `completing`).
 *
 * From what the hub knows now ({@link ItemFacts}):
 * - `paused`: the machine under its workspace is paused.
 * - `custody`: its machine's reconnect has not decided whether its
 *   session's process is still there.
 * - `verifying`: a design check's verifier judges its result.
 * - `finishing`: this hub runs its landing, or a stop's landing is still
 *   ending.
 * - `movedOn`: its session has moved on to another item.
 * - `offline`: its session's machine is not connected.
 * - `sendComing`: a send on its way to its session is its next turn.
 */
export type ItemHold =
  | "held"
  | "stopping"
  | "blocked"
  | "paused"
  | "custody"
  | "waiting"
  | "waitResuming"
  | "verifying"
  | "landing"
  | "completing"
  | "finishing"
  | "movedOn"
  | "offline"
  | "sendComing";

/** What the hub knows of an item now, beyond its row: each fact absent is false. */
export type ItemFacts = Partial<
  Record<
    Extract<
      ItemHold,
      | "custody"
      | "finishing"
      | "movedOn"
      | "offline"
      | "paused"
      | "sendComing"
      | "verifying"
    >,
    boolean
  >
>;

/** The columns of an item its holds read. */
export type HoldColumns = Pick<
  WorkItemRow,
  | "blocked"
  | "heldAt"
  | "landingPhase"
  | "landingSince"
  | "stoppingAt"
  | "waitResumeBy"
  | "waitUntil"
>;

/**
 * THE ONE READING of what holds an item: every hold of {@link ItemHold}
 * that is true of `item` and `facts`, in that order. A pure function of
 * them.
 */
export const itemHolds = (item: HoldColumns, facts: ItemFacts): ItemHold[] => {
  const landing = item.landingSince ? item.landingPhase : undefined;
  const holds: [ItemHold, boolean][] = [
    ["held", item.heldAt !== null],
    ["stopping", item.stoppingAt !== null],
    ["blocked", item.blocked !== null],
    ["paused", facts.paused === true],
    ["custody", facts.custody === true],
    ["waiting", !!item.waitUntil],
    ["waitResuming", !!item.waitResumeBy],
    ["verifying", facts.verifying === true],
    ["landing", landing !== undefined && landing !== "completing"],
    ["completing", landing === "completing"],
    ["finishing", facts.finishing === true],
    ["movedOn", facts.movedOn === true],
    ["offline", facts.offline === true],
    ["sendComing", facts.sendComing === true],
  ];
  return holds.flatMap(([hold, on]) => (on ? [hold] : []));
};

/** The first of {@link itemHolds} among `among`, or nothing. */
export const itemHold = <T extends ItemHold>(
  item: HoldColumns,
  facts: ItemFacts,
  among: readonly T[]
): T | undefined =>
  itemHolds(item, facts).find((hold): hold is T =>
    (among as readonly ItemHold[]).includes(hold)
  );
