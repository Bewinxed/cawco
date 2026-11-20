/**
 * The account on Caw's seat (AccountAnchor): the account hyucksfield's
 * sessions start on, as the bar shows it; a press opens every account, and
 * what a pick waits for or is refused with stands in that popover.
 */
import AccountAnchor from "./AccountAnchor.svelte";
import { partArgs } from "./states-args";

export default {
  title: "Project details/Option 1: Account",
  component: AccountAnchor,
  args: partArgs(),
};

/** Its sessions start on Studio Max. */
export const Named = {};

/** Studio Max is signed out on every machine, so nothing in the project can start. */
export const SignedOut = { args: partArgs("Its account is signed out") };
