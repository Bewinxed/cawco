/**
 * Configure › Command-line tools' ledgers (Component Story Format 3, live):
 * the whole catalog over a fleet, ToolMatrix drawn from the machines'
 * statuses as the hub publishes them.
 */
import { TOOL_CATALOG, TOOL_UPDATES_DEFAULT } from "@cawco/core/tools";
import ToolMatrix from "./ToolMatrix.svelte";
import {
  agyInstalled,
  agyMissing,
  fleetMachine,
  toolFleet,
} from "./tool-fixtures";

export default {
  component: ToolMatrix,
  args: {
    catalog: TOOL_CATALOG,
    policies: [],
    machines: toolFleet(),
    releases: {},
    updates: TOOL_UPDATES_DEFAULT,
  },
};

/** Eight machines: the CLI missing on two, one offline. */
export const Fleet = { args: {} };

/** Installed nowhere. */
export const NotInstalled = {
  args: {
    machines: [
      fleetMachine("m-nifty", "niftybot.art", "linux", agyMissing),
      fleetMachine("m-uwu", "uwucloud", "linux", agyMissing),
    ],
  },
};

/** Every machine offline: states stand without their act. */
export const Offline = {
  args: {
    machines: [
      fleetMachine("m-hangar", "hangar", "linux", agyInstalled, false),
      fleetMachine(
        "m-omar",
        "Omars-MacBook-Pro",
        "darwin",
        agyInstalled,
        false
      ),
      fleetMachine("m-uwu", "uwucloud", "linux", agyInstalled, false),
    ],
  },
};

/** One machine, its name the longest a fleet holds. */
export const OneMachine = {
  args: {
    machines: [
      fleetMachine(
        "m-ledger",
        "ledger-build-runner-eu-west-3.internal",
        "linux",
        agyInstalled
      ),
    ],
  },
};

/** Every harness the machines report is one this hub runs, so nothing is said under the ledgers. */
export const NoUnknownHarness = {
  args: {
    machines: [
      fleetMachine("m-obelisk", "obelisk-of-light", "linux", agyInstalled),
      fleetMachine("m-uwu", "uwucloud", "linux", agyInstalled),
    ],
  },
};

/** obelisk-of-light reports goose, which this hub can't run. */
export const OneUnknownHarness = {
  args: {
    machines: [
      {
        ...fleetMachine("m-obelisk", "obelisk-of-light", "linux", agyInstalled),
        unknownHarnesses: ["goose"],
      },
      fleetMachine("m-uwu", "uwucloud", "linux", agyInstalled),
    ],
  },
};

/** Two machines report harnesses this hub can't run, one of them three with long names. */
export const ManyUnknownHarnesses = {
  args: {
    machines: [
      {
        ...fleetMachine(
          "m-ledger",
          "ledger-build-runner-eu-west-3.internal",
          "linux",
          agyInstalled
        ),
        unknownHarnesses: [
          "cursor-agent-headless-preview",
          "gemini-cli-enterprise-workspace",
          "amazon-q-developer-terminal",
        ],
      },
      {
        ...fleetMachine("m-omar", "Omars-MacBook-Pro", "darwin", agyInstalled),
        unknownHarnesses: ["goose"],
      },
    ],
  },
};
