/**
 * How a machine problem shows, the recommended answer: an exclamation badge
 * on the machines symbol's lower-trailing corner, the symbol in the group's
 * muted ink.
 */
import BarGroup from "./BarGroup.svelte";
import { ONE_DOWN, SIGN_IN } from "./fixtures";

export default {
  title: "Machine problem/A badge",
  component: BarGroup,
  args: { form: "desk", mark: "badge" },
  parameters: { viewport: 360 },
};

/** Desk: the Mac is down, the badge in the fail ink. */
export const Down = { args: { machines: ONE_DOWN } };

/** Desk: the Mac needs a sign-in, the badge in the attention ink. */
export const SignIn = { args: { machines: SIGN_IN } };
