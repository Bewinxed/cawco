/**
 * The kit's MachineRow (Component Story Format 3, live components), mounted
 * as itself: a machine online, away and off, and picked. The meta's args
 * are every story's; a story's own args are what it changes.
 */
import { IconLaptopAlt, IconServerSquare } from "#lib/icons.js";
import MachineRow from "./machine-row.svelte";

export default {
  title: "Kit/Machine row",
  component: MachineRow,
  args: {
    icon: IconServerSquare,
    hue: "var(--color-orange)",
    name: "obelisk-of-light",
    meta: "Linux · 3 sessions · home",
    presence: "online",
  },
};

/** A machine online and working. */
export const Online = {};

/** A laptop away from the network. */
export const Away = {
  args: {
    icon: IconLaptopAlt,
    hue: "var(--color-yellow)",
    name: "studio-mac",
    meta: "macOS · last seen 2 hours ago",
    presence: "away",
  },
};

/** A machine switched off. */
export const Off = {
  args: {
    hue: "var(--color-tx-2)",
    name: "nimbus-build-02",
    meta: "Linux · off since Tuesday",
    presence: "off",
  },
};

/** The machine picked for the new session. */
export const Picked = { args: { ink: true } };
