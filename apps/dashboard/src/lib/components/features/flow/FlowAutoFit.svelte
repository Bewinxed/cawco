<script lang="ts">
  /**
   * The graph refits whenever it gains or loses a node, gliding to the new
   * frame over --dur-panel on --ease-in-out (movement on screen). The first
   * frame is the canvas's own `fitView`, drawn in place; Svelte Flow holds a
   * fit until the nodes it frames are measured.
   *
   * It also refits, in place, when the canvas itself changes size or its
   * nodes are laid out again (`layout`, once they are measured), for as long
   * as the view is still the one a fit gave (`held` false). The first fit is
   * taken the moment the nodes are measured, which in a pane group is while
   * the canvas's pane is still at its least width and has not taken its
   * share: without this the graph stayed framed for a pane a quarter
   * narrower than the one it stands in. A view the person has panned or
   * zoomed is theirs and is left alone.
   *
   * `minZoom` is the least zoom a fit takes (a graph whose names must stay
   * readable is panned past it); the canvas's tools ask `fit()` for the same
   * frame the graph opened on.
   */
  import { useSvelteFlow } from "@xyflow/svelte";
  import { untrack } from "svelte";
  import { dur, easeInOut, motionOk } from "#lib/cawco/motion/curves.svelte.js";
  import { FIT } from "./fit";
  import { onCanvasResize } from "./resized.svelte";

  let {
    nodeCount,
    held = false,
    layout,
    minZoom,
  }: {
    nodeCount: number;
    held?: boolean;
    /** The nodes' placement, as a key: a change refits in place. */
    layout?: string;
    minZoom?: number;
  } = $props();
  const { fitView } = useSvelteFlow();
  const frame = () => ({
    ...FIT,
    ...(minZoom === undefined ? {} : { minZoom }),
  });

  /** Frames the graph as it opened, gliding there. */
  export function fit(): void {
    fitView({
      ...frame(),
      duration: motionOk.current ? dur("--dur-panel") : 0,
      ease: easeInOut,
    });
  }

  let framed: number | undefined;
  $effect(() => {
    const count = nodeCount;
    if (framed !== undefined && count !== framed) {
      untrack(fit);
    }
    framed = count;
  });
  onCanvasResize(() => {
    if (!held) {
      fitView(frame());
    }
  });
  let placed: string | undefined;
  $effect(() => {
    const key = layout;
    const before = placed;
    placed = key;
    if (before !== undefined && before !== key && !untrack(() => held)) {
      fitView(untrack(frame));
    }
  });
</script>
