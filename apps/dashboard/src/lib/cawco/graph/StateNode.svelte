<script lang="ts" module>
  import type { GraphState } from "./graph";

  export interface StateNodeData {
    kept: boolean;
    onkeep: (id: string) => void;
    onpreview: (id: string | null) => void;
    state: GraphState;
  }
</script>

<script lang="ts">
  /**
   * A state on the map: its title and its one line (the story's doc
   * comment), one button that keeps it. Resting a pointer on it previews it
   * on the stage; a press keeps it, and the kept state's pill (KeptNode)
   * glides here. The handles carry the moves' edges and draw nothing.
   */
  import { Handle, type NodeProps, Position } from "@xyflow/svelte";

  let { data }: NodeProps = $props();
  const node = $derived(data as unknown as StateNodeData);
</script>

<div
  data-slot="state-node"
  class="relative"
  style:--xy-handle-background-color="transparent"
  style:--xy-handle-border-color="transparent"
>
  <Handle id="in" isConnectable={false} position={Position.Top} type="target" />
  <button
    class="grid h-c-graph-node-h w-c-graph-node-w content-start gap-space-1 rounded-lg border border-border-control bg-surface-raised px-space-4 py-space-3 text-start shadow-tile transition-control select-none press-tint can-hover:hover:not-data-kept:border-border-control-strong data-kept:border-transparent data-kept:bg-transparent data-kept:shadow-none"
    aria-current={node.kept ? "true" : undefined}
    data-kept={node.kept || undefined}
    onclick={() => node.onkeep(node.state.id)}
    onfocus={() => node.onpreview(node.state.id)}
    onblur={() => node.onpreview(null)}
    onpointerenter={(event) => {
      if (event.pointerType === "mouse") {
        node.onpreview(node.state.id);
      }
    }}
    onpointerleave={() => node.onpreview(null)}
    type="button"
  >
    <span
      class="truncate type-label text-ink-row in-data-kept:text-selected-ink"
      >{node.state.title}</span
    >
    <span
      class="line-clamp-2 type-meta text-pretty text-ink-muted in-data-kept:text-selected-ink"
      >{node.state.line}</span
    >
  </button>
  <Handle
    id="out"
    isConnectable={false}
    position={Position.Bottom}
    type="source"
  />
  <!-- A move back up the graph leaves and enters at the trailing side, so it
       runs round the states between, never through them. -->
  <Handle
    id="back-out"
    isConnectable={false}
    position={Position.Right}
    type="source"
  />
  <Handle
    id="back-in"
    isConnectable={false}
    position={Position.Right}
    type="target"
  />
</div>
