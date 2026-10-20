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

  /** A starter card's least width: a quarter of the column, or of today's --c-starters-w. */
  const STARTER_W =
    "max(calc(var(--c-starters-w) / 4 - var(--space-2)), calc((100% - var(--space-2) * 3) / 4))";
</script>

<!-- The work column: placed in the area, its lines on its start edge. Four
     starter cards fill it across at its widest (a quarter of it, the gaps
     taken out); narrower, a card keeps the width four take in today's
     --c-starters-w, so the row goes three and one, then two by two. -->
<div
  data-slot="work-column"
  class={[
    "flex w-full flex-col items-start gap-space-3 text-start",
    inBlock ? "mx-0" : "mx-auto max-w-c-work-column-w",
  ]}
  data-in-block={inBlock || undefined}
  data-work-column
  style:--c-starter-w={STARTER_W}
>
  {#if title}
    <EmptyState actionWidth="fill" class="w-full" {line} {title}>
      {#snippet mark()}
        {#if caw}
          <div data-slot="caw-80" class="mb-space-3 grid justify-items-start">
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
      <!-- The sibling blocks' purpose line (Event sources, Approved actions). -->
      <p class="m-0 max-w-c-measure type-meta text-ink-muted text-pretty">
        {line}
      </p>
    {/if}
    {#if starters.length > 0}
      <StarterCards {onpick} {starters} />
    {/if}
  {/if}
</div>
