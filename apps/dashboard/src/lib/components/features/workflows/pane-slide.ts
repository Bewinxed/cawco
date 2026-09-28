/**
 * One tab's pane giving way to the next (the editor's Editor / Program /
 * Runs, a narrow run's Steps / Canvas): the two stand in one cell and slide
 * 8% across in tab order as they cross-fade, over --dur-control on
 * --ease-drawer. `dir` is +1 moving to a later tab, -1 to an earlier one:
 * the new pane comes in from that side and the old one leaves the other
 * way. Without motion only the fade runs.
 */
import type { TransitionConfig } from "svelte/transition";
import { dur, easeDrawer, motionOk } from "$lib/whiffle/motion/curves.svelte";

export function paneSlide(
  _node: Element,
  { dir }: { dir: number },
  { direction }: { direction?: "in" | "out" | "both" } = {}
): TransitionConfig {
  const away = (direction === "out" ? -8 : 8) * dir;
  return {
    duration: dur("--dur-control"),
    easing: easeDrawer,
    css: (t) =>
      motionOk.current
        ? `opacity: ${t}; translate: ${((1 - t) * away).toFixed(3)}% 0`
        : `opacity: ${t}`,
  };
}

/** Which way a move from one tab to another goes, in the tabs' order. */
export const towards = (order: readonly string[], from: string, to: string) =>
  Math.sign(order.indexOf(to) - order.indexOf(from)) || 1;
