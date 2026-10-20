import Head from "./Head.svelte";

export default { title: "Embed/Head", component: Head };

/** The head named for a phone: 390px, under its 640px switch, whatever the window holding it. */
export const Phone = { args: { title: "Spend" }, parameters: { viewport: 390 } };

/** The head named for a desk: 1440px, past its switch, whatever the window holding it. */
export const Desk = { args: { title: "Spend" }, parameters: { viewport: 1440 } };
