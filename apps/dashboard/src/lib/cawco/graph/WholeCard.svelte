<script lang="ts">
  /**
   * A state's card in the whole set, on the map (StateNode, `c-graph-node-w`
   * wide) and in the map as a list under 640px (WholeList, the column's
   * width, as DESIGN.md's Map mode draws a list's cards): one card on the
   * raised surface with the control edge. Its name (one press keeps it, or,
   * while comparing, compares with it), its marks, each its status glyph
   * then its word, the whole sentence in the house tooltip, and its note,
   * two lines at most; then what its holder puts under it (the map's
   * handles, the list's moves). The state on the stage is the chosen card:
   * the coral edge, as a chosen chip (DESIGN.md, Map mode: "The chosen
   * card … takes the coral edge (`brand-solid`, as a chosen chip)"); the
   * one it is compared with, the change ring's edge.
   */
  import type { Snippet } from "svelte";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { IconError, IconWarningTriangle } from "#lib/icons.js";
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
      ? "border-brand-solid"
      : "border-border-control can-hover:has-[button:hover]:bg-surface-hover",
    card.against &&
      "outline-solid outline-(length:--spacing-c-change-ring-width) outline-c-change-ring",
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
        "text-ink-row before:rounded-md",
      ]}
      onclick={() => card.onpress(card.id)}
    >
      {card.name}
    </button>
  </div>
  {#if card.marks.length > 0}
    <!-- Each mark a status: its glyph in its tone's ink, then its word
           (DESIGN.md, The Glyph, Word, Hue Rule), on a line of their own
           under the name so the name keeps the card's width; their whole
           sentence in the house tooltip and the name's description. -->
    <Tip label={card.marks.map((mark) => mark.said).join(". ")} side="top">
      {#snippet children(tip)}
        <span
          {...tip}
          id={`${uid}-marks`}
          class="relative z-1 flex min-w-0 flex-wrap items-center gap-x-space-2 gap-y-space-row self-start"
        >
          <span class="sr-only"
            >{card.marks.map((mark) => mark.said).join(". ")}</span
          >
          {#each card.marks as mark (mark.said)}
            <span
              aria-hidden="true"
              class="mark-line flex items-center gap-space-1 type-meta text-ink-muted"
              data-box
            >
              {#if mark.tone === "fail"}
                <IconError
                  class="size-icon-sm flex-none text-status-fail-glyph"
                  data-box
                />
              {:else}
                <IconWarningTriangle
                  class="size-icon-sm flex-none text-status-attn-glyph"
                  data-box
                />
              {/if}
              <span>{mark.word}</span>
            </span>
          {/each}
        </span>
      {/snippet}
    </Tip>
  {/if}
  {#if card.note}
    <span
      class={[
        "line-clamp-2 min-w-0 type-meta text-pretty wrap-anywhere text-ink-muted",
      ]}>{card.note}</span
    >
  {/if}
  {@render children?.()}
</div>
