/**
 * Whether this tab is in view (`document.visibilityState`), read live: a
 * hidden tab has nothing on screen, so a pane tells the hub it showed an
 * artifact only while its tab is visible (PreviewPane, decisions PageFrame).
 */
import { on } from "svelte/events";
import { createSubscriber } from "svelte/reactivity";

const subscribe = createSubscriber((update) =>
  on(document, "visibilitychange", update)
);

export const pageVisible = {
  /** Whether the tab is in view now. */
  get current(): boolean {
    subscribe();
    return document.visibilityState === "visible";
  },
};
