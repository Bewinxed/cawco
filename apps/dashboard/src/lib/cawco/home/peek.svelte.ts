/**
 * The glance → peek → dive loop's middle step, held once for the whole app:
 * any home row or Needs-you row can peek, and one sheet shows it. The target
 * is kept after the sheet is put away, so the pane still has its session
 * while it slides out; `open` is what shows it.
 *
 * Peek is for the wide layout only, a desk and an iPad: on a phone (the
 * drawer layout, `DRAWER_QUERY`) a session is opened, never peeked, so no
 * Peek button is drawn there (`peekable`) and an open peek is put away when
 * the window narrows into it.
 */
import { MediaQuery } from "svelte/reactivity";
import { DRAWER_QUERY } from "#lib/hooks/is-mobile.svelte.js";
import type { PeekTarget } from "../PeekPane.svelte";

export const peek = $state<{ target: PeekTarget | null; open: boolean }>({
  target: null,
  open: false,
});

/** The drawer layout, where there is no peek. One listener for every row. */
const drawer = new MediaQuery(DRAWER_QUERY);

/** Whether this layout offers Peek: the wide one, not the phone's. */
export const peekable = (): boolean => !drawer.current;

/** A finger (an iPad): Peek's buttons always show, and their "Peek" tip never opens. */
const coarse = new MediaQuery("(pointer: coarse)");

/**
 * Whether a Peek button's tooltip is off: on a coarse pointer a press would
 * leave it standing over the sheet it just opened, and there is no hover to
 * want it; the button's aria-label still names it.
 */
export const peekTipOff = (): boolean => coarse.current;

export function openPeek(target: PeekTarget): void {
  peek.target = target;
  peek.open = true;
}

export function closePeek(): void {
  peek.open = false;
}
