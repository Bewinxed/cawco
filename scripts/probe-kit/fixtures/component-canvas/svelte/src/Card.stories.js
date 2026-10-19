import Card from "./Card.svelte";

export default { title: "Kit/Card", component: Card };

/** A deploy card with its badge and its quiet action. */
export const Ready = { args: { title: "Deploy", note: "Ready to ship" } };
