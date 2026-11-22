/**
 * The kit's Resizable parts (Component Story Format 3, live components) in a
 * frame of their own (resizable-frame): a page and its side panel, split by
 * a handle with and without its grip. The meta's args are every story's; a
 * story's own args are what it changes.
 */
import ResizableFrame from "./resizable-frame.svelte";

export default {
  title: "Kit/Resizable",
  component: ResizableFrame,
  args: {
    main: "The session's transcript",
    side: "Its files",
    sideSize: 35,
  },
};

/** A page and its side panel. */
export const Split = {};

/** The handle with its grip. */
export const WithGrip = { args: { grip: true } };
