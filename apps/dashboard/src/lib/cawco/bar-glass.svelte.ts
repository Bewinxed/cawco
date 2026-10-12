/**
 * The cards that hang from the top bar's glass (Shell `[data-bar-group]`):
 * Caw's panel, the machines and the Jump palette, shown one at a time in the
 * glass's one card (GlassCard). Opening one while another hangs swaps what
 * the card shows in place: the card stays hung, its contents cross-fade and
 * its box tweens to the new size (motion/morph). While the card stands drawn
 * out of the glass, the glass draws its join into it (Shell `.join`) and
 * Caw's lower arcs give way to the seam (NeedsCaw). Jump opened from the
 * keyboard stands open at once and leaves at once (HangCard `held`,
 * `folded`), a swap into it is at once too, and the glass's join and Caw's
 * arcs change with it, at once (`instant`).
 */

export type GlassCard = "caw" | "machines" | "jump";

class BarGlass {
  /** The card asked for: what the glass's card shows, or null for shut. */
  open = $state<GlassCard | null>(null);
  /** The glass's card stands drawn out of the glass: the glass draws its join. */
  joined = $state(false);
  /**
   * The card standing was opened, or swapped to, from the keyboard (Jump by
   * ⌘K): it and the glass's join and Caw's arcs come and go at once. Kept
   * until the next card opens, so its close is as instant as its open.
   */
  instant = $state(false);
  /**
   * What the card gives the focus back to when it closes, handed over by
   * what opened it when the opener itself goes away: the phone's sheet,
   * whose search field opens Jump as the sheet closes, hands over what
   * invoked the sheet, the burger. "When a dialog closes, focus returns to
   * the element that invoked the dialog unless … The invoking element no
   * longer exists. Then, focus is set on another element that provides
   * logical work flow" (WAI-ARIA APG, Dialog (Modal) Pattern,
   * w3.org/WAI/ARIA/apg/patterns/dialog-modal/). Taken, and cleared, as the
   * card opens; without it, what had the focus then.
   */
  invoker: HTMLElement | null = null;
  /** Opens `card`, or shuts it when it is the one standing. */
  toggle(card: GlassCard): void {
    this.open = this.open === card ? null : card;
  }
}

export const barGlass = new BarGlass();

/** The bar's glass, once the bar has drawn it. */
export const glassElement = (): HTMLElement | null =>
  document.querySelector<HTMLElement>("[data-bar-group]");

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
