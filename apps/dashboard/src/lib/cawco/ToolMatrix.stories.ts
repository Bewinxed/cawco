/**
 * Configure › Command-line tools' ledgers (Component Story Format 3, live):
 * the whole catalog over a fleet, ToolMatrix drawn from the machines'
 * statuses as the hub publishes them. The Antigravity CLI has its own
 * Google sign-in (core `ToolSpec.signin`), so its ledger carries a Sign-in
 * column. A sign-in under way, refused or lapsed lives in the tab, not in
 * a status: the bench at `/motion/tool-signin` draws those, and runs one.
 */
import { TOOL_CATALOG, TOOL_UPDATES_DEFAULT } from "@cawco/core/tools";
import ToolMatrix from "./ToolMatrix.svelte";
import {
  AGY_UNREAD,
  agyMissing,
  agyStatus,
  fleetMachine,
  signinFleet,
} from "./tool-signin-fixtures";

export default {
  component: ToolMatrix,
  args: {
    catalog: TOOL_CATALOG,
    policies: [],
    machines: signinFleet(),
    releases: {},
    updates: TOOL_UPDATES_DEFAULT,
  },
};

/** Eight machines, each a different sign-in state: missing, out, in, unknown, offline. */
export const EveryState = { args: {} };

/** Signed in everywhere it is installed: the quiet column, its count on the head. */
export const AllSignedIn = {
  args: {
    machines: [
      fleetMachine(
        "m-obelisk",
        "obelisk-of-light",
        "linux",
        agyStatus("signed-in")
      ),
      fleetMachine(
        "m-omar",
        "Omars-MacBook-Pro",
        "darwin",
        agyStatus("signed-in")
      ),
      fleetMachine("m-uwu", "uwucloud", "linux", agyStatus("signed-in")),
    ],
  },
};

/** Installed nowhere: the column stands empty and the head counts no sign-in. */
export const NotInstalled = {
  args: {
    machines: [
      fleetMachine("m-nifty", "niftybot.art", "linux", agyMissing),
      fleetMachine("m-uwu", "uwucloud", "linux", agyMissing),
    ],
  },
};

/** agy couldn't say: the Unknown badge, whose popover holds its words. */
export const Unknown = {
  args: {
    machines: [
      fleetMachine(
        "m-uwu",
        "uwucloud",
        "linux",
        agyStatus("unknown", AGY_UNREAD)
      ),
      fleetMachine(
        "m-obelisk",
        "obelisk-of-light",
        "linux",
        agyStatus("unknown")
      ),
    ],
  },
};

/** Every machine offline: states stand without their act. */
export const Offline = {
  args: {
    machines: [
      fleetMachine(
        "m-hangar",
        "hangar",
        "linux",
        agyStatus("signed-out"),
        false
      ),
      fleetMachine(
        "m-omar",
        "Omars-MacBook-Pro",
        "darwin",
        agyStatus("signed-in"),
        false
      ),
      fleetMachine(
        "m-uwu",
        "uwucloud",
        "linux",
        agyStatus("unknown", AGY_UNREAD),
        false
      ),
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
        agyStatus("signed-out")
      ),
    ],
  },
};
