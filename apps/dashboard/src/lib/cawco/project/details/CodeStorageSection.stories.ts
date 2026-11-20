/**
 * Codebases and big files at the card's foot (my reading): a custom
 * location typed, and the hub refusing it.
 */
import DetailsCardStates from "./details-card-states.svelte";
import { presses } from "./plays";

export default {
  title: "Project details/Codebases and big files",
  component: DetailsCardStates,
  args: {
    situation: "all-well",
    view: "card",
    answer: "yes",
    open: true,
    again: 0,
  },
  parameters: { viewport: 1024 },
};

const CUSTOM = /Custom location/u;

/** The connected codebase beside big file storage. */
export const Open = {};

/** An address typed for a custom location, no sign-in picked yet, so Save waits. */
export const AddressTyped = { args: { view: "big-draft" } };

/** files.acme.dev refused the key, and the address I typed is still there. */
export const Refused = { args: { view: "big-refused" } };

/** I pressed Custom location: its address and sign-ins open under it, nothing changed yet. */
export const CustomPressed = {
  args: { view: "big-draft" },
  from: "Open",
  play: presses({ role: "radio", name: CUSTOM, after: 700 }),
};
