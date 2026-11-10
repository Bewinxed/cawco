<script lang="ts" module>
  /** A status on a state's card: its tone's glyph, then its word (DESIGN.md, The Glyph, Word, Hue Rule), and what it means whole. */
  export interface StateMark {
    said: string;
    tone: "fail" | "attn";
    word: string;
  }

  /** A state's card on the whole set's map: what it draws, set when the set or the kept state changes, never by the view. */
  export interface StateCard extends Record<string, unknown> {
    /** It is the state the kept one is compared with. */
    against: boolean;
    id: string;
    /** It is the state on the stage. */
    kept: boolean;
    /** Its marks, each a status: an error state (fail), no move leading here or on (attn); its word on the card, its sentence in the tooltip. */
    marks: StateMark[];
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
  import { Handle, type Node, type NodeProps, Position } from "@xyflow/svelte";
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
