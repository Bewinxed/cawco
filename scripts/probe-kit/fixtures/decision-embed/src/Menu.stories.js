import Menu from "./Menu.svelte";

export default { title: "Embed/Menu", component: Menu };

/** The bar on a phone, its menu open: 390px, its ⋯ at the start, so the end-aligned menu runs past the frame's start unless the frame is its viewport. */
export const Phone = { args: { open: true }, parameters: { viewport: 390 } };
