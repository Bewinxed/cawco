<script lang="ts">
  /**
   * One card of the decisions graph: a raised 12px card with its name (two
   * lines at most, never cut mid-letter) and its ring, filled in the done
   * glyph once picked. A press opens its page scrolled to it; a drag moves
   * it, and its place is saved to its page's artifact on release.
   */
  import { Handle, type NodeProps, Position } from "@xyflow/svelte";
  import { appearOnMount } from "../../motion/curves.svelte";

  let { data }: NodeProps = $props();
  const node = $derived(data as { name: string; picked: boolean });
</script>

<!-- A card new to the graph fades up where it lands (`appearOnMount`). -->
<div
  {@attach appearOnMount()}
  data-slot="decision-node"
  class="group flex w-c-decision-node-w min-h-c-decision-node-h cursor-grab items-center gap-space-2 rounded-lg bg-surface-raised px-space-3 py-space-2 shadow-tile"
  data-picked={node.picked || undefined}
>
  <Handle
    id="in-left"
    isConnectable={false}
    position={Position.Left}
    type="target"
  />
  <Handle
    id="in-top"
    isConnectable={false}
    position={Position.Top}
    type="target"
  />
  <span
    data-slot="name"
    class="type-label line-clamp-2 min-w-0 flex-auto wrap-anywhere text-ink-strong"
    >{node.name}</span
  >
  <!-- Its ring is an inset ring, not a border: a ring's spread keeps
       --c-graph-edge's 1.5px on every screen, where a border's is snapped to
       whole device pixels. -->
  <span
    aria-hidden="true"
    class="size-icon-sm flex-none rounded-pill inset-ring-(length:--c-graph-edge) inset-ring-ink-muted group-data-picked:inset-ring-status-done-glyph group-data-picked:bg-status-done-glyph"
  ></span>
  <span class="sr-only">{node.picked ? "Picked" : "Not picked"}</span>
  <Handle
    id="out-right"
    isConnectable={false}
    position={Position.Right}
    type="source"
  />
  <Handle
    id="out-bottom"
    isConnectable={false}
    position={Position.Bottom}
    type="source"
  />
</div>
