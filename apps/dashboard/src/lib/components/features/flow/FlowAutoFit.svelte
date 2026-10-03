<script lang="ts">
  /**
   * The graph refits whenever it gains or loses a node, gliding to the new
   * frame over --dur-panel on --ease-in-out (movement on screen). The first
   * frame is the canvas's own `fitView`, drawn in place; Svelte Flow holds a
   * fit until the nodes it frames are measured.
   */
  import { useSvelteFlow } from "@xyflow/svelte";
  import { dur, easeInOut, motionOk } from "#lib/cawco/motion/curves.svelte.js";
  import { FIT } from "./fit";

  let { nodeCount }: { nodeCount: number } = $props();
  const { fitView } = useSvelteFlow();
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
</script>
