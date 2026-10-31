/**
 * The top bar's glass (Component Story Format 3, live components): the kit's
 * BarGlass in a `shell` container frame (bar-glass-frame), with a stand-in
 * head where Caw's stands and no store read. Its form is the frame's width,
 * not the page's: the desk capsule at 1440, Caw's tucked tab at 390. The
 * meta's args are every story's; a story's own args are what it changes.
 */
import BarGlassFrame from "./bar-glass-frame.svelte";

export default {
  title: "Kit/Bar glass",
  component: BarGlassFrame,
  args: { width: 1440, joined: false },
};

/** The desk's glass at rest: a capsule holding Jump, the machines and the head. */
export const Desk = { args: {}, parameters: { viewport: 1440 } };

/** The desk's glass with a card hanging from it: its join drawn, the foot flared. */
export const DeskJoined = {
  args: { joined: true },
  parameters: { viewport: 1440 },
};

/** The phone's glass at rest: the head alone, on a tab tucked into the edge. */
export const Phone = { args: { width: 390 }, parameters: { viewport: 390 } };

/** The phone's glass with a card hanging from it: the join runs down the neck. */
export const PhoneJoined = {
  args: { width: 390, joined: true },
  parameters: { viewport: 390 },
};
