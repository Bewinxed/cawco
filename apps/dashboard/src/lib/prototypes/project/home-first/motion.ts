/**
 * A pane leaving the way it came (DESIGN.md, The Fast Exit Rule): back off
 * the edge it slid in from, over `--dur-exit` on the drawer curve. Under
 * the desk line it came up from the screen's foot, so it goes down; from
 * 900 it came in from the trailing edge, so it goes back across. With
 * reduced motion it only fades.
 */
import type { TransitionConfig } from "svelte/transition";
import { dur, easeDrawer, motionOk } from "#lib/cawco/motion/curves.svelte.js";

export function paneOut(node: HTMLElement): TransitionConfig {
  if (!motionOk.current) {
    return { duration: dur("--dur-control"), css: (t) => `opacity: ${t}` };
  }
  // A drawer stands clear of the frame's top; a side pane runs from it.
  const fromFoot = node.offsetTop > 0;
  return {
    duration: dur("--dur-exit"),
    easing: easeDrawer,
    css: (t) =>
      fromFoot
        ? `translate: 0 ${((1 - t) * 100).toFixed(2)}%`
        : `translate: ${((1 - t) * 100).toFixed(2)}% 0`,
  };
}
