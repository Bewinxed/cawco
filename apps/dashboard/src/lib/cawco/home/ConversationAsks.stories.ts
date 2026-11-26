/**
 * What waits on him, answered in the conversation it belongs to
 * (Component Story Format 3, live components; tsk-521). Caw's panel lists
 * each conversation with how many things wait in it, beside what no
 * conversation holds; a press opens the conversation with its newest ask up
 * on its composer, which holds only that conversation's asks and its
 * delegates'. The lane is needs-fixtures.ts, answered by
 * conversation-asks-live.svelte.
 */
import { hubAs } from "../hub-stand-in";
import ConversationAsksLive from "./conversation-asks-live.svelte";

export default {
  title: "Needs you/Asks in their conversation",
  component: ConversationAsksLive,
  args: { shows: "s-antigravity", panel: false, again: 0 },
  decorators: [hubAs("connected")],
  parameters: { viewport: "desk" },
};

/** In the build's conversation: its delegate's question up on the composer, its two page cards behind it. */
export const InConversation = {};

/** Caw's panel open: each conversation with how many wait in it, a machine that stopped answering, a task in review. */
export const PanelOpen = { args: { panel: true } };

/** The dark pass pressed from the panel: its conversation open with its design pick up, nothing of the build's. */
export const DesignPicked = {
  args: { start: "conversation:s-dark-pass" },
};

/** The routines conversation pressed: the question on its page's pin, up on its composer. */
export const PinQuestion = {
  args: { start: "conversation:s-ask-routine-failures" },
};

/** A permission's conversation pressed: Approve and Deny on its composer. */
export const Permission = {
  args: { start: "conversation:s-ask-check" },
};
