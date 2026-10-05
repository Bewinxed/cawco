<script lang="ts">
  /**
   * The graph refits whenever it gains or loses a node, gliding to the new
   * frame over --dur-panel on --ease-in-out (movement on screen). The first
   * frame is the canvas's own `fitView`, drawn in place; Svelte Flow holds a
   * fit until the nodes it frames are measured.
   *
   * It also refits, in place, when the canvas itself changes size, for as
   * long as the view is still the one a fit gave (`held` false). The first
   * fit is taken the moment the nodes are measured, which in a pane group is
   * while the canvas's pane is still at its least width and has not taken
   * its share: without this the graph stayed framed for a pane a quarter
   * narrower than the one it stands in. A view the person has panned or
   * zoomed is theirs and is left alone.
   */
  import { useStore, useSvelteFlow } from "@xyflow/svelte";
  import { untrack } from "svelte";
  import { dur, easeInOut, motionOk } from "#lib/cawco/motion/curves.svelte.js";
  import { FIT } from "./fit";

  let { nodeCount, held = false }: { nodeCount: number; held?: boolean } =
    $props();
  const { fitView } = useSvelteFlow();
  const store = useStore();
  let framed: number | undefined;
  $effect(() => {
    const count = nodeCount;
    if (framed !== undefined && count !== framed) {
      fitView({
        ...FIT,
        duration: motionOk.current ? dur("--dur-panel") : 0,
        ease: easeInOut,
      });
    }
    framed = count;
  });
  let sized: string | undefined;
  $effect(() => {
    const size = `${store.width}x${store.height}`;
    const before = sized;
    sized = size;
    if (
      before !== undefined &&
      before !== size &&
      store.width > 0 &&
      store.height > 0 &&
      !untrack(() => held)
    ) {
      fitView({ ...FIT });
    }
  });
</script>
