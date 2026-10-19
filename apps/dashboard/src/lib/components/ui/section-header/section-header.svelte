<script lang="ts">
  /** §1.3: 16px duotone icon in the section hue, then a 13px/500 label. */
  import type { Component, Snippet } from "svelte";

  let {
    icon: Icon,
    hue,
    label,
    right,
    wrap = false,
  }: {
    icon: Component;
    hue: string;
    label: string;
    right?: Snippet;
    wrap?: boolean;
  } = $props();
</script>

<div
  data-slot="head"
  class="flex items-center justify-between gap-space-2 data-wrap:flex-wrap"
  data-wrap={wrap || undefined}
>
  <div class="flex items-center gap-space-2">
    <Icon class="size-icon-md flex-none" style={`color:${hue}`} />
    <span class="type-label">{label}</span>
  </div>
  {#if right}
    {@render right()}
  {/if}
</div>
