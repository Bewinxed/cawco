<script lang="ts">
  /**
   * PROPOSED (project-screens page): an empty surface that starts work,
   * laid by the Work Column Rule (placement advisor §1). Its content stands
   * in the work column (`--c-work-column-w`: the composer's column, at most
   * 720px): centred in a wider area, the area's own width in a narrower one.
   * The column is placed; its lines are not: Caw, the title, the line and
   * the starters share its start edge. The starters are the one starter
   * component, StarterCards, every card one size, four across at a desk's
   * column and one column in a narrow one.
   *
   * With no title (a block whose head already names it, as Routines'), it
   * is the block's purpose line and the starters, nothing else, on the
   * card's own padding (`inBlock`).
   */
  import Caw from "#lib/cawco/home/Caw.svelte";
  import type { ProjectStarter } from "#lib/cawco/project-tasks.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import StarterCards from "./StarterCards.svelte";

  let {
    title,
    line,
    caw = true,
    inBlock = false,
    starters,
    onpick,
  }: {
    /** What is missing; left out where the block's head already says it. */
    title?: string;
    /** Why, and what Caw does with a starter. */
    line?: string;
    /** Caw as the mark, at 80. */
    caw?: boolean;
    /** In a block's card: the column is the card's content box, never a second inset. */
    inBlock?: boolean;
    starters: ProjectStarter[];
    /** A press hands the words to Caw's panel, nothing sent. */
    onpick: (text: string) => void;
  } = $props();
</script>

<div
  data-slot="work-column"
  class="work-column"
  data-in-block={inBlock || undefined}
  data-work-column
>
  {#if title}
    <EmptyState {line} {title}>
      {#snippet mark()}
        {#if caw}
          <div data-slot="caw-80" class="caw-80">
            <Caw size={80} status="ready" />
          </div>
        {/if}
      {/snippet}
      {#snippet action()}
        {#if starters.length > 0}
          <StarterCards {onpick} {starters} />
        {/if}
      {/snippet}
    </EmptyState>
  {:else}
    {#if line}
      <p class="purpose">{line}</p>
    {/if}
    {#if starters.length > 0}
      <StarterCards {onpick} {starters} />
    {/if}
  {/if}
</div>

<style>
  /* The work column: placed in the area, its lines on its start edge. Four
     starter cards fill it across at its widest (a quarter of it, the gaps
     taken out); narrower, a card keeps the width four take in today's
     --c-starters-w, so the row goes three and one, then two by two. */
  .work-column {
    --c-starter-w: max(
      calc(var(--c-starters-w) / 4 - var(--space-2)),
      calc((100% - var(--space-2) * 3) / 4)
    );
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-3);
    inline-size: 100%;
    max-inline-size: var(--c-work-column-w);
    margin-inline: auto;
    text-align: start;

    &[data-in-block] {
      max-inline-size: none;
      margin-inline: 0;
    }
  }
  .work-column :global(.kit-empty) {
    inline-size: 100%;
  }
  .work-column :global(.kit-empty-action) {
    align-self: stretch;
  }
  .caw-80 {
    display: grid;
    justify-items: start;
    margin-block-end: var(--space-3);
  }
  /* The sibling blocks' purpose line (Event sources, Approved actions). */
  .purpose {
    max-inline-size: 72ch;
    margin: 0;
    font: var(--type-meta);
    color: var(--ink-muted);
    text-wrap: pretty;
  }
</style>
