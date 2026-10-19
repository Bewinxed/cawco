import Badge from "./Badge.svelte";
import "./slow.js";

export default { title: "Kit/Late badge", component: Badge };

/** A mark that arrives late. */
export const Late = { args: { text: "Late" } };

/** A mark that arrives later still. */
export const Later = { args: { text: "Later" } };
