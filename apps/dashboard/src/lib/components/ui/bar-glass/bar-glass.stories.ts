/**
 * The top bar's glass (Component Story Format 3, live components): the kit's
 * BarGlass in a `shell` container frame (bar-glass-frame), with a stand-in
 * head where Caw's stands and no store read. Its form is the frame's width,
 * not the page's: the desk capsule at 1440, Caw's own glass at 390. Then a
 * head's floating group (bar-group-frame), each story a set of controls
 * standing in its glass, so the canvas forces hover, pressed and focus on
 * each item in its place: the corners facing the glass's ends take its
 * radius less the pad, those facing a neighbour the small one. The meta's
 * args are every story's; a story's own args are what it changes.
 */
import BarGlassFrame from "./bar-glass-frame.svelte";
import BarGroupFrame from "./bar-group-frame.svelte";

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

/** The phone's glass at rest: the head alone, on his own glass the bar's margin in from the edge. */
export const Phone = { args: { width: 390 }, parameters: { viewport: 390 } };

/** The phone's glass with a card hanging from it: the join runs down the neck. */
export const PhoneJoined = {
  args: { width: 390, joined: true },
  parameters: { viewport: 390 },
};

/** A group of three: the leading item round on its leading side, the middle one small-cornered, the trailing one round on its trailing side. */
export const GroupOfThree = {
  component: BarGroupFrame,
  args: { holds: "three" },
  parameters: { viewport: 1440 },
};

/** The group of three on a phone. */
export const GroupOfThreePhone = {
  component: BarGroupFrame,
  args: { width: 390, holds: "three" },
  parameters: { viewport: 390 },
};

/** The group with its middle item on: the selected wash in the middle's shape. */
export const Selected = {
  component: BarGroupFrame,
  args: { holds: "selected" },
  parameters: { viewport: 1440 },
};

/** A counted item at rest: its neighbour's size, its bubble centred, 5 on its corner. */
export const Counted = {
  component: BarGroupFrame,
  args: { holds: "counted", count: 5 },
  parameters: { viewport: 1440 },
};

/** The counted item on: the selected wash, the badge still clear of the bubble. */
export const CountedOn = {
  component: BarGroupFrame,
  args: { holds: "counted", count: 5, pressed: true },
  parameters: { viewport: 1440 },
};

/** A count of 150: the badge grows toward the trailing side, the item keeps its size. */
export const CountedMany = {
  component: BarGroupFrame,
  args: { holds: "counted", count: 150 },
  parameters: { viewport: 1440 },
};

/** 150 with the item on. */
export const CountedManyOn = {
  component: BarGroupFrame,
  args: { holds: "counted", count: 150, pressed: true },
  parameters: { viewport: 1440 },
};

/** The counted item on a phone at rest. */
export const CountedPhone = {
  component: BarGroupFrame,
  args: { width: 390, holds: "counted", count: 5 },
  parameters: { viewport: 390 },
};

/** The counted item on, on a phone. */
export const CountedOnPhone = {
  component: BarGroupFrame,
  args: { width: 390, holds: "counted", count: 5, pressed: true },
  parameters: { viewport: 390 },
};

/** 150 on a phone. */
export const CountedManyPhone = {
  component: BarGroupFrame,
  args: { width: 390, holds: "counted", count: 150 },
  parameters: { viewport: 390 },
};

/** 150 with the item on, on a phone. */
export const CountedManyOnPhone = {
  component: BarGroupFrame,
  args: { width: 390, holds: "counted", count: 150, pressed: true },
  parameters: { viewport: 390 },
};

/** The group with its middle item on, on a phone. */
export const SelectedPhone = {
  component: BarGroupFrame,
  args: { width: 390, holds: "selected" },
  parameters: { viewport: 390 },
};

/** The mode switch alone in its glass: a capsule track, the chosen glyph on a capsule thumb. */
export const ModeSwitch = {
  component: BarGroupFrame,
  args: { holds: "mode" },
  parameters: { viewport: 1440 },
};

/** A kit Button, Toggle and Tabs list standing in one glass: each takes its place's corners. */
export const KitInGlass = {
  component: BarGroupFrame,
  args: { holds: "kit" },
  parameters: { viewport: 1440 },
};

/** The mode switch on a phone. */
export const ModeSwitchPhone = {
  component: BarGroupFrame,
  args: { width: 390, holds: "mode" },
  parameters: { viewport: 390 },
};

/** The kit's parts in one glass on a phone. */
export const KitInGlassPhone = {
  component: BarGroupFrame,
  args: { width: 390, holds: "kit" },
  parameters: { viewport: 390 },
};
