/**
 * A stage as the setup page holds it (the decision library's `Stage`, or the
 * stages the hub kept): its name, its kind, its look and what its hooks do.
 */
import type { StageColor, StageIcon, StageKind } from "@cawco/core/views";

export interface Stage {
  color?: StageColor;
  hooks?: Record<string, string>;
  icon?: StageIcon;
  kind: StageKind;
  /** What its hooks do, in words ("Runs the researcher"). */
  line?: string;
  name: string;
}

/** A change to the list: the next stages, and whether to keep them at once (a structural change) or once typing rests. */
export type StagesChange = (next: Stage[], now?: boolean) => void;

/** The list with `one` moved from `from` to `to`. */
export const moved = <T>(list: readonly T[], from: number, to: number): T[] => {
  const next = [...list];
  const [one] = next.splice(from, 1);
  next.splice(to, 0, one);
  return next;
};

/** The list with the item at `index` patched. */
export const patched = <T>(
  list: readonly T[],
  index: number,
  patch: Partial<T>
): T[] => list.map((one, i) => (i === index ? { ...one, ...patch } : one));

/**
 * A setup page's list (stages, delegate types): one raised group on the
 * page's ground (the house tile surface and shadow, `radius-lg`), its rows
 * `space-1` in; inside a card it is the card's section, with no surface of
 * its own (ui/card's own rule for a card in a card).
 */
export const LIST_CLASS =
  "m-0 grid list-none gap-x-space-2 rounded-lg bg-surface-raised p-space-1 shadow-tile in-data-[slot=card]:bg-transparent in-data-[slot=card]:p-0 in-data-[slot=card]:shadow-none";
