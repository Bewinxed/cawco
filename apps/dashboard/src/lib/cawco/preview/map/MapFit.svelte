<script lang="ts">
  /**
   * The map's rows at the cards' real height (CanvasMap): once Svelte Flow
   * has measured its nodes, the tallest card's height goes to the map,
   * which lays its rows out by it; with the rows where they stand, the view
   * fits them, once: a card chosen later keeps the person's view (a new
   * card count or a new size is FlowAutoFit's).
   */
  import { useNodesInitialized, useSvelteFlow } from "@xyflow/svelte";
  import { FIT } from "#lib/components/features/flow/fit.js";

  let {
    onrow,
    rowHeight,
  }: { onrow: (height: number) => void; rowHeight: number } = $props();
  const measured = useNodesInitialized();
  const flow = useSvelteFlow();
  let fitted = false;
  $effect(() => {
    if (!measured.current) {
      return;
    }
    const tallest = Math.max(
      0,
      ...flow.getNodes().map((node) => node.measured?.height ?? 0)
    );
    if (tallest > 0 && Math.abs(tallest - rowHeight) > 1) {
      onrow(tallest);
      return;
    }
    if (!fitted) {
      fitted = true;
      flow.fitView({ ...FIT });
    }
  });
</script>
