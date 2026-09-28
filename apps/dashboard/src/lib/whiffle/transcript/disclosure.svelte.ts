import { SvelteSet } from "svelte/reactivity";

/**
 * The tool calls the reader has opened, by session and call.
 *
 * A call's row is virtualised: it is taken down when it scrolls away and
 * built again when it comes back, and a pane that is left and returned to is
 * built again whole. An open body kept in the row itself was closed by every
 * one of those. Kept here, the reader's disclosure outlives the component
 * that drew it — and a body that mounts already open does not animate
 * (`collapsible-content`), so coming back to it moves nothing.
 */
export const openCalls = new SvelteSet<string>();
