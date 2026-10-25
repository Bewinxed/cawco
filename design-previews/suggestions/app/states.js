/**
 * The preview's state machine: its switcher's groups in order (Direction,
 * Where, Data, Theme), each a key of `?__state=` and each entry a value
 * (`?__state=direction:ledger,where:thread,data:three,theme:light`). A
 * group left out, or naming an entry its direction hasn't, takes the
 * direction's first. Every direction has its own Where and Data entries:
 * its Data entries are its own "States needed" list from the designer's
 * report (Today's, the stopped state builder's states.ts), and a state a
 * direction hasn't is hidden from the switcher.
 *
 * Each Data entry says what the direction draws: which of the owner's
 * starters (`set`), with their reasons or not, still being written
 * (`loading`), seven shown whole (`expanded`), an item held under the
 * pointer, the keyboard or the hand (`held`), what the message box holds
 * (`phase`) and a finger for a pointer (`touch`).
 */
import { bare, LONGEST, ONE, SEVEN, THREE } from "./starters.js";

const SETS = { one: ONE, three: THREE, seven: SEVEN, longest: LONGEST };

/** One Data entry: its key, its label, and what it draws. */
const entry = (value, label, draws = {}) => ({
  value,
  label,
  draws: {
    set: "three",
    reasons: true,
    loading: false,
    expanded: false,
    held: null,
    phase: "rest",
    touch: false,
    ...draws,
  },
});

/** The states all three new directions list alike, by their own words. */
const common = {
  loading: entry("loading", "Loading", { loading: true }),
  one: entry("one", "One", { set: "one" }),
  three: entry("three", "Three"),
  sevenCollapsed: entry("seven-collapsed", "Seven collapsed", {
    set: "seven",
  }),
  withReasons: entry("with-reasons", "With reasons"),
  withoutReasons: entry("without-reasons", "Without reasons", {
    reasons: false,
  }),
  rest: entry("rest", "Rest"),
  focus: entry("focus", "Focus-visible", { held: "focus" }),
  longest: entry("longest", "Longest text at 380", { set: "longest" }),
};

export const DIRECTIONS = [
  {
    value: "today",
    label: "Today",
    note: "",
    where: ["thread", "board", "phone"],
    data: [
      entry("three", "Three"),
      entry("one", "One", { set: "one" }),
      entry("seven", "Seven", { set: "seven" }),
      entry("longest", "Longest", { set: "longest" }),
      entry("no-reasons", "No reasons", { reasons: false }),
      entry("loading", "Loading", { loading: true }),
    ],
  },
  {
    value: "drafts",
    label: "Unsent drafts",
    note: "Report: the stack stands right-aligned on the composer, in a centred 560px column on the board, and hides while the keyboard is up.",
    where: ["thread", "board", "phone", "keyboard"],
    data: [
      common.loading,
      entry("none", "None (hidden)", { set: "none" }),
      common.one,
      common.three,
      common.sevenCollapsed,
      entry("seven-expanded", "Seven expanded", {
        set: "seven",
        expanded: true,
      }),
      common.withReasons,
      common.withoutReasons,
      common.rest,
      entry("hover", "Hover", { held: "hover" }),
      common.focus,
      entry("pressed", "Pressed (travel)", { held: "pressed" }),
      entry("filled", "Filled (text in box, stack dimmed)", {
        phase: "filled",
      }),
      entry("typing", "Typing (hidden)", { phase: "typing" }),
      entry("cleared", "Composer cleared (returns)", { phase: "cleared" }),
      entry("touch", "Touch", { touch: true }),
      common.longest,
    ],
  },
  {
    value: "ledger",
    label: "The ledger",
    note: "The design's stated change: on the board the rows stand at the report's 560px reading width.",
    where: ["thread", "board", "phone"],
    data: [
      common.loading,
      entry("none", "None", { set: "none" }),
      common.one,
      common.three,
      common.sevenCollapsed,
      entry("seven-expanded", "Seven expanded", {
        set: "seven",
        expanded: true,
      }),
      common.withReasons,
      common.withoutReasons,
      common.rest,
      entry("hover", "Hover", { held: "hover" }),
      common.focus,
      entry("pressed", "Pressed", { held: "pressed" }),
      entry("filled", "Filled (pencil→check)", { phase: "filled" }),
      entry("typing", "Typing (faded)", { phase: "typing" }),
      entry("cleared", "Composer cleared", { phase: "cleared" }),
      entry("refresh", "Refresh pressed (rewriting, rows shimmer in place)", {
        phase: "refresh",
      }),
      entry("touch", "Touch", { touch: true }),
      common.longest,
    ],
  },
  {
    value: "tray",
    label: "The tray",
    note: "The design's stated change: the suggestions live in the composer's own frame, over its field, growing upward until the heading's room, then scrolling inside.",
    where: ["thread", "board", "phone", "keyboard"],
    data: [
      common.loading,
      entry("none", "None (no tray)", { set: "none" }),
      common.one,
      common.three,
      common.sevenCollapsed,
      entry("seven-expanded", "Seven expanded (grows upward)", {
        set: "seven",
        expanded: true,
      }),
      common.withReasons,
      common.withoutReasons,
      common.rest,
      entry("hover", "Hover (reason reveals)", { held: "hover" }),
      common.focus,
      entry("pressed", "Pressed (lift)", { held: "pressed" }),
      entry("filled", "Filled + chip row", { phase: "filled" }),
      entry("scrolled", "Chip row scrolled", { phase: "scrolled" }),
      entry("reopened", "Tray reopened via chevron", { phase: "reopened" }),
      entry("cleared", "Composer cleared (tray returns)", {
        phase: "cleared",
      }),
      entry("sent", "After first send (tray closed)", { phase: "sent" }),
      entry("touch", "Touch (reasons always shown)", { touch: true }),
      common.longest,
    ],
  },
];

