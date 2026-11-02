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
  import { graphWords as words } from "@cawco/core/words/graph";
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
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { IconError, IconEye, IconWarningTriangle } from "#lib/icons.js";

  let { data }: NodeProps = $props();
  const card = $derived(data as unknown as StateCard);
  const uid = $props.id();
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
  <div class="mark-line flex min-w-0 items-center gap-space-2">
    <!-- The name's button reaches over the whole card (its ::before), so a
         press anywhere on it keeps the state, and a pin on it is named by
         the name. -->
    <button
      type="button"
      aria-current={card.kept ? "true" : undefined}
      aria-describedby={card.marks.length > 0 ? `${uid}-marks` : undefined}
      class={[
        "min-w-0 flex-1 text-start type-label wrap-anywhere outline-none before:absolute before:inset-0 before:rounded-md focus-visible:before:outline-(length:--focus-ring-width) focus-visible:before:outline-solid focus-visible:before:outline-focus-ring focus-visible:before:-outline-offset-2",
        card.kept ? "text-selected-ink" : "text-ink-row",
      ]}
      onclick={() => card.onpress(card.id)}
    >
      {card.name}
    </button>
    {#if card.kept}
      <span
        class="mark-line flex flex-none items-center gap-space-1 type-meta text-selected-ink"
        data-box
      >
        <IconEye aria-hidden="true" class="size-icon-sm" data-box />
        <span>{words.onStage}</span>
      </span>
    {/if}
    {#if card.marks.length > 0}
      <Tip label={card.marks.join(". ")} side="top">
        {#snippet children(tip)}
          <span
            {...tip}
            id={`${uid}-marks`}
            class="relative z-1 flex flex-none items-center gap-space-1"
            data-box
          >
            <span class="sr-only">{card.marks.join(". ")}</span>
            {#if card.failure}
              <IconError
                aria-hidden="true"
                class="size-icon-sm text-status-fail-glyph"
                data-box
              />
            {/if}
            {#if card.holed}
              <IconWarningTriangle
                aria-hidden="true"
                class="size-icon-sm text-status-attn-glyph"
                data-box
              />
            {/if}
          </span>
        {/snippet}
      </Tip>
    {/if}
  </div>
  {#if card.note}
    <span
      class={[
        "line-clamp-2 min-w-0 type-meta text-pretty wrap-anywhere",
        card.kept ? "text-selected-ink" : "text-ink-muted",
      ]}>{card.note}</span
    >
  {/if}
  <Handle isConnectable={false} position={Position.Bottom} type="source" />
</div>
