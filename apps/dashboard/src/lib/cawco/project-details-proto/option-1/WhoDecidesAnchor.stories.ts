/**
 * Who decides, beside what waits on the person (WhoDecidesAnchor): the
 * project's standing, which opens its rule in Decisions.
 */
import { HYUCKSFIELD } from "./fixtures";
import { followingFleet, partArgs } from "./states-args";
import WhoDecidesAnchor from "./WhoDecidesAnchor.svelte";

export default {
  title: "Project details/Option 1: Who decides",
  component: WhoDecidesAnchor,
  args: partArgs(),
};

/** One kind of choice is settled the project's own way, and finished work waits for me. */
export const OwnRule = {};

/** It follows the fleet on every kind of choice. */
export const FollowsFleet = { args: { record: followingFleet(HYUCKSFIELD) } };

/** Its rule file does not read, so every choice comes to me. */
export const Unreadable = { args: partArgs("Its rule file does not read") };

/** Who decides is still being read. */
export const Reading = { args: partArgs("Still reading") };
