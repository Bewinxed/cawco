import Shared from "./Shared.svelte";

export default { title: "Embed/Shared", component: Shared };

/** A note in a shared document, as a comment card holds one. */
export const Note = { args: { title: "Shared note" } };

/** The same note under another title: a second story importing the same Yjs. */
export const Reply = { args: { title: "Shared reply" } };
