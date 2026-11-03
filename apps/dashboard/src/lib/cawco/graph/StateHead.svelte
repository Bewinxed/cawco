<script lang="ts">
  /**
   * A state's head, on its card in the whole set's map (StateNode) and on
   * its row in the map as a list (WholeList): its name, one press on which
   * keeps it (or, while comparing, compares with it); the on-stage mark on
   * the kept state; and its marks as glyphs in their status ink, their
   * words in the house tooltip and its description.
   */
  import { graphWords as words } from "@cawco/core/words/graph";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { IconError, IconEye, IconWarningTriangle } from "#lib/icons.js";
  import type { StateCard } from "./StateNode.svelte";

  let {
    card,
    row = false,
  }: {
    card: StateCard;
    /** It heads a list's row (the row's corner), not a map's card. */
    row?: boolean;
  } = $props();
  const uid = $props.id();
</script>

<div class="mark-line flex min-w-0 items-center gap-space-2">
  <!-- The name's button reaches over the whole card or row (its
       ::before), so a press anywhere on it keeps the state, and a pin on
       it is named by the name. -->
  <button
    type="button"
    aria-current={card.kept ? "true" : undefined}
    aria-describedby={card.marks.length > 0 ? `${uid}-marks` : undefined}
    class={[
      "min-w-0 flex-1 text-start type-label wrap-anywhere outline-none before:absolute before:inset-0 focus-visible:before:outline-(length:--focus-ring-width) focus-visible:before:outline-solid focus-visible:before:outline-focus-ring focus-visible:before:-outline-offset-2",
      card.kept ? "text-selected-ink" : "text-ink-row",
      row ? "before:rounded-sm" : "before:rounded-md",
      // On a map drawn too small to read, the name goes and its press
      // (the reach over the card) stays.
      "group-data-tiny/whole:invisible group-data-tiny/whole:before:visible",
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
      <span class="group-data-tiny/whole:invisible">{words.onStage}</span>
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
