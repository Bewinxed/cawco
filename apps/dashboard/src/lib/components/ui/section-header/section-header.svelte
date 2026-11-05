<script lang="ts">
  /**
   * §1.3: 16px duotone icon in the section hue, then a 13px/500 label. With
   * `level` the label is that heading (a group under a page's h1 is 2), so
   * the page's outline names its groups; without it, a plain label.
   */
  import type { Component, Snippet } from "svelte";

  let {
    icon: Icon,
    hue,
    label,
    right,
    wrap = false,
    level,
  }: {
    icon: Component;
    hue: string;
    label: string;
    right?: Snippet;
    wrap?: boolean;
    level?: 2 | 3 | 4;
  } = $props();
</script>

<div
  data-slot="head"
  class="flex items-center justify-between gap-space-2 data-wrap:flex-wrap"
  data-wrap={wrap || undefined}
>
  <div class="mark-line flex items-center gap-space-2">
    <Icon class="size-icon-md flex-none" data-box style={`color:${hue}`} />
    {#if level}
      <svelte:element this={`h${level}`} class="m-0 type-label"
        >{label}</svelte:element
      >
    {:else}
      <span class="type-label">{label}</span>
    {/if}
  </div>
  {#if right}
    {@render right()}
  {/if}
</div>
