/**
 * One option of the owner's pick on removals (the approval-card decision
 * page): Approve held until each consequence of the removal is ticked, the
 * acknowledgement gate report 2 proposes. Drawn on the removal alone; its
 * twin without the gate is PromptRemoval.stories.ts. Deleted with whichever
 * option loses the pick.
 */
import { presentPermission } from "@cawco/core/permission-presentation";
import Prompt from "./Prompt.svelte";
import { ASKS, requestOf } from "./prompt-fixtures";

export default {
  title: "Transcript/Approval card, removal with the tick gate",
  component: Prompt,
  parameters: { viewport: 390 },
  args: {
    request: requestOf(ASKS.remove, presentPermission),
    asker: "the agent",
    shown: true,
    onanswer: () => null,
    acknowledge: true,
  },
};

/** A removal waiting: Approve stays off until each consequence is ticked. */
export const RemoveWaiting = { args: {} };
