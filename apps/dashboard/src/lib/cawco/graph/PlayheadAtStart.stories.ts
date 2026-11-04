/**
 * The decision page's first option on where the playhead rests after a
 * play (as built, his earlier answer): the move into "Hub didn't answer"
 * has played to its end, the stage shows the kept state, and the playhead
 * stands back at 0.
 */
import Face from "./MoveFace.stories";
import MoveFace from "./MoveFace.svelte";

export default {
  title: "Design graph/Animation/After a play, at its start",
  component: MoveFace,
  args: { ...Face.args, playhead: 0 },
  parameters: { viewport: 400 },
};

/** The play over: the time reads 0 while the stage stands at its end. */
export const RestsAtStart = {};
