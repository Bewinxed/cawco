/**
 * How a machine problem shows, as it does today: the whole machines symbol
 * in the status ink (its count gone, as with every option).
 */
import BarGroup from "./BarGroup.svelte";
import { ONE_DOWN, SIGN_IN } from "./fixtures";

export default {
  title: "Machine problem/The symbol tinted",
  component: BarGroup,
  args: { form: "desk", mark: "tint" },
  parameters: { viewport: 360 },
};

/** Desk: the Mac is down, the symbol in the fail ink. */
export const Down = { args: { machines: ONE_DOWN } };

/** Desk: the Mac needs a sign-in, the symbol in the attention ink. */
export const SignIn = { args: { machines: SIGN_IN } };
