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
   * A state on the whole set's map: one card, `c-graph-node-w` wide on the
   * raised surface with the control edge, all of it inside the node, so a
   * move's arrow never meets its words: its name (one press keeps it, or,
   * while comparing, compares with it), its marks as glyphs in their
   * status ink whose words are their house tooltip and their description,
   * and its note, two lines at most. The state on the stage wears the
   * list's on-stage face (DESIGN.md, a selected canvas frame: its label in
   * `selected-ink` and its 1px `border-control-strong` edge), with the
   * same "On stage" mark; the one it is compared with, the change ring's
   * edge. What a person does to make a move stands on its arrow
   * (RouteEdge). Its handles carry the moves and draw nothing. Light by
   * design: no shadow, nothing read from the view (reactflow.dev,
   * Performance: "Simplify node and edge styles", "Avoid accessing nodes
   * in components").
   */
  import { Handle, type NodeProps, Position } from "@xyflow/svelte";
  import StateHead from "./StateHead.svelte";

  let { data }: NodeProps = $props();
  const card = $derived(data as unknown as StateCard);
</script>

<div
  data-slot="whole-state"
  data-kept={card.kept ? "" : undefined}
  class={[
    "relative flex w-c-graph-node-w min-w-0 flex-col gap-space-row rounded-md border bg-surface-raised px-space-3 py-space-2 transition-control",
    card.kept
      ? "border-border-control-strong"
      : "border-border-control can-hover:has-[button:hover]:bg-surface-hover",
    card.against &&
      "outline-solid outline-(length:--c-change-ring-width) outline-c-change-ring",
  ]}
  style:--xy-handle-background-color="transparent"
  style:--xy-handle-border-color="transparent"
>
  <Handle isConnectable={false} position={Position.Top} type="target" />
  <StateHead {card} />
  {#if card.note}
    <span
      class={[
        "line-clamp-2 min-w-0 type-meta text-pretty wrap-anywhere group-data-tiny/whole:invisible",
        card.kept ? "text-selected-ink" : "text-ink-muted",
      ]}>{card.note}</span
    >
  {/if}
  <Handle isConnectable={false} position={Position.Bottom} type="source" />
</div>
