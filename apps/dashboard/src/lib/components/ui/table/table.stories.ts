/**
 * The kit's Table (Component Story Format 3, live components) in a frame of
 * its own (table-frame): a header band over the fleet's machines. The meta's
 * args are every story's.
 */
import TableFrame from "./table-frame.svelte";

export default {
  title: "Kit/Table",
  component: TableFrame,
  args: {
    label: "Machines",
    columns: ["Machine", "System", "Sessions", "Last seen"],
    rows: [
      ["obelisk-of-light", "Linux", "3", "Now"],
      ["studio-mac", "macOS", "0", "2 hours ago"],
      ["nimbus-build-02", "Linux", "1", "Now"],
    ],
  },
};

/** The fleet's machines. */
export const Machines = {};
