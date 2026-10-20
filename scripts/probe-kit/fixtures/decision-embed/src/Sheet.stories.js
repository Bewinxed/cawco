import Sheet from "./Sheet.svelte";

export default { title: "Embed/Sheet", component: Sheet };

/** The sheet at rest, 400px wide (scaled down to fit a phone's option): its surface is its ::before, so a shot's DOM read must see the pseudo-element's fill, at the embed's zoom. */
export const Drawer = {
  args: {
    title: "Spend this month",
    lines: [
      "Week one: 18.40 USD",
      "Week two: 22.15 USD",
      "Week three: 19.90 USD",
      "Week four: 24.05 USD",
    ],
  },
  parameters: { viewport: 400 },
};
