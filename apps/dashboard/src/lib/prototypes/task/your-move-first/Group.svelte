<script lang="ts">
  /**
   * One group of the task's page: a raised card on the recessed page, its
   * name as a heading in the label role, an optional count or act at its
   * trailing edge, and its content on the card's own inset. Every group of
   * the page is one of these, so they share one inset and one rhythm.
   */
  import type { Snippet } from "svelte";

  let {
    heading,
    id,
    trailing,
    children,
  }: {
    heading: string;
    /** The heading's id, the group's accessible name and a jump target. */
    id: string;
    trailing?: Snippet;
    children: Snippet;
  } = $props();
</script>

<section
  aria-labelledby={id}
  class="flex min-w-0 flex-col gap-space-4 rounded-lg bg-surface-raised px-space-5 py-space-5 shadow-tile max-phone:px-space-4"
  data-slot="group"
>
  <div class="flex min-h-c-btn-h-sm items-center justify-between gap-space-3">
    <h2 class="m-0 type-label text-ink-muted" {id}>{heading}</h2>
    {#if trailing}
      {@render trailing()}
    {/if}
  </div>
  {@render children()}
</section>
