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
const phone = new MediaQuery("max-width: 899px");
const touchPortrait = new MediaQuery(
  "(pointer: coarse) and (orientation: portrait)"
);

export const layoutPolicy = {
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
