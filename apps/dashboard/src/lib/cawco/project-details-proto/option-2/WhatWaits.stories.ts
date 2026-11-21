/**
 * What needs you, read alone at the page's width: the deciders' cards with
 * the kinds each holds, the review switch, and the rules file that did not
 * load.
 */

import { shellFrame } from "./shell-seed";
import { REFUSED_WORDS, stageArgs } from "./stage-args";
import WhatWaits from "./WhatWaits.svelte";

export default {
  ...shellFrame,
  title: "What needs you",
  component: WhatWaits,
  args: stageArgs("At rest"),
};

/** Two kinds are set here; the rest follow my defaults. */
export const TwoCustom = {};

/** The rules file did not load, so every call comes to me. */
export const RulesDidNotLoad = { args: stageArgs("Who decides unreadable") };

/** The server refused my review switch and put it back. */
export const ReviewRefused = {
  args: stageArgs("At rest", { review: REFUSED_WORDS }),
};