/** Where a state stands, at its production width. */
export const WHERE = {
  thread: { label: "Caw’s thread (380)", width: 380 },
  board: { label: "The empty board (725)", width: 725 },
  phone: { label: "The phone (390)", width: 390 },
  keyboard: { label: "The phone, keyboard up (390)", width: 390 },
};

export const THEMES = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

/** The switcher's groups for a direction, in order, every entry it has. */
/** The one line saying where a direction's report changes Today's surroundings; none for Today. */
export const noteOf = (direction) =>
  DIRECTIONS.find((each) => each.value === direction)?.note ?? "";

export const groupsOf = (direction) => {
  const d = DIRECTIONS.find((each) => each.value === direction) ?? DIRECTIONS[0];
  return [
    {
      key: "direction",
      label: "Direction",
      entries: DIRECTIONS.map(({ value, label }) => ({ value, label })),
    },
    {
      key: "where",
      label: "Where",
      entries: d.where.map((value) => ({ value, label: WHERE[value].label })),
    },
    {
      key: "data",
      label: "Data",
      entries: d.data.map(({ value, label }) => ({ value, label })),
    },
    { key: "theme", label: "Theme", entries: THEMES },
  ];
};

/** `?__state=` read: each group's named entry where its direction has it, else the first. */
export function readState(raw) {
  const named = new Map(
    (raw ?? "").split(",").map((pair) => pair.split(":"))
  );
  const direction =
    DIRECTIONS.find((d) => d.value === named.get("direction")) ??
    DIRECTIONS[0];
  const pick = (list, want) =>
    list.find((value) => value === want) ?? list[0];
  return {
    direction: direction.value,
    where: pick(direction.where, named.get("where")),
    data: pick(
      direction.data.map((each) => each.value),
      named.get("data")
    ),
    theme: pick(
      THEMES.map((each) => each.value),
      named.get("theme")
    ),
  };
}

/** The state written back as `?__state=`, every group named. */
export const writeState = (state) =>
  ["direction", "where", "data", "theme"]
    .map((key) => `${key}:${state[key]}`)
    .join(",");

/** What a state draws: its Data entry's flags and the owner's starters for them. */
export function drawsOf(state) {
  const direction = DIRECTIONS.find((d) => d.value === state.direction);
  const draws =
    direction?.data.find((each) => each.value === state.data)?.draws ??
    direction?.data[0]?.draws;
  const set = draws.set === "none" ? [] : SETS[draws.set];
  return {
    ...draws,
    items: draws.reasons ? set : bare(set),
    // Touch on the phone, as a finger is its pointer.
    touch: draws.touch || state.where === "phone" || state.where === "keyboard",
  };
}
