/**
 * The box a native-preview picture stands in on the canvas: the frame's
 * whole width (its story's viewport), a phone's height
 * (`c-bench-phone-h`), as the artifact panel gives its pane.
 */
import Card from "#lib/components/ui/card/card.svelte";

export const paneFrame = () => ({
  Component: Card,
  props: {
    class: "relative overflow-hidden p-0 w-full h-c-bench-phone-h",
  },
});

/** The same box grown to its picture where it is taller than a phone: a canvas of stills, drawn whole. */
export const grownFrame = () => ({
  Component: Card,
  props: {
    class: "relative overflow-hidden p-0 w-full min-h-c-bench-phone-h",
  },
});
