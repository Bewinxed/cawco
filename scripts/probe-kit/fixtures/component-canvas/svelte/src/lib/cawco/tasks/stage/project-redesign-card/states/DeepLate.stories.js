import Badge from "../../../../../../Badge.svelte";
import "../../../../../../slow.js";

export default { title: "Kit/Deep late badge", component: Badge };

/** A mark that arrives late, from a states file deep in its project. */
export const Late = { args: { text: "Late" } };
