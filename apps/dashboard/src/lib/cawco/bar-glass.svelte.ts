/**
 * The cards that hang from the top bar's glass (Shell `[data-bar-group]`):
 * Caw's panel, the machines and the Jump palette, each a HangCard on the
 * glass. One stands open at a time: opening one closes the one standing,
 * which folds back into the glass as the next comes down, each on its own
 * interruptible clock. While any stands drawn out of the glass, the glass
 * draws its join into it (Shell `.join`) and Caw's lower arcs give way to
 * the seam (NeedsCaw). A card opened from the keyboard stands open at once
 * and leaves at once (HangCard `held`, `folded`), and the glass's join and
 * Caw's arcs change with it, at once (`instant`).
 */
import { untrack } from "svelte";

export type GlassCard = "caw" | "machines" | "jump";

class BarGlass {
  /** The card opened last; the others close. */
  open = $state<GlassCard | null>(null);
  /** The cards drawn out of the glass now. */
  shown = $state<GlassCard[]>([]);
  /**
   * The card opened last was opened from the keyboard: the join and Caw's
   * arcs come and go with it at once. Kept until the next card opens, so
   * its close is as instant as its open.
   */
  instant = $state(false);
  /** The glass draws its join: a card stands drawn out of it. */
  get joined(): boolean {
    return this.shown.length > 0;
  }
  show(card: GlassCard, shown: boolean): void {
    const rest = this.shown.filter((one) => one !== card);
    this.shown = shown ? [...rest, card] : rest;
  }
}

export const barGlass = new BarGlass();

/** The bar's glass, once the bar has drawn it. */
export const glassElement = (): HTMLElement | null =>
  document.querySelector<HTMLElement>("[data-bar-group]");

/**
 * One card open at a time, from a card's init: its open claims the glass,
 * and another's claim closes it through `close` (which keeps the focus
 * where the new card puts it). `byKey` says, as it opens, whether the
 * keyboard opened it.
 */
export function oneAtATime(
  card: GlassCard,
  isOpen: () => boolean,
  close: () => void,
  byKey: () => boolean = () => false
): void {
  let was = false;
  $effect(() => {
    const now = isOpen();
    untrack(() => {
      if (now && !was) {
        barGlass.open = card;
        barGlass.instant = byKey();
      } else if (!now && was && barGlass.open === card) {
        barGlass.open = null;
      }
    });
    was = now;
  });
  $effect(() => {
    const owner = barGlass.open;
    if (owner !== null && owner !== card && untrack(isOpen)) {
      untrack(close);
    }
  });
}

/**
 * Where a card on the glass stands. On a phone the glass is Caw's tab tucked
 * into the screen's trailing edge, and the card hangs from the tab row's
 * floor through his neck (Shell `--caw-neck`), its top edge on the floor's
 * own line (the bar's seam, the strip's shelf) so the two are one line, its
 * trailing side the screen's edge and its leading side the phone's 12px
 * margin; on the wide bar it hangs from the glass's foot, 8px clear of the
 * screen.
 */
/** The floor's line, px: the bar's bottom row. */
const FLOOR_LINE = 1;

export function glassPlacement(
  glass: HTMLElement | null,
  phone: boolean
): {
  collisionPadding:
    | number
    | { top: number; bottom: number; left: number; right: number };
  sideOffset: number;
} {
  if (!(phone && glass)) {
    return { collisionPadding: 8, sideOffset: 0 };
  }
  return {
    collisionPadding: { top: 12, bottom: 12, left: 12, right: 0 },
    sideOffset:
      (Number.parseFloat(
        getComputedStyle(glass).getPropertyValue("--caw-neck")
      ) || 0) - FLOOR_LINE,
  };
}
