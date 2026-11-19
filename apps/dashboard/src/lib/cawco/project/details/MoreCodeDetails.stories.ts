/**
 * More code details at the card's foot (my reading): open, a custom
 * location typed, and the hub refusing it.
 */
import DetailsCardStates from "./details-card-states.svelte";
import { presses } from "./plays";

export default {
  title: "Project details/More code details",
  component: DetailsCardStates,
  args: {
    situation: "all-well",
    view: "more-open",
    answer: "yes",
    open: true,
    again: 0,
  },
  parameters: { viewport: 1024 },
};

const MORE = /More code details/u;
const CUSTOM = /Custom location/u;

/** The code details open: the connected codebase beside big file storage. */
export const Open = {};

/** An address typed for a custom location, no sign-in picked yet, so Save waits. */
export const AddressTyped = { args: { view: "big-draft" } };

/** files.acme.dev refused the key, and the address I typed is still there. */
export const Refused = { args: { view: "big-refused" } };

/** I pressed More code details on the closed card and it opened in place. */
export const Opened = {
  from: "Closed",
  play: presses({ role: "button", name: MORE, after: 700 }),
};

/** The closed row still says the codebase and where big files are kept. */
export const Closed = { args: { view: "card" } };

/** I pressed Custom location: its address and sign-ins open under it, nothing changed yet. */
export const CustomPressed = {
  args: { view: "big-draft" },
  from: "Open",
  play: presses({ role: "radio", name: CUSTOM, after: 700 }),
};
