<script lang="ts">
  /**
   * An empty surface that starts work, laid by the Work Column Rule (the
   * owner's pins: "why is caw and the cards left aligned?", "again you are
   * blanket left aligning for no reason, this applies to all views"). Its
   * content stands in the work column (`--c-work-column-w`: the composer's
   * column, at most 720px): centred in a wider area, the area's own width in
   * a narrower one. The column is placed; its lines are not: the mark, the
   * title, the line and the starters share its start edge. Its starters are
   * the one starter component, StarterCards, every card one size (the
   * owner's pin: "why are these not having the consistent size?"), four
   * across at a desk's column and one column in a narrow one.
   *
   * With no title (a block whose head already names it, as Routines'), it
   * is the block's purpose line and its action, nothing else, on the
   * block's own padding (`inBlock`): its name and glyph are said once, in
   * the head (the owner's pin: "ur repeating icons and titles again").
   */
  import type { Component, Snippet } from "svelte";
  import { EmptyState } from "#lib/components/ui/empty/index.js";

  let {
    title,
    line,
    mark,
    icon,
    inBlock = false,
    children,
    ...rest
  }: {
    /** What is missing; left out where the block's head already says it. */
    title?: string;
    /** Why, and what a starter does. */
    line?: string;
    /** What is drawn as the mark: Caw at 80. */
    mark?: Snippet;
    /** Its glyph, where nothing is drawn in its place. */
    icon?: Component;
    /** In a block's card: the column is the card's content box, never a second inset. */
    inBlock?: boolean;
    /** Its one action: the starters, or why work can't start and the way by hand. */
    children: Snippet;
    [attribute: `data-${string}`]: unknown;
  } = $props();

  /**
   * A starter card's least width: a quarter of the column, the gaps taken
   * out, so four fill it across at its widest; narrower, a card keeps the
   * width four take in --c-starters-w, so the row goes three and one, then
   * two by two, then one column.
   */
  const STARTER_W =
    "max(calc(var(--c-starters-w) / 4 - var(--space-2)), calc((100% - var(--space-2) * 3) / 4))";
</script>

<div
  data-slot="work-column"
  {...rest}
  data-work-column
  class={[
    "flex w-full min-w-0 flex-col items-start gap-space-3 text-start",
    inBlock ? "mx-0" : "mx-auto max-w-c-work-column-w",
  ]}
  data-in-block={inBlock || undefined}
  style:--c-starter-w={STARTER_W}
>
  {#if title && mark}
    <EmptyState actionWidth="fill" class="w-full" {line} {mark} {title}>
      {#snippet action()}
        {@render children()}
      {/snippet}
    </EmptyState>
  {:else if title && icon}
    <EmptyState actionWidth="fill" class="w-full" {icon} {line} {title}>
      {#snippet action()}
        {@render children()}
      {/snippet}
    </EmptyState>
  {:else}
    {#if line}
      <p
        data-slot="work-column-line"
        class="m-0 max-w-c-measure type-body text-pretty wrap-anywhere text-ink-muted"
      >
        {line}
      </p>
    {/if}
    <div class="w-full min-w-0">{@render children()}</div>
  {/if}
</div>
