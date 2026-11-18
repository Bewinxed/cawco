<script lang="ts">
  /**
   * One group of the Standing card: its name as a heading the card's outline
   * reads, a quieter clause after it where the group needs one, an act at
   * the heading's end, and what it holds under it, 11px down.
   */
  import type { Snippet } from "svelte";

  let {
    title,
    clause,
    act,
    children,
  }: {
    title: string;
    /** Words that finish the heading, in the metadata's ink. */
    clause?: string;
    /** An act on the whole group, at the heading's end. */
    act?: Snippet;
    children: Snippet;
  } = $props();
</script>

<section class="flex min-w-0 flex-col gap-space-3" aria-label={title}>
  <div class="flex min-h-c-btn-h-sm min-w-0 items-center gap-space-2">
    <h3 class="m-0 min-w-0 type-label text-ink-muted">
      {title}{#if clause}<span class="type-meta text-ink-subtle">
          {clause}</span
        >{/if}
    </h3>
    {#if act}
      <div class="ms-auto flex flex-none items-center">{@render act()}</div>
    {/if}
  </div>
  {@render children()}
</section>
