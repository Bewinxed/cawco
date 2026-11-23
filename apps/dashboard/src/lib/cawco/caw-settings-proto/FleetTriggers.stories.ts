/**
 * The fleet's defaults for each kind of trigger, in the fleet's Settings
 * (Component Story Format 3, live components): the section on a stand-in
 * hub (fleet-triggers-live). Set a kind's own values or put it back to
 * each project's Caw; the dials set what the hub does with a change and
 * what the fleet starts with. The meta's `beforeEach` feeds the machines
 * and the accounts through their stores' own writers.
 */

import { seedStores } from "./caw-settings-play";
import FleetTriggersLive from "./fleet-triggers-live.svelte";

export default {
  title: "Configure/Triggers",
  component: FleetTriggersLive,
  args: { answer: "accepts", cleared: false, reading: false, again: 0 },
  beforeEach: seedStores,
};

/** Comments run on Sonnet in Accept edits fleet-wide; routine results set their mode; the rest are each project's Caw's. */
export const Defaults = {};

/** Nothing set fleet-wide: every kind runs as each project's Caw. */
export const NothingSet = { args: { cleared: true } };

/** The fleet's settings not read yet: the section holds its place. */
export const Reading = { args: { reading: true } };
