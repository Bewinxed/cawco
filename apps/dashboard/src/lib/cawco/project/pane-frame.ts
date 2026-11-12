/**
 * A states file's decorator that stands each story in the project page's
 * pane inset (ProjectPaneFrame), so a frame draws a view where the page
 * draws it, not flush against the frame's edge.
 */
import ProjectPaneFrame from "./ProjectPaneFrame.svelte";

export const inProjectPane = () => ({
  Component: ProjectPaneFrame,
  props: {},
});
