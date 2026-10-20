import Sheet from "./Sheet.svelte";

export default { title: "Embed/Sheet", component: Sheet };

/** The sheet at rest: its surface is its ::before, so a shot's DOM read must see the pseudo-element's fill. */
export const Drawer = { args: { title: "Spend this month" } };
