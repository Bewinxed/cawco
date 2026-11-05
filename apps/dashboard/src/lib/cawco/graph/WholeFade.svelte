<script lang="ts" module>
  /** The map's edges with more of the set past them: each wears the house edge fade (edge-fade.css `kit-edge-fade-pan`). */
  export interface PastEdges {
    bottom: boolean;
    left: boolean;
    right: boolean;
    top: boolean;
  }
</script>

<script lang="ts">
  /**
   * Which of the whole set's edges have more of the set past them, read off
   * Svelte Flow's view as he pans and zooms (WholeSet): the map's own box
   * against the set's bounds in the view's coordinates. The owner hears
   * only a change of an edge, never every frame of a pan.
   */
  import { useStore } from "@xyflow/svelte";
  import { untrack } from "svelte";

  let {
    bounds,
    onedges,
  }: {
    /** The set's own bounds (every card and group), in the flow's coordinates; null with none. */
    bounds: { bottom: number; left: number; right: number; top: number } | null;
    onedges: (next: PastEdges) => void;
  } = $props();
  const store = useStore();
  /** Less than a pixel past an edge is no more of the set: a fit stands its padding inside. */
  const SLACK = 1;
  const past = $derived.by((): PastEdges => {
    const { x, y, zoom } = store.viewport;
    const { width, height } = store;
    if (!bounds || width === 0 || height === 0) {
      return { top: false, right: false, bottom: false, left: false };
    }
    return {
      top: bounds.top * zoom + y < -SLACK,
      left: bounds.left * zoom + x < -SLACK,
      bottom: bounds.bottom * zoom + y > height + SLACK,
      right: bounds.right * zoom + x > width + SLACK,
    };
  });
  /** The four edges as one word: equal from frame to frame of a pan, so the owner hears only a change. */
  const key = $derived(`${past.top}${past.right}${past.bottom}${past.left}`);
  $effect(() => {
    if (key) {
      untrack(() => onedges(past));
    }
  });
</script>
