/**
 * The cockpit project's Routines view as a lead and a ledger: what needs
 * him open in the leading column, every other outcome a line beside it
 * (Component Story Format 3, live components).
 */
import { hubAs } from "../hub-stand-in";
import Live from "./routines-view-live.svelte";

export default {
  title: "Routines/Lead and ledger",
  component: Live,
  args: { direction: "lead", hub: "takes" },
  decorators: [hubAs("connected")],
};

/** Sunday morning: the staging check's question and the migration check's failure lead; every other outcome is a line beside them. */
export const LeadAndLedger = {};
