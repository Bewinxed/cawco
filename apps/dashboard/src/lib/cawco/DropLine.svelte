<script lang="ts">
  /**
   * The drop indicator of a reorder by drag (blocks/block-dnd.svelte.ts,
   * project/stage-dnd.svelte.ts): a line in the brand's solid across the
   * target's edge the drop would take, a dot at its start, standing in the
   * middle of the gap between the target and its neighbour. Drawn inside
   * the target, which is `position: relative`.
   */
  import type { Edge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/types";

  let {
    edge,
    gap,
  }: {
    edge: Edge;
    /** The gap between the targets, as a CSS length: the line stands in its middle. */
    gap: string;
  } = $props();
</script>

<span
  data-slot="drop"
  aria-hidden="true"
  class="pointer-events-none absolute z-2 rounded-hair bg-brand-solid before:absolute before:size-c-block-drop-dot before:rounded-pill before:bg-brand-solid edge-bottom:inset-x-0 edge-bottom:bottom-(--drop-off) edge-bottom:h-c-block-drop-line edge-bottom:before:start-(--dot-out) edge-bottom:before:top-(--dot-mid) edge-left:inset-y-0 edge-left:start-(--drop-off) edge-left:w-c-block-drop-line edge-left:before:start-(--dot-mid) edge-left:before:top-(--dot-out) edge-right:inset-y-0 edge-right:end-(--drop-off) edge-right:w-c-block-drop-line edge-right:before:start-(--dot-mid) edge-right:before:top-(--dot-out) edge-top:inset-x-0 edge-top:top-(--drop-off) edge-top:h-c-block-drop-line edge-top:before:start-(--dot-out) edge-top:before:top-(--dot-mid)"
  data-edge={edge}
  style:--drop-off="calc({gap} / -2 - var(--c-block-drop-line) / 2)"
  style:--dot-mid={"calc((var(--c-block-drop-line) - var(--c-block-drop-dot)) / 2)"}
  style:--dot-out={"calc(var(--c-block-drop-dot) / -2)"}
></span>
