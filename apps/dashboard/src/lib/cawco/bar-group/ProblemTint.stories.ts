/**
 * How a machine problem shows, the alternative: the whole machines symbol
 * in the status ink, the way today's bar shows it, without its number.
 */
import BarGroup from "./BarGroup.svelte";
import { ONE_DOWN, SIGN_IN } from "./fixtures";

export default {
  title: "Machine problem/The symbol tinted",
  component: BarGroup,
  args: { form: "desk", mark: "tint" },
  parameters: { viewport: 260 },
};

/** Desk: the Mac is down, the symbol in the fail ink. */
export const Down = { args: { machines: ONE_DOWN } };

/** Desk: the Mac needs a sign-in, the symbol in the attention ink. */
export const SignIn = { args: { machines: SIGN_IN } };
