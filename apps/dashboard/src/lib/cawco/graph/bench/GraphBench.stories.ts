/**
 * The design graph whole on the routine form, with the dials an agent put
 * on it (Component Story Format 3, live components): where the dials open,
 * in each of the two places the owner picks between (tsk-198's view
 * switch), at a desk's width and in a phone's.
 */

import { ROUTINE_DIALS } from "./fixture";
import GraphBench from "./GraphBench.svelte";

export default {
  title: "Design graph/Bench",
  component: GraphBench,
  args: { dials: ROUTINE_DIALS, turned: { radius: 4 } },
};

/** The dials as a face of the room, beside the stage, one radius turned. */
export const DialsFace = {
  args: { dialsAt: "face", face: "dials" },
  parameters: { viewport: 1440 },
};

export const DialsFacePhone = {
  args: { dialsAt: "face", face: "dials" },
  parameters: { viewport: 390 },
};

/** The dials hung from a glyph in the bar's glass, opened, one radius turned. */
export const DialsCard = {
  args: { dialsAt: "glass", face: "dials" },
  parameters: { viewport: 1440 },
};

export const DialsCardPhone = {
  args: { dialsAt: "glass", face: "dials" },
  parameters: { viewport: 390 },
};

/** No dials: the room holds its states and its map, the bar no dials glyph. */
export const NoDials = { args: { dials: [] }, parameters: { viewport: 1440 } };
