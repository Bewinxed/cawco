/**
 * How a machine problem shows, the recommended answer: a badge on the
 * machines symbol's lower-trailing corner, a cross when a machine is down
 * and an exclamation mark when one needs attention, the symbol in the
 * group's muted ink.
 */
import BarGroup from "./BarGroup.svelte";
import { ONE_DOWN, SIGN_IN } from "./fixtures";

export default {
  title: "Machine problem/A badge",
  component: BarGroup,
  args: { form: "desk", mark: "badge" },
  parameters: { viewport: 260 },
};

/** Desk: the Mac is down, a cross badge in the fail ink. */
export const Down = { args: { machines: ONE_DOWN } };

/** Desk: the Mac needs a sign-in, an exclamation badge in the attention ink. */
export const SignIn = { args: { machines: SIGN_IN } };
