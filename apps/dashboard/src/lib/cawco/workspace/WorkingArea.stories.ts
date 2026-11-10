/**
 * The working area whole (Component Story Format 3, live components): the
 * tabs, the transcript, the preview panel beside it and what the panel shows,
 * real components on placeholder data. The panel's comments are six on the
 * ask in the composer: one waiting on him, three open, two resolved.
 * Everything in it is live: its menus, cards and modes open as they do in
 * the app.
 */
import { canvasPath } from "@cawco/core/stage";
import WorkingAreaFrame from "./fixtures/WorkingAreaFrame.svelte";

export default {
  title: "Workspace/Working area",
  component: WorkingAreaFrame,
  parameters: { viewport: "desk" },
};

/** The preview holds a component whose states play their moves, standing at one the tray moves into: ▶ plays it. */
export const WithMoves = {
  args: {
    path: canvasPath(["src/lib/cawco/StopTrayPick.stories.ts"], {}),
    artifactName: "Pick what stops",
    ask: "Off title desk",
  },
};

export const AtWork = {};
