/**
 * The board before setup as a calm scene as big as the board (decision page
 * `onboarding-design`, card `board-before`, option `scene`). A story's own
 * args are what it changes.
 */
import ProjectStart from "./ProjectStart.svelte";

export default {
  title: "Onboarding/Project start · the scene",
  component: ProjectStart,
  args: { beat: "drafting", wait: "steps", board: "empty" },
  parameters: { viewport: 1440 },
};

/** The setup page open: a calm scene as big as the board, his live self on its axis, his rests as pictures on the floor. */
export const BoardScene = { args: { beat: "page", board: "scene" } };

/** About 60 s, the scene while he drafts, his steps in the panel. */
export const BoardSceneWait = { args: { board: "scene" } };
