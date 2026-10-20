<script lang="ts">
  /**
   * The decision graph's Fit, inside its flow (Svelte Flow's own `fitView`
   * needs the flow's context): the opening fit's options, so a press on the
   * tools' Fit lands where the graph opened, never below the zoom at which
   * a card's name stands 10px (`minZoom`). The reader's own zoom keeps the
   * flow's range. A fit glides over --dur-panel on ease-in-out, as the
   * tools' zoom does; with less motion it lands at once.
   */
  import { useSvelteFlow } from "@xyflow/svelte";
  import { dur, easeInOut, motionOk } from "#lib/cawco/motion/curves.svelte.js";
  import { FIT } from "#lib/components/features/flow/fit.js";

  let { minZoom }: { minZoom: number } = $props();
  const { fitView } = useSvelteFlow();

  /** Frames the graph as it opened. */
  export function fit(): void {
    fitView({
      ...FIT,
      minZoom,
      duration: motionOk.current ? dur("--dur-panel") : 0,
      ease: easeInOut,
    });
  }
</script>
