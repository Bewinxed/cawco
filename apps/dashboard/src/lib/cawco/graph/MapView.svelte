<script lang="ts">
  /**
   * How the map frames its graph, inside Svelte Flow. It opens readable:
   * the graph's width fitted to the map's at no less than `least` and no
   * more than 1, its top under the floating controls (`top`), so the names
   * stay at a size that reads and the rest is a scroll down, where the
   * map's foot fades. Fit frames the whole graph, however small. A press on
   * a state moves nothing (the owner's pin on a press that zoomed to 100%).
   */
  import { useSvelteFlow } from "@xyflow/svelte";
  import { untrack } from "svelte";
  import { dur, easeInOut, motionOk } from "#lib/cawco/motion/curves.svelte.js";

  let {
    bounds,
    view,
    top,
    least,
    framing,
  }: {
    /** The graph's size at zoom 1. */
    bounds: { height: number; width: number } | null;
    /** The map's size on screen. */
    view: { height: number; width: number };
    /** Room kept clear at the top for the controls. */
    top: number;
    /** The least zoom the opening frame takes. */
    least: number;
    /** A new value frames the graph afresh (another component). */
    framing: string;
  } = $props();

  const { setViewport } = useSvelteFlow();

  function frame(whole: boolean) {
    if (!(bounds && view.width > 0)) {
      return;
    }
    const pad = top / 2;
    const across = (view.width - pad * 2) / bounds.width;
    const down = (view.height - top - pad) / bounds.height;
    const zoom = whole
      ? Math.min(1, across, down)
      : Math.min(1, Math.max(least, across));
    setViewport(
      {
        x: (view.width - bounds.width * zoom) / 2,
        y: top,
        zoom,
      },
      whole && motionOk.current
        ? { duration: dur("--dur-panel"), ease: easeInOut }
        : undefined
    );
  }

  /** Fit: the whole graph in the map. */
  export function fit(): void {
    frame(true);
  }

  let framed = "";
  $effect(() => {
    // A new component, a graph laid out again or the map resized frames it
    // afresh; a press on a state changes none of these.
    const key = `${framing}:${bounds?.width}:${bounds?.height}:${view.width}`;
    if (key !== framed && bounds && view.width > 0) {
      framed = key;
      untrack(() => frame(false));
    }
  });
</script>
