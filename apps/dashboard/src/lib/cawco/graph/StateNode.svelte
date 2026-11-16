<script lang="ts">
  /**
   * A state on the whole set's map: its card (WholeCard), all of it inside
   * the node, so a move's arrow never meets its words. What a person does
   * to make a move stands on its arrow (RouteEdge). Its handles carry the
   * moves and draw nothing. Light by
   * design: no shadow, nothing read from the view (reactflow.dev,
   * Performance: "Simplify node and edge styles", "Avoid accessing nodes
   * in components").
   */
  import { Handle, type Node, type NodeProps, Position } from "@xyflow/svelte";
  import type { StateCard } from "./state-card";
  import WholeCard from "./WholeCard.svelte";

  let { data: card }: NodeProps<Node<StateCard>> = $props();
</script>

<WholeCard {card}>
  <!-- The arrows' ends only: nothing to connect, nothing a reader hears
       (Svelte Flow names each "Handle" as a button otherwise). -->
  <Handle
    aria-hidden="true"
    isConnectable={false}
    position={Position.Top}
    role="presentation"
    type="target"
  />
  <Handle
    aria-hidden="true"
    isConnectable={false}
    position={Position.Bottom}
    role="presentation"
    type="source"
  />
</WholeCard>
