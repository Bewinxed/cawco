<script lang="ts">
  /**
   * A state's card in the whole set, on the map (StateNode, `c-graph-node-w`
   * wide) and in the map as a list under 640px (WholeList, the column's
   * width, as DESIGN.md's Map mode draws a list's cards): one card on the
   * raised surface with the control edge. Its name (one press keeps it, or,
   * while comparing, compares with it), the on-stage mark on the kept
   * state, its marks as glyphs in their status ink whose words are their
   * house tooltip and their description, and its note, two lines at most;
   * then what its holder puts under it (the map's handles, the list's
   * moves). The state on the stage wears the list's on-stage face
   * (DESIGN.md, a selected canvas frame: its label in `selected-ink` and
   * its 1px `border-control-strong` edge); the one it is compared with, the
   * change ring's edge.
   */
  import { graphWords as words } from "@cawco/core/words/graph";
  import type { Snippet } from "svelte";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { IconError, IconEye, IconWarningTriangle } from "#lib/icons.js";
  import type { StateCard } from "./StateNode.svelte";

  let {
    card,
    wide = false,
    children,
  }: {
    card: StateCard;
    /** The column's width (a list's card), not the map's node width. */
    wide?: boolean;
    /** What stands under the card's words: the map's handles, the list's moves. */
    children?: Snippet;
  } = $props();
  const uid = $props.id();
</script>

<div
  data-slot="whole-state"
  data-kept={card.kept ? "" : undefined}
  class={[
    "relative flex min-w-0 flex-col gap-space-row rounded-md border bg-surface-raised px-space-3 py-space-2 transition-control",
    wide ? "w-auto" : "w-c-graph-node-w",
    card.kept
      ? "border-border-control-strong"
      : "border-border-control can-hover:has-[button:hover]:bg-surface-hover",
    card.against &&
      "outline-solid outline-(length:--c-change-ring-width) outline-c-change-ring",
  ]}
  style:--xy-handle-background-color="transparent"
  style:--xy-handle-border-color="transparent"
>
  <div class="mark-line flex min-w-0 items-center gap-space-2">
    <!-- The name's button reaches over the whole card (its ::before), so a
         press anywhere on it keeps the state, and a pin on it is named by
         the name. -->
    <button
      type="button"
      aria-current={card.kept ? "true" : undefined}
      aria-describedby={card.marks.length > 0 ? `${uid}-marks` : undefined}
      class={[
        "min-w-0 flex-1 text-start type-label wrap-anywhere outline-none before:absolute before:inset-0 focus-visible:before:outline-(length:--focus-ring-width) focus-visible:before:outline-solid focus-visible:before:outline-focus-ring focus-visible:before:-outline-offset-2",
        card.kept ? "text-selected-ink" : "text-ink-row",
        "before:rounded-md",
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
  {@render children?.()}
</div>
