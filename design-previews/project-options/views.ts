/**
 * Every option of every part as a frame the preview draws, with the widths
 * it is drawn at and one plain caption per width saying what the person
 * sees. The proof (scripts/probe-kit/specs/project-options-preview.ts) reads
 * each at each width; capture/shots.ts captures each for the decision page
 * (captures/, manifest.json).
 *
 * D is the desk's board and P the phone's: neither has a form at the
 * other's width, so each is drawn only at its own.
 */
export type Width = "1440" | "1037" | "390";

export interface OptionView {
  caption: Partial<Record<Width, string>>;
  choice: Record<string, string>;
  option: string;
  part: string;
  widths: Width[];
}

const DESK: Width[] = ["1440", "1037"];
const ALL: Width[] = ["1440", "1037", "390"];

export const OPTION_VIEWS: OptionView[] = [
  {
    part: "H",
    option: "H1",
    widths: ALL,
    choice: { H: "H1" },
    caption: {
      1440: "One bar in one row: the title and the obelisk-of-light place on the left, the six views and the waiting hand in the centre, New task, Filter, More and the coral Ask Caw on the right.",
      1037: "The same one bar at his window: the six views fold into a Board pill beside the waiting hand.",
      390: "The phone's bar is the title and More; the views, the waiting hand and the coral Ask Caw sit in the docked foot bar.",
    },
  },
  {
    part: "H",
    option: "H2",
    widths: ALL,
    choice: { H: "H2" },
    caption: {
      1440: "Two rows: the title, the place, More and Ask Caw on top; under them a shelf with the six views, the waiting hand, New task and Filter.",
      1037: "The two rows at his window: all six views stay named on the shelf.",
      390: "On the phone H2 is the same as H1: the title and More on top, the views and Ask Caw in the foot bar.",
    },
  },
  {
    part: "D",
    option: "D1",
    widths: DESK,
    choice: { D: "D1" },
    caption: {
      1440: "Five columns share the width with no strip; empty stages are a head over a one-row well.",
      1037: "At his window the columns can't fit, so the board turns into D2: the stage strip over 300px columns that scroll sideways.",
    },
  },
  {
    part: "D",
    option: "D2",
    widths: DESK,
    choice: { D: "D2" },
    caption: {
      1440: "The stage strip with every count over 300px columns: Ready, Working and Review whole, Done cut at the edge, Dropped past it.",
      1037: "The same board at his window: the strip keeps every stage and count in view while two columns and part of a third show.",
    },
  },
  {
    part: "P",
    option: "P1",
    widths: ["390"],
    choice: { P: "P1", w: "390" },
    caption: {
      390: "The stage strip wraps to two rows over Ready's cards: every stage and count in the first view.",
    },
  },
  {
    part: "P",
    option: "P2",
    widths: ["390"],
    choice: { P: "P2", w: "390" },
    caption: {
      390: "One grouped list: Ready open under its head, the other four heads pinned above the foot bar.",
    },
  },
  {
    part: "T",
    option: "T1",
    widths: ALL,
    choice: { view: "Table" },
    caption: {
      1440: "The Table: rows grouped by stage under sticky heads with counts; Done and Dropped folded and pinned at the foot.",
      1037: "The Table at his window, the same rows and heads.",
      390: "The phone's Table: one group open, the other heads pinned above the foot bar.",
    },
  },
  {
    part: "C",
    option: "C1",
    widths: ALL,
    choice: { C: "C1", state: "waits" },
    caption: {
      1440: "tsk-17 waits in Working with the needs-you mark (dot, hand, asks) and its ask on a line of its own; tsk-16 waits in Review. Drawn for the state.",
      1037: "The waiting cards at his window. Drawn for the state.",
      390: "The phone opens on Working, where tsk-17's ask stands with its mark. Drawn for the state.",
    },
  },
  {
    part: "C",
    option: "C2",
    widths: ALL,
    choice: { C: "C2", state: "waits" },
    caption: {
      1440: "The same waiting card with Deny and Approve as untinted peers at its foot, for a permission. Drawn for the state.",
      1037: "The card with its peers at his window. Drawn for the state.",
      390: "Deny and Approve at opposite ends of the card on the phone. Drawn for the state.",
    },
  },
  {
    part: "K",
    option: "K1-top",
    widths: ALL,
    choice: { K: "top", state: "waits", open: "pane" },
    caption: {
      1440: "tsk-16's pane beside the board, opened at its title: the task, its jump strip, then its description first.",
      1037: "The pane at his window, opened at its title.",
      390: "The pane as its own page on the phone, opened at its title, Send back and Approve docked at the foot.",
    },
  },
  {
    part: "K",
    option: "K1-review",
    widths: ALL,
    choice: { K: "review", state: "waits", open: "pane" },
    caption: {
      1440: "tsk-16's pane opened on its Result: the title condensed in the bar, the jump strip sticky, the handed-in result and Send back, Approve in view.",
      1037: "The pane at his window, opened on the Result.",
      390: "The phone's pane opened on the Result, the verdict docked at the foot.",
    },
  },
  {
    part: "F",
    option: "F1",
    widths: ALL,
    choice: { F: "F1", state: "stale" },
    caption: {
      1440: "The hub didn't answer: one band under the bar says who, when it retries and what to do, over the board as it last read. Drawn for the state.",
      1037: "The band over the kept board at his window. Drawn for the state.",
      390: "The band stacks to three lines on the phone, the board kept under it. Drawn for the state.",
    },
  },
  {
    part: "F",
    option: "F2",
    widths: ALL,
    choice: { F: "F2", state: "stale" },
    caption: {
      1440: "The hub didn't answer: a stale dot on the place, its popover open with who, when and what to do; the board kept. Drawn for the state.",
      1037: "The stale mark and its popover at his window. Drawn for the state.",
      390: "The stale mark beside the phone's title, its popover open under the bar. Drawn for the state.",
    },
  },
  {
    part: "S",
    option: "S1",
    widths: ALL,
    choice: { S: "S1", open: "caw" },
    caption: {
      1440: "Caw's column with no title bar: Caw on the axis, his line, three starters stacked as full sentences, the composer.",
      1037: "Caw's column with the stacked starters at his window.",
      390: "The half-height sheet on the phone: Caw, his line and the stack don't fit above the composer, so the stack scrolls.",
    },
  },
  {
    part: "S",
    option: "S2",
    widths: ALL,
    choice: { S: "S2", open: "caw" },
    caption: {
      1440: "Caw's column with the three starters as one row docked over the composer, scrolling sideways.",
      1037: "The docked row at his window.",
      390: "The half-height sheet: Caw's line, the row of starters and the composer.",
    },
  },
];

/** Today: the live page as captured, for the parts it shows (H, D, P). */
export const TODAY_VIEWS: { part: string; widths: Width[] }[] = [
  { part: "H", widths: ALL },
  { part: "D", widths: DESK },
  { part: "P", widths: ["390"] },
];

export const TODAY_CAPTION: Record<Width, string> = {
  1440: "Today at 1440: the view strip over a two-row head with the path, five columns with kind words under each name.",
  1037: "Today at his window: the strip cut at Dec…, the head's two rows, three columns in view.",
  390: "Today on the phone: the title three times, Ready's cards in full and the other stages a sliver at the right edge.",
};
