/**
 * The top bar's glass (Component Story Format 3, live components): the kit's
 * BarGlass in a `shell` container frame (bar-glass-frame), with a stand-in
 * head where Caw's stands and no store read. Its form is the frame's width,
 * not the page's: the desk capsule at 1440, Caw's own glass at 390. Then a
 * head's floating group (bar-group-frame), each story a set of controls
 * standing in its glass, so the canvas forces hover, pressed and focus on
 * each item in its place: the corners facing the glass's ends take its
 * radius less the pad, those facing a neighbour the small one. Then a
 * menu opened from a glass's item (bar-menu-frame), drawn at whatever
 * width the canvas picks: risen out of the top of a glass floating over a
 * drawing's foot, short and long, and hung from one over its top beside
 * them. The meta's args are every story's; a story's own args are what it
 * changes.
 */
import BarGlassFrame from "./bar-glass-frame.svelte";
import BarGroupFrame from "./bar-group-frame.svelte";
import BarMenuFrame from "./bar-menu-frame.svelte";

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

/** The group with its middle item on, on a phone. */
export const SelectedPhone = {
  component: BarGroupFrame,
  args: { width: 390, holds: "selected" },
  parameters: { viewport: 390 },
};

/** The mode switch alone in its glass, Comment chosen: the glass is the switch, each segment a bar item, the chosen one in the selected wash. */
export const ModeSwitch = {
  component: BarGroupFrame,
  args: { holds: "mode", chosen: "comment" },
  parameters: { viewport: 1440 },
};

/** The mode switch on a phone, Comment chosen: each segment a finger's 44px wide. */
export const ModeSwitchPhone = {
  component: BarGroupFrame,
  args: { width: 390, holds: "mode", chosen: "comment" },
  parameters: { viewport: 390 },
};

/** The mode switch with its first segment chosen: the wash on the glass's leading end. */
export const ModeSwitchFirst = {
  component: BarGroupFrame,
  args: { holds: "mode", chosen: "interact" },
  parameters: { viewport: 1440 },
};

/** A toolbar: four bar items in one glass, the mode switch in its own, the two capsules a group's gap apart. */
export const Toolbar = {
  component: BarGroupFrame,
  args: { holds: "toolbar", chosen: "interact" },
  parameters: { viewport: 1440 },
};

/** The toolbar on a phone. */
export const ToolbarPhone = {
  component: BarGroupFrame,
  args: { width: 390, holds: "toolbar", chosen: "interact" },
  parameters: { viewport: 390 },
};

/** A kit Button and Toggle standing in one glass: each takes its place's corners. */
export const KitInGlass = {
  component: BarGroupFrame,
  args: { holds: "kit" },
  parameters: { viewport: 1440 },
};

/** The kit's parts in one glass on a phone. */
export const KitInGlassPhone = {
  component: BarGroupFrame,
  args: { width: 390, holds: "kit" },
  parameters: { viewport: 390 },
};

/** A count of 4, at rest: the item its neighbour's size, the badge on its glyph's top trailing corner, inside the glass. */
export const Counted4 = {
  component: BarGroupFrame,
  args: { holds: "counted", count: 4 },
  parameters: { viewport: 1440 },
};

/** A count of 4, at rest on a phone. */
export const Counted4Phone = {
  component: BarGroupFrame,
  args: { width: 390, holds: "counted", count: 4 },
  parameters: { viewport: 390 },
};

/** A count of 4, the item on. */
export const Counted4On = {
  component: BarGroupFrame,
  args: { holds: "counted", count: 4, pressed: true },
  parameters: { viewport: 1440 },
};

/** A count of 4, the item on, on a phone. */
export const Counted4OnPhone = {
  component: BarGroupFrame,
  args: { width: 390, holds: "counted", count: 4, pressed: true },
  parameters: { viewport: 390 },
};

/** A count of 42, at rest: the item its neighbour's size, the badge on its glyph's top trailing corner, inside the glass. */
export const Counted42 = {
  component: BarGroupFrame,
  args: { holds: "counted", count: 42 },
  parameters: { viewport: 1440 },
};

