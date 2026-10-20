import Side from "./Side.svelte";

export default { title: "Embed/Side", component: Side };

/** The side card at its own 360px: on a phone wider than the card's media, so the embed scales it down to fit. */
export const Card = {
  args: {
    title: "Spend this week",
    lines: ["Monday: 4.20 USD", "Tuesday: 3.10 USD", "Wednesday: 5.75 USD"],
  },
  parameters: { viewport: 360 },
};

/** The side card at 1400px, a desk's width: fitted into any card its words would fall under 10px, so the embed stops scaling there and scrolls it sideways. */
export const Wide = {
  args: {
    title: "Spend this quarter",
    lines: ["July: 96.40 USD", "August: 88.15 USD", "September: 102.30 USD"],
  },
  parameters: { viewport: 1400 },
};

/** The side card at 480px, two of them compared side by side in one card: wider than either column on a desk, so each is scaled to its column, both at one scale when the columns are equal. */
export const Week = {
  args: {
    title: "Spend this week",
    lines: ["Monday: 4.20 USD", "Tuesday: 3.10 USD", "Wednesday: 5.75 USD"],
  },
  parameters: { viewport: 480 },
};

export const Month = {
  args: {
    title: "Spend this month",
    lines: ["Week one: 31.40 USD", "Week two: 27.90 USD", "Week three: 35.05 USD"],
  },
  parameters: { viewport: 480 },
};
