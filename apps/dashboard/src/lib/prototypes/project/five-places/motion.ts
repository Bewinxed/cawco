/**
 * The panes' motion: the house sheet recipe (motion/curves `sheetSlide`),
 * along the axis the pane stands on at the screen's width: from the right
 * at 900 and up, where it slides over the list, from the foot under it,
 * where it is a drawer. The width is the screen's own (`data-five`), so a
 * frame of any width moves the way its own width would.
 */
import type { TransitionConfig } from "svelte/transition";
import { sheetSlide } from "#lib/cawco/motion/curves.svelte.js";

const DESK = 900;

export function paneSlide(
  node: Element,
  { leaving, from }: { leaving: boolean; from?: "right" | "foot" }
): TransitionConfig {
  const screen = node.closest<HTMLElement>("[data-five]");
  const wide = (screen?.clientWidth ?? DESK) >= DESK;
  const fromRight = from === undefined ? wide : from === "right";
  const axis = fromRight ? "X" : "Y";
  return sheetSlide(node, { axis, leaving });
}
