<script lang="ts" module>
  /** A state's card on the whole set's map: what it draws, set when the set or the kept state changes, never by the view. */
  export interface StateCard {
    /** It is the state the kept one is compared with. */
    against: boolean;
    failure: boolean;
    /** A hole in its path: no move reaches it, or none leaves it. */
    holed: boolean;
    id: string;
    /** It is the state on the stage. */
    kept: boolean;
    /** Its marks' words (an error state, no move leading here or on), each a glyph. */
    marks: string[];
    name: string;
    note: string | null;
    onpress: (state: string) => void;
  }
</script>

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
  import { Handle, type NodeProps, Position } from "@xyflow/svelte";
  import WholeCard from "./WholeCard.svelte";

  let { data }: NodeProps = $props();
  const card = $derived(data as unknown as StateCard);
</script>

<WholeCard {card}>
  <Handle isConnectable={false} position={Position.Top} type="target" />
  <Handle isConnectable={false} position={Position.Bottom} type="source" />
</WholeCard>
