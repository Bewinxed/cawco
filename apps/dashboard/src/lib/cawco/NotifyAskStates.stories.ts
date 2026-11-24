/**
 * Every state of the notifications ask (Component Story Format 3): the
 * real NotifyAsk in the toast's place (notify-ask-live), each where the
 * person meets it.
 */
import NotifyAskLive from "./notify-ask-live.svelte";

export default {
  title: "Presence/Notifications ask, every state",
  component: NotifyAskLive,
  args: {
    asks: "Notifications",
    answer: "Allowed",
    phone: false,
    again: 0,
  },
};

/** Asked for notifications as the dashboard opens. */
export const Asking = {};

/** Asked for notifications and whether I'm at this computer. */
export const AskingPresence = { args: { asks: "Notifications and presence" } };

/** Asked for notifications and to let the agent on this computer say when I'm here. */
export const AskingAgent = { args: { asks: "Notifications and the agent" } };

/** Asked on my phone. */
export const OnPhone = { args: { phone: true } };

/** Waiting for the browser's own prompt. */
export const Allowing = { args: { start: "allowing" } };

/** The browser blocks notifications, and says where to turn them on. */
export const Blocked = { args: { start: "refused" } };

/** Allowed: notifications show here now. */
export const Allowed = { args: { start: "done" } };
