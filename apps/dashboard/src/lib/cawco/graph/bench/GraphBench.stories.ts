/**
 * The design graph whole on the routine form, with the controls an agent
 * put on it (Component Story Format 3, live components): the Controls face
 * beside the stage at a desk's width, and in the phone's drawer at half
 * height.
 */

import { ROUTINE_DIALS_GROUPED } from "./fixture";
import GraphBench from "./GraphBench.svelte";

export default {
  title: "Design graph/Bench",
  component: GraphBench,
  args: { dials: ROUTINE_DIALS_GROUPED, turned: { radius: 4 } },
};

/** The Controls face beside the stage, the corner radius turned to 4 px. */
export const DialsFace = {
  args: { face: "dials" },
  parameters: { viewport: 1440 },
};

/** In the phone's drawer, opened at half height under the drawing. */
export const DialsFacePhone = {
  name: "Controls face, phone",
  args: { face: "dials" },
  parameters: { viewport: 390 },
};

/** No controls: the room holds its states, its map and its animation. */
export const NoDials = { args: { dials: [] }, parameters: { viewport: 1440 } };
