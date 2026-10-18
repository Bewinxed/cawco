import Tall from "./Tall.svelte";

export default { title: "Screens/Long list", component: Tall };

/** A list long enough to push the next section past the fold. */
export const Thirty = { args: { rows: 30 } };
