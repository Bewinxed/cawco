import Menu from "./Menu.svelte";

export default { title: "Embed/Menu", component: Menu };

/** The bar on a phone, its menu open: its ⋯ at the start, so the end-aligned menu runs past the frame's start unless the frame is its viewport. */
export const Phone = { args: { open: true }, parameters: { viewport: 390 } };

/** The same bar on a small phone, its menu open too. */
export const Small = { args: { open: true }, parameters: { viewport: 320 } };

/** The same bar at a tablet's half, its menu open too. */
export const Half = { args: { open: true }, parameters: { viewport: 480 } };
