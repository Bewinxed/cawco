/**
 * One option of the owner's pick on removals (the approval-card decision
 * page): the removal as the new card draws it, Approve and Deny at one
 * strength (The Peer Rule), its consequences read, never ticked. Its twin
 * with the gate is PromptGated.stories.ts. Deleted with whichever option
 * loses the pick.
 */
import { presentPermission } from "@cawco/core/permission-presentation";
import Prompt from "./Prompt.svelte";
import { ASKS, requestOf } from "./prompt-fixtures";

export default {
  title: "Transcript/Approval card, removal",
  component: Prompt,
  parameters: { viewport: 390 },
  args: {
    request: requestOf(ASKS.remove, presentPermission),
    asker: "the agent",
    shown: true,
    onanswer: () => null,
  },
};

/** A removal waiting: what it does after, and how long it can be undone. */
export const RemoveWaiting = { args: {} };
