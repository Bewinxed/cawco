/**
 * What needs you, read alone at the page's width: the deciders' cards with
 * the kinds each holds, marking tasks done among them, and the rules file
 * that did not load.
 */

import { inSettingsCard } from "./section-frame";
import { shellFrame } from "./shell-seed";
import { REFUSED_WORDS, stageArgs } from "./stage-args";
import WhatWaits from "./WhatWaits.svelte";

export default {
  ...shellFrame,
  decorators: [inSettingsCard("waits")],
  title: "What needs you",
  component: WhatWaits,
  args: stageArgs("At rest"),
};

/** Two kinds are set here; the rest follow my defaults. */
export const TwoCustom = {};

/** The rules file did not load, so every call comes to me. */
export const RulesDidNotLoad = { args: stageArgs("Who decides unreadable") };

/** The server refused handing marking tasks done to Caw and put it back. */
export const DoneHandOverRefused = {
  args: stageArgs("At rest", { "decides.done": REFUSED_WORDS }),
};
