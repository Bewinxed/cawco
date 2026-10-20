/**
 * The phone under either way of showing a machine problem: Caw alone on his
 * tab (the machines are not in the phone's bar), and the sidebar's machines,
 * whose rows already say which one is down.
 */
import BarGroup from "./BarGroup.svelte";
import { ONE_DOWN } from "./fixtures";
import SidebarMachines from "./SidebarMachines.svelte";

export default {
  title: "Machine problem/On the phone",
  component: BarGroup,
  args: { form: "phone" },
  parameters: { viewport: "phone" },
};

/** Phone: Caw alone on his tab at the screen's trailing edge. */
export const Caw = {};

/** Phone: the sidebar's machines with the Mac down. */
export const Machines = {
  component: SidebarMachines,
  args: { machines: ONE_DOWN },
};
