import Approval from "./Approval.svelte";

export default { title: "Kit/Approval", component: Approval };

/** The card with no width of its own: a size container shrinks to the frame's floor. */
export const Unsized = { args: { title: "Approve the deploy" } };

/** The same card at a phone's width. */
export const Phone = {
  args: { title: "Approve the deploy" },
  parameters: { viewport: "phone" },
};
