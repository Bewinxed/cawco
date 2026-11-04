/**
 * The decision page's second option on where the playhead rests after a
 * play: the move into "Hub didn't answer" has played to its end, the stage
 * shows the kept state, and the playhead stays on the move's end over it;
 * Play goes round again from 0.
 */
import Face from "./MoveFace.stories";
import MoveFace from "./MoveFace.svelte";

export default {
  title: "Design graph/Animation/After a play, at its end",
  component: MoveFace,
  args: { ...Face.args, playhead: 886 },
  parameters: { viewport: 400 },
};

/** The play over: the time reads the move's length, the playhead on its end, over the stage at its end. */
export const RestsAtEnd = {};
