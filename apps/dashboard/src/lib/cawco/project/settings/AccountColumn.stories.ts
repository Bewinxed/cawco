/**
 * Account & usage limits, read alone: the account field and what its sessions do at its limit.
 */

import AccountColumn from "./AccountColumn.svelte";
import { inSettingsCard } from "./section-frame";
import { shellFrame } from "./shell-seed";
import { stageArgs } from "./stage-args";

export default {
  ...shellFrame,
  decorators: [inSettingsCard("account")],
  title: "Account & usage limits",
  component: AccountColumn,
  args: stageArgs("At rest"),
};

/** Studio Max named, with its room; agents wait at its limit. */
export const Named = {};

/** The named account is signed out everywhere. */
export const SignedOut = { args: stageArgs("Named account signed out") };
