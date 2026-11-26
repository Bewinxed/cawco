/**
 * What waits on him, answered in the conversation he is in, each ask
 * waiting folded on the composer's bar (Component Story Format 3, live
 * components; shaping tsk-521). The project's conversation with Caw, its
 * composer, the cards, Caw's panel and its rows are the product's; the lane
 * is needs-fixtures.ts, answered by chat-asks-live.svelte.
 */
import { hubAs } from "../hub-stand-in";
import ChatAsksLive from "./chat-asks-live.svelte";

export default {
  title: "Needs you/Asks folded in the chat",
  component: ChatAsksLive,
  args: { where: "chat", panel: false, again: 0 },
  decorators: [hubAs("connected")],
  parameters: { viewport: "desk" },
};

/** In the project's chat: the newest ask from elsewhere waits folded on the composer's bar, the rest behind it. */
export const Folded = {};

/** Caw's panel open over the chat: the short list of what waits; a press on a row brings it up here. */
export const PanelOpen = { args: { panel: true } };

/** On a page with no conversation, the panel open: a press on a row takes him to his last chat with it up. */
export const NoChat = { args: { where: "none", panel: true } };

/** The billing page's first card brought up from the panel: the question, its options with what each gets and costs, and Other. */
export const CardUp = { args: { start: "artifact:antigravity-billing" } };
