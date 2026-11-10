<script lang="ts">
  /**
   * The tools that act on what the panel shows, floating over it at its
   * foot, centred, as iOS's bottom toolbar floats its Liquid Glass over
   * content (the owner's pins on the Working area: "these tools can float
   * over the preview", and of the view options, "all of these need to be
   * directly visible"): the mode, then for a component the stage's view.
   * Each group is a glass of its own, side by side, the row wrapping upward
   * where the card is too narrow for one line. Nothing between the glasses
   * takes a press from the page.
   */
  import type { Snippet } from "svelte";
  import { frameSize } from "../frame-observer";
  import { rise } from "../motion/curves.svelte";

  let {
    lift = 0,
    spread = false,
    away = false,
    height = $bindable(0),
    children,
  }: {
    /** What stands over the foot already (a decision page's own Send bar), px: the tools stand above it. */
    lift?: number;
    /** Stepped aside below the foot while the drawing scrolls down (a phone's, a narrow card's): a scroll up or a press brings it back. */
    away?: boolean;
    /** Its groups stand at the two ends (the mode leading, the view trailing), not centred. */
    spread?: boolean;
    /** Its own height, px: what rises over it stands above it (the design graph's map, move and dials). */
    height?: number;
    children: Snippet;
  } = $props();
</script>

<div
  data-slot="preview-tools"
  class={[
    "pointer-events-none absolute inset-x-0 bottom-space-3 z-1 mb-(--lift) flex flex-wrap-reverse items-end gap-space-2 px-space-3 transition-[translate,opacity] duration-(--dur-panel) ease-drawer",
    spread ? "justify-between" : "justify-center",
    away ? "translate-y-full opacity-0" : "*:pointer-events-auto",
  ]}
  style:--lift="{lift}px"
  {@attach frameSize(
    (node: HTMLElement) => node.offsetHeight,
    (value) => {
      height = value;
    }
  )}
  in:rise={"--dur-panel"}
  out:rise={"--dur-exit"}
>
  {@render children()}
</div>
