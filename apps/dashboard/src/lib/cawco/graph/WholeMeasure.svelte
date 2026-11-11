<script lang="ts">
  /**
   * The whole set's cards at their real height (WholeSet): once Svelte Flow
   * has measured its nodes, each state card's height goes to the map, which
   * lays the cards and their groups out by them. It reads the nodes as they are measured,
   * never the view.
   */
  import { useNodesInitialized, useSvelteFlow } from "@xyflow/svelte";
  import { untrack } from "svelte";

  let {
    heights,
    onheights,
  }: {
    /** The heights the layout stands on now. */
    heights: Record<string, number>;
    onheights: (next: Record<string, number>) => void;
  } = $props();
  const measured = useNodesInitialized();
  const flow = useSvelteFlow();
  $effect(() => {
    if (!measured.current) {
      return;
    }
    const known = untrack(() => heights);
    const next: Record<string, number> = {};
    let changed = false;
    for (const node of flow.getNodes()) {
      const height = node.measured?.height;
      if (node.type === "state" && height) {
        next[node.id] = Math.round(height);
        changed ||= known[node.id] !== next[node.id];
      }
    }
    if (changed) {
      onheights(next);
    }
  });
</script>
