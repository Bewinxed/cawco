/**
 * The ticking stations (Option C): five rows, the live one open, Caw in the title's slot (design 6ddc57c4). Component Story Format 3, live: each story is
 * the one working tray, its buttons moving it as the person would and its
 * waiting states moving on as the hub would. Each picture opens held still
 * at Found it, the first step the person acts on (Join). The story's
 * control stands folded under the design, jumping the tray to any state,
 * network and failure cause.
 * Desk is the transcript-width page with Needs you's row (or Settings'
 * Set up); Phone is the same tray as the kit's bottom sheet at 390.
 */
import AddressTrayDesk from "./preview/AddressTrayDesk.svelte";
import AddressTrayPhone from "./preview/AddressTrayPhone.svelte";

export default {
  title: "Address tray/C · Stations that tick",
  component: AddressTrayDesk,
  args: { direction: "stations" },
};

/** On a desk: the Needs you row grows into the tray in place. */
export const Desk = { parameters: { viewport: 1440 } };

/** On a phone: the row opens the tray as the bottom sheet. */
export const Phone = {
  component: AddressTrayPhone,
  parameters: { viewport: 390 },
};
