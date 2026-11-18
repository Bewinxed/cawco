<script lang="ts">
  /**
   * One group of the band: its name, then what it holds. The name is the
   * group's heading (h3 under the page's h1), in the label role and the
   * muted ink, so the facts under it carry the weight; `aside` is a quiet
   * line after the name on its baseline ("when a task doesn't say"). No
   * box: `trailing` stands at the name's line's end (a way out to the
   * group's own page). Groups stand apart by space alone (better-layout, group with
   * space), the space between groups twice the space inside one.
   */
  import type { Snippet } from "svelte";

  let {
    title,
    aside,
    trailing,
    children,
  }: {
    title: string;
    aside?: string;
    trailing?: Snippet;
    children: Snippet;
  } = $props();

  const uid = $props.id();
</script>

<section
  aria-labelledby="{uid}-title"
  class="flex min-w-0 flex-col gap-space-3"
  data-slot="band-group"
>
  <header class="flex min-h-icon-lg min-w-0 items-center gap-space-2">
    <span class="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-space-2">
      <h3 id="{uid}-title" class="m-0 type-label text-ink-muted">{title}</h3>
      {#if aside}
        <span class="type-meta text-ink-subtle">{aside}</span>
      {/if}
    </span>
    {#if trailing}
      {@render trailing()}
    {/if}
  </header>
  {@render children()}
</section>