/** A count of 42, at rest on a phone. */
export const Counted42Phone = {
  component: BarGroupFrame,
  args: { width: 390, holds: "counted", count: 42 },
  parameters: { viewport: 390 },
};

/** A count of 42, the item on. */
export const Counted42On = {
  component: BarGroupFrame,
  args: { holds: "counted", count: 42, pressed: true },
  parameters: { viewport: 1440 },
};

/** A count of 42, the item on, on a phone. */
export const Counted42OnPhone = {
  component: BarGroupFrame,
  args: { width: 390, holds: "counted", count: 42, pressed: true },
  parameters: { viewport: 390 },
};

/** A count of 100, at rest: the item its neighbour's size, the badge on its glyph's top trailing corner, inside the glass. */
export const Counted100 = {
  component: BarGroupFrame,
  args: { holds: "counted", count: 100 },
  parameters: { viewport: 1440 },
};

/** A count of 100, at rest on a phone. */
export const Counted100Phone = {
  component: BarGroupFrame,
  args: { width: 390, holds: "counted", count: 100 },
  parameters: { viewport: 390 },
};

/** A count of 100, the item on. */
export const Counted100On = {
  component: BarGroupFrame,
  args: { holds: "counted", count: 100, pressed: true },
  parameters: { viewport: 1440 },
};

/** A count of 100, the item on, on a phone. */
export const Counted100OnPhone = {
  component: BarGroupFrame,
  args: { width: 390, holds: "counted", count: 100, pressed: true },
  parameters: { viewport: 390 },
};

/** A count of 4812, at rest: the item its neighbour's size, the badge on its glyph's top trailing corner, inside the glass. */
export const Counted4812 = {
  component: BarGroupFrame,
  args: { holds: "counted", count: 4812 },
  parameters: { viewport: 1440 },
};

/** A count of 4812, at rest on a phone. */
export const Counted4812Phone = {
  component: BarGroupFrame,
  args: { width: 390, holds: "counted", count: 4812 },
  parameters: { viewport: 390 },
};

/** A count of 4812, the item on. */
export const Counted4812On = {
  component: BarGroupFrame,
  args: { holds: "counted", count: 4812, pressed: true },
  parameters: { viewport: 1440 },
};

/** A count of 4812, the item on, on a phone. */
export const Counted4812OnPhone = {
  component: BarGroupFrame,
  args: { width: 390, holds: "counted", count: 4812, pressed: true },
  parameters: { viewport: 390 },
};

/** The pages of a long design, for the menus that open from a glass. */
const PAGES = [
  { words: "Onboarding: welcome and sign-in" },
  { words: "Onboarding: pick your machines" },
  { words: "Board: every session across the fleet" },
  { words: "Board: a project's tasks, grouped by stage" },
  { words: "Session: the transcript with its tool calls folded" },
  { words: "Session: a permission waiting on the phone" },
  { words: "Artifact panel: a drawing with its comments" },
  { words: "Artifact panel: two versions compared side by side" },
  { words: "Caw's card: the decisions waiting on you" },
  { words: "Settings: accounts, harnesses and routing" },
  { words: "Settings: notifications and the phone's push" },
  { words: "Empty states: no machines joined yet" },
];

/** The drawing's tools floating over its foot, their short menu risen out of the glass's top. */
export const MenuRisesShort = {
  component: BarMenuFrame,
  args: {
    stands: "foot",
    label: "Mode",
    width: "compact",
    rows: [
      { words: "Interact", keys: "V" },
      { words: "Comment", keys: "C" },
      { words: "Draw", keys: "D" },
    ],
  },
};

/** The drawing's tools at its foot with a long list of pages risen out of them, every row readable. */
export const MenuRisesLong = {
  component: BarMenuFrame,
  args: { stands: "foot", label: "Pages", rows: PAGES, width: "wide" },
};

/** The same long list hung from tools floating over the drawing's top, for comparison. */
export const MenuHangs = {
  component: BarMenuFrame,
  args: { stands: "top", label: "Pages", rows: PAGES, width: "wide" },
};
