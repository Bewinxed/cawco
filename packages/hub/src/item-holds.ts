import type { WorkItemRow } from "./db/project-work";

/**
 * What holds a live work item right now: each reason the hub leaves it
 * alone, named, in the one order its holds are read. A guard reads the
 * holds it cares about ({@link itemHold}) and acts on the first.
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
 * - `onPerson`: its session waits on the person itself, an ask of its own
 *   or an artifact of its own in Needs you (work-items.ts `onPerson`):
 *   their answer is its next turn.
 */
const HOLD_ORDER = [
  "held",
  "stopping",
  "blocked",
  "paused",
  "custody",
  "waiting",
  "waitResuming",
  "verifying",
  "landing",
  "completing",
  "finishing",
  "movedOn",
  "offline",
  "sendComing",
  "onPerson",
] as const;

/** One hold of {@link HOLD_ORDER}: a hold is named there, in its place in the order, or not at all. */
export type ItemHold = (typeof HOLD_ORDER)[number];

/** The holds read from what the hub knows now rather than from the item's row. */
type FactHold = Extract<
  ItemHold,
  | "custody"
  | "finishing"
  | "movedOn"
  | "offline"
  | "onPerson"
  | "paused"
  | "sendComing"
  | "verifying"
>;

/**
 * What the hub knows of an item now, beyond its row: one read for each such
 * hold among those asked, read only once the holds before it are not.
 */
type ItemFacts<T extends ItemHold> = {
  readonly [Hold in Extract<T, FactHold>]: () => boolean;
};

/** The columns of an item its holds read. */
type HoldColumns = Pick<
  WorkItemRow,
  | "blocked"
  | "heldAt"
  | "landingPhase"
  | "landingSince"
  | "stoppingAt"
  | "waitResumeBy"
  | "waitUntil"
>;

/** Each hold read from the item's row. */
const ROW_HOLDS: Record<
  Exclude<ItemHold, FactHold>,
  (item: HoldColumns) => boolean
> = {
  held: (item) => item.heldAt !== null,
  stopping: (item) => item.stoppingAt !== null,
  blocked: (item) => item.blocked !== null,
  waiting: (item) => !!item.waitUntil,
  waitResuming: (item) => !!item.waitResumeBy,
  landing: (item) => !!item.landingSince && item.landingPhase !== "completing",
  completing: (item) =>
    !!item.landingSince && item.landingPhase === "completing",
};

/** Every hold of {@link HOLD_ORDER} but `left`, in that order. */
export const holdsBut = <T extends ItemHold>(
  ...left: readonly T[]
): Exclude<ItemHold, T>[] =>
  HOLD_ORDER.filter(
    (hold): hold is Exclude<ItemHold, T> =>
      !(left as readonly ItemHold[]).includes(hold)
  );

const isRowHold = (hold: ItemHold): hold is Exclude<ItemHold, FactHold> =>
  hold in ROW_HOLDS;

/**
 * THE ONE READING of what holds an item: the first hold among `among` that
 * is true of `item` and `facts`, in the order of {@link ItemHold}, or
 * nothing. Each fact a hold asked for reads must be given, and is read only
 * when the holds before it are not.
 */
export const itemHold = <T extends ItemHold>(
  item: HoldColumns,
  among: readonly T[],
  facts: ItemFacts<T>
): T | undefined => {
  const asked: readonly ItemHold[] = among;
  const known: Partial<Record<FactHold, () => boolean>> = facts;
  return HOLD_ORDER.find(
    (hold): hold is T =>
      asked.includes(hold) &&
      (isRowHold(hold) ? ROW_HOLDS[hold](item) : known[hold]?.() === true)
  );
};
