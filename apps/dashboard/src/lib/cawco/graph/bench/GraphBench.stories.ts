/**
 * The design graph whole on the routine form, with the controls an agent
 * put on it (Component Story Format 3, live components): the Controls face
 * beside the stage at a desk's width, and, at a phone's, in the drawer at
 * half height.
 */

import { ROUTINE_DIALS_GROUPED } from "./fixture";
import GraphBench from "./GraphBench.svelte";

export default {
  title: "Design graph/Bench",
  component: GraphBench,
  args: { dials: ROUTINE_DIALS_GROUPED, turned: { radius: 4 } },
  // A desk's width, the Controls face beside the stage; the canvas's 390 draws it in the phone's drawer.
  parameters: { viewport: 1440 },
};

/** The Controls face open, the corner radius turned to 4 px. */
export const ControlsFace = { args: { face: "dials" } };

/** No controls on the drawing: the room holds its states, its map and its animation. */
export const NoControls = { args: { dials: [] } };
