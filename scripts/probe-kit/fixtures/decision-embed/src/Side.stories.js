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
