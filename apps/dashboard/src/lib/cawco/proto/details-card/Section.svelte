<script lang="ts">
  /**
   * One section of the project details card: its name, the one line saying
   * what it decides, then what it holds. The name is a heading, so the card
   * reads as its outline; the line is quieter, and starts on the name's edge.
   */
  import type { Snippet } from "svelte";

  let {
    name,
    line,
    key,
    children,
  }: {
    name: string;
    /** What the section decides, in one line. */
    line?: string;
    /** Its key, which the top line's press moves focus to. */
    key: string;
    children: Snippet;
  } = $props();

  const id = $props.id();
</script>

<section
  aria-labelledby="{id}-name"
  class="flex min-w-0 flex-col gap-space-3"
  data-section={key}
>
  <header class="flex flex-col gap-space-1">
    <h3 id="{id}-name" class="m-0 type-label font-medium text-ink-strong">
      {name}
    </h3>
    {#if line}
      <p class="m-0 type-meta text-pretty text-ink-muted">{line}</p>
    {/if}
  </header>
  {@render children()}
</section>
