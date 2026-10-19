import Badge from "./Badge.svelte";
import "./broken.js";

export default { component: Badge };

/** A mark whose states file never loads. */
export const Never = { args: { text: "Never" } };
