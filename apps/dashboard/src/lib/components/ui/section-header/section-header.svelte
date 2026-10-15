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

<div class={["head", { wrap }]}>
  <div class="left">
    <Icon style={`color:${hue}`} />
    <span>{label}</span>
  </div>
  {#if right}
    {@render right()}
  {/if}
</div>

<style>
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .wrap {
    flex-wrap: wrap;
  }
  .left {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .left :global(svg) {
    width: 16px;
    height: 16px;
    flex: none;
  }
  .left span {
    font: var(--type-label);
  }
</style>
