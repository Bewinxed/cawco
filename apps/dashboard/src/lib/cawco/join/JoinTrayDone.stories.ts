/**
 * The done moment's emphasis on Connect a machine (Component Story Format
 * 3, live components): the designer's three answers, each playing its own
 * sequence on the live tray as it is drawn (the fixture's `replay`): the
 * service step, then the join, at the desk and on the phone. The rail
 * closing into one done bar with Caw's done loop once beside the name; the
 * rail alone; or the joined row flying out of the closing tray into the
 * machines list.
 */
import JoinTrayFrame from "./preview/JoinTrayFrame.svelte";

export default {
  title: "Connect a machine/The done moment",
  component: JoinTrayFrame,
  args: { layout: "desk", way: "ssh", replay: "join" },
};

/** One done bar, and Caw's done loop once beside the name. */
export const BarAndCaw = {
  args: { taste: { done: "caw" } },
  parameters: { viewport: 640 },
};
/** One done bar and Caw, on the phone. */
export const BarAndCawPhone = {
  args: { layout: "phone", taste: { done: "caw" } },
  parameters: { viewport: 390 },
};

/** The rail alone closes into one done bar, no Caw. */
export const BarAlone = {
  args: { taste: { done: "rail" } },
  parameters: { viewport: 640 },
};
/** The bar alone, on the phone. */
export const BarAlonePhone = {
  args: { layout: "phone", taste: { done: "rail" } },
  parameters: { viewport: 390 },
};

/** The joined row flies out of the closing tray into the machines list. */
export const IntoTheList = {
  args: { taste: { done: "flight" } },
  parameters: { viewport: 640 },
};
/** The flight, on the phone: the list above the sheet. */
export const IntoTheListPhone = {
  args: { layout: "phone", taste: { done: "flight" } },
  parameters: { viewport: 390 },
};
