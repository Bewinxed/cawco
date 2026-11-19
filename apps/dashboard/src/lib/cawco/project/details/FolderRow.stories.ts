/**
 * A folder's row on the card (my reading): its acts open under it, and the
 * Disconnect folder question in place.
 */
import DetailsCardStates from "./details-card-states.svelte";
import { presses } from "./plays";

export default {
  title: "Project details/A folder",
  component: DetailsCardStates,
  args: {
    situation: "all-well",
    view: "folder-open",
    answer: "yes",
    open: true,
    again: 0,
  },
  parameters: { viewport: 1024 },
};

const STUDIO_ROW = /studio-mac/u;
const DISCONNECT = /^Disconnect folder/u;
const MOVE_ACT = /^Move files/u;

/** My main folder's acts, each saying what it does. */
export const ActionsOpen = {};

/** Asked whether to disconnect the folder on studio-mac; its files stay where they are. */
export const DisconnectAsked = { args: { view: "disconnect" } };

/** I pressed Disconnect folder on studio-mac's row, and it asks first. */
export const DisconnectFromRow = {
  args: { view: "disconnect" },
  from: "ActionsOpen",
  play: presses(
    { role: "button", name: STUDIO_ROW, after: 500 },
    { role: "button", name: DISCONNECT, after: 600 }
  ),
};

/** I pressed Move files under my main folder, and the card became the step. */
export const MoveOpened = {
  args: { view: "move-empty" },
  from: "ActionsOpen",
  play: presses({ role: "button", name: MOVE_ACT, after: 600 }),
};
