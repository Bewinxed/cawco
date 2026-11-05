/**
 * The width a surface needs for the design graph's room to stand beside its
 * stage: the stage at its least (`c-graph-stage-min`), the room at its least
 * (`c-graph-room-w`), each pane's inset beside the split's divider, the
 * divider and the page's gutters. Under it the room is the drawer. Read by
 * the graph for its own layout and by the artifact panel, which puts the
 * inspector in the room where the room stands beside (PreviewPane).
 */
import { numberOf } from "#lib/cawco/motion/curves.svelte.js";

/** The divider's width (the kit handle's `w-px`): paneforge shares what is left of the group beside it between the panes (as side/Split.svelte reads it). */
export const DIVIDER = 1;
/** The px the two least shares, each rounded up to a hundredth, may add between them on the widest surface: under one. */
const ROUNDING = 1;

/** The beside line, px (1058 today); 0 before the page has its tokens. */
export const besideLine = (): number =>
  typeof document === "undefined"
    ? 0
    : numberOf("--c-graph-stage-min") +
      numberOf("--c-graph-room-w") +
      2 * numberOf("--space-2") +
      2 * numberOf("--space-6") +
      DIVIDER +
      ROUNDING;
