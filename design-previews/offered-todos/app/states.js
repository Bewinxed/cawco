/**
 * The preview's state machine: its switcher's groups in order (Today,
 * Design, Where, Theme), each a key of `?__state=`
 * (`?__state=view:kept-one,where:phone,theme:dark`). Today and Design are
 * two sections of one key, `view`: what is on show. A key left out takes
 * its first entry.
 *
 * Each view says what it draws: the list (`list`: live, main or design) or
 * the card (`card`), from which of tsk-16's to-dos (`data`), and the press
 * the page makes once it is drawn (`press`), for a state that only a press
 * reaches: the undo line, Keep all waiting on the hub, a refused keep.
 */

export const VIEWS = [
  {
    value: "live",
    group: "today",
    label: "His live build",
    caption:
      "Today, his live build: the two offers as ordinary to-dos with “Proposed” before their words, counted in To-dos 0/2.",
    draws: { list: "live", data: "today" },
  },
  {
    value: "main",
    group: "today",
    label: "Main",
    caption:
      "Today, main: the two offers under an Offered head below the add field, out of the count, with no way to keep or drop them.",
    draws: { list: "main", data: "today" },
  },
  {
    value: "live-card",
    group: "today",
    label: "Card, live build",
    caption:
      "Today, his live build's card: the ring draws the two offers as two unmade steps, 0/2.",
    draws: { card: { done: 0, total: 2 } },
  },
  {
    value: "main-card",
    group: "today",
    label: "Card, main",
    caption:
      "Today, main's card: no ring and no word, so a task with two offers waiting looks like one with no to-dos.",
    draws: { card: { done: 0, total: 0 } },
  },
  {
    value: "offered",
    group: "design",
    label: "Nothing agreed (2 offered)",
    caption:
      "Design: tsk-16 with nothing agreed. Two offered rows (dashed box, muted words, the attempt that offered them), Keep and Drop on each, Offered 2 and Keep all, the add field last.",
    draws: { list: "design", data: "offered" },
  },
  {
    value: "kept-one",
    group: "design",
    label: "After Keep on the first",
    caption:
      "Design: after Keep on “Full web run on committed fix”. It is a to-do now (To-dos 0/1); one offer stands under Offered 1.",
    draws: { list: "design", data: "kept-one" },
  },
  {
    value: "dropped",
    group: "design",
    label: "After Drop on the second",
    caption:
      "Design: after Drop on the second offer. Its row has become one line saying so, with Undo, where it stood.",
    draws: { list: "design", data: "offered", press: "drop-second" },
  },
  {
    value: "keeping-all",
    group: "design",
    label: "Keep all pending",
    caption:
      "Design: Keep all pressed and the hub still writing: the button says “Keeping…” and the rows stay put until it answers.",
    draws: { list: "design", data: "offered", press: "keep-all" },
  },
  {
    value: "refused",
    group: "design",
    label: "Refused keep",
    caption:
      "Design: a keep the hub refused, said on the list's problem line in the hub's own words; the row is unchanged.",
    draws: { list: "design", data: "offered", press: "keep-first-refused" },
  },
  {
    value: "card-offered",
    group: "design",
    label: "Card, 2 offered",
    caption:
      "Design: the board card with nothing agreed. No ring; “2 offered” stands where it would be.",
    draws: { card: { done: 0, total: 0, offered: 2 } },
  },
  {
    value: "card-kept",
    group: "design",
    label: "Card, after one keep",
    caption:
      "Design: the board card after one keep. The ring draws the agreed one alone (0/1), and “1 offered” stands beside it.",
    draws: { card: { done: 0, total: 1, offered: 1 } },
  },
];

/** Where a state stands, at its production width. */
export const WHERE = {
  desk: { label: "Desk pane (462)", width: 462, inline: "var(--space-3)" },
  phone: { label: "Phone (390)", width: 390, inline: "var(--space-5)" },
};

export const THEMES = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

const entries = (group) =>
  VIEWS.filter((view) => view.group === group).map(({ value, label }) => ({
    value,
    label,
  }));

/** The switcher's groups, in order: Today and Design both write `view`. */
export const GROUPS = [
  { id: "today", key: "view", label: "Today", entries: entries("today") },
  { id: "design", key: "view", label: "Design", entries: entries("design") },
  {
    id: "where",
    key: "where",
    label: "Where",
    entries: Object.entries(WHERE).map(([value, { label }]) => ({
      value,
      label,
    })),
  },
  { id: "theme", key: "theme", label: "Theme", entries: THEMES },
];

/** `?__state=` read: each key's named entry, else its first. */
export function readState(raw) {
  const named = new Map(
    (raw ?? "").split(",").map((pair) => pair.split(":"))
  );
  const pick = (list, want) => list.find((value) => value === want) ?? list[0];
  return {
    view: pick(
      VIEWS.map((view) => view.value),
      named.get("view")
    ),
    where: pick(Object.keys(WHERE), named.get("where")),
    theme: pick(
      THEMES.map((theme) => theme.value),
      named.get("theme")
    ),
  };
}

/** The state written back as `?__state=`, every key named. */
export const writeState = (state) =>
  ["view", "where", "theme"].map((key) => `${key}:${state[key]}`).join(",");

export const viewOf = (value) =>
  VIEWS.find((view) => view.value === value) ?? VIEWS[0];
