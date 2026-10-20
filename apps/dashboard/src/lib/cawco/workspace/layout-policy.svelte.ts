/**
 * How many groups the workspace may hold on this screen, and whether the
 * reader gets the deck or the grid — the `ipad` choice (home/choices).
 *
 * - (a) one transcript at a time on every wide screen; the rest are tabs.
 * - (b) a tablet in landscape holds two groups side by side, held upright
 *   it is the deck (one group, swipe between conversations); a desktop
 *   splits freely.
 * - (c) free splits everywhere: a tablet held upright gets the grid too.
 */
import { MediaQuery } from "svelte/reactivity";
import { choices } from "../home/choices.svelte";

const coarse = new MediaQuery("pointer: coarse");
const phone = new MediaQuery("(width < 900px)");
const touchPortrait = new MediaQuery(
  "(pointer: coarse) and (orientation: portrait)"
);
/** DESIGN.md's phone breakpoint (Breakpoints: "640px (phone: …)"), in px. */
const PHONE_BREAKPOINT = 640;
/** An iPad's regular width: a coarse pointer at the phone breakpoint or wider. */
const touchRegular = new MediaQuery(
  `(pointer: coarse) and (min-width: ${PHONE_BREAKPOINT}px)`
);

export const layoutPolicy = {
  /** A screen under 900px: a phone's, where conversations are the deck. */
  get phone(): boolean {
    return phone.current;
  },
  /**
   * A phone's screen, not an iPad's regular width: a coarse pointer under
   * 640px, or a fine one under 900px. The hidden previews' bound is 1 here.
   */
  get compact(): boolean {
    return coarse.current ? !touchRegular.current : phone.current;
  },
  /**
   * The artifact panel is the bottom drawer, not the side sheet, for a pane
   * `paneWidth` wide (DESIGN.md, Artifact panel): an iPad at its regular
   * width keeps the side sheet in a pane at the phone breakpoint or wider,
   * so a group split beside another (choices b and c) is never squeezed
   * into two phone-narrow columns; a fine pointer gets the drawer in a
   * pane under 900px; a phone always.
   *
   * `null` while the pane has no width yet (0): neither is chosen until it is
   * measured. Read as one or the other, a pane mounting under 900px opened
   * the split beside the conversation, and its preview with it, for as long
   * as its children's effects ran before its own width was laid (they run
   * first: a component's `$effect`s are made once its template is), then put
   * it away for the sheet.
   */
  sideDrawer(paneWidth: number): boolean | null {
    if (paneWidth <= 0) {
      return null;
    }
    if (coarse.current) {
      return !(touchRegular.current && paneWidth >= PHONE_BREAKPOINT);
    }
    return paneWidth < 900;
  },
  /** Whether conversations are a deck of one group at a time, not a grid. */
  get deck(): boolean {
    if (phone.current) {
      return true;
    }
    return choices.ipad === "c" ? false : touchPortrait.current;
  },
  /** The most groups a split may make on this screen. */
  get maxLeaves(): number {
    if (this.deck) {
      return Number.POSITIVE_INFINITY;
    }
    if (choices.ipad === "a") {
      return 1;
    }
    if (choices.ipad === "b" && coarse.current) {
      return 2;
    }
    return Number.POSITIVE_INFINITY;
  },
};
