/**
 * The design graph with three directions of one design (Component Story
 * Format 3, live components): the address tray's Family tray, status card
 * and ticking stations in one graph, the switch between them in the panel's
 * head and Pick its one prominent action. A flip keeps the state, the
 * width, the scheme and the network dial; Compare compares the kept state
 * with the same state in the direction he came from; only the direction in
 * front loads.
 */

import DirectionsBench from "./DirectionsBench.svelte";

export default {
  title: "Design graph/Directions",
  component: DirectionsBench,
  // A desk's width: the switch's names in the head; the canvas's 390 folds it to the direction in front.
  parameters: { viewport: 1440 },
};

/** Three directions of the address tray, the Family tray in front at Found it. */
export const ThreeDirections = {};
