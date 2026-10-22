import Board from "./Board.svelte";

export default { title: "Embed/Board", component: Board };

const ROWS = [
  ["Sessions running", "12"],
  ["Waiting on you", "3"],
  ["Spend today", "41.20 USD"],
  ["Machines online", "4 of 5"],
];

/** The board as a desk draws it, 640px: three looks a decision page asks the person to judge at 1:1. */
export const Calm = {
  args: { title: "Calm board", rows: ROWS, note: "One line per machine, quiet until something needs you." },
  parameters: { viewport: 640 },
};

export const Dense = {
  args: {
    title: "Dense board",
    rows: [...ROWS, ["Delegates", "7"], ["Tasks in review", "2"], ["Routines today", "5"]],
    note: "Every figure at once, for a person who reads it all.",
  },
  parameters: { viewport: 640 },
};

export const Split = {
  args: { title: "Split board", rows: ROWS.slice(0, 2), note: "What needs you on the left, the rest on the right." },
  parameters: { viewport: 640 },
};

/** The board on a phone, 390px. */
export const PhoneCalm = {
  args: { title: "Calm on a phone", rows: ROWS.slice(0, 3) },
  parameters: { viewport: 390 },
};

export const PhoneDense = {
  args: { title: "Dense on a phone", rows: ROWS },
  parameters: { viewport: 390 },
};
