/**
 * The notifications ask (Component Story Format 3, live): what a browser
 * that was never asked shows as the dashboard loads, until it is answered
 * there. The real NotifyAsk in the toast's place (notify-ask-live), its
 * browser a mock: Allow waits for the prompt, then takes the answer the
 * dial names; Not now puts it away.
 */
import NotifyAskLive from "./notify-ask-live.svelte";

export default {
  title: "Presence/Notifications ask",
  component: NotifyAskLive,
  args: {
    asks: "Notifications",
    answer: "Allowed",
    phone: false,
    again: 0,
  },
};

/** The dashboard just opened in a browser that was never asked for notifications. */
export const Live = {};
