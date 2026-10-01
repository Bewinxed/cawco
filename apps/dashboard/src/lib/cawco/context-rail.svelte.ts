/**
 * Shared open/close state for the right-hand context rail.
 *
 * Every SessionPane binds to the same value so the rail's width is consistent
 * across tab switches — no layout jump when switching between a pane whose
 * rail was open and one whose rail was closed.
 *
 * The media query `min-width: 1920px` auto-opens the rail when the viewport
 * is wide enough for three columns.  The user can still close it manually;
 * the next resize crossing re-syncs.
 */
import { MediaQuery } from "svelte/reactivity";

const roomForRail = new MediaQuery("min-width: 1920px");

/** Shared sidebar state — all panes bind to this. */
let open = $state(roomForRail.current);

/**
 * Reactive proxy: `contextRail.open` reads and writes the shared state.
 * Use with `bind:open={contextRail.open}` on `Sidebar.Provider`, or read
 * it directly in any component that needs the rail's current state.
 */
export const contextRail = {
  get open() {
    return open;
  },
  set open(v: boolean) {
    open = v;
  },
  /** Sync to the media query — call from a single $effect. */
  syncToViewport() {
    open = roomForRail.current;
  },
  /** Read the viewport threshold without subscribing to `open`. */
  get roomForRail() {
    return roomForRail.current;
  },
};
