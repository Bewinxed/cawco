<script lang="ts">
  /**
   * One machine, as a row inside a machine popover: a hued tile carrying the
   * machine's kind, its name, and a meta line led by a presence dot. The row
   * element itself (a toggle button in the new-session picker, a plain item
   * in a rollout popover) belongs to the caller; this is what sits inside it.
   */
  import type { Component, Snippet } from "svelte";

  let {
    icon: Icon,
    hue,
    name,
    meta,
    presence,
    ink = false,
    trailing,
  }: {
    icon: Component;
    hue: string;
    name: string;
    meta: string;
    /** `online` idle, `away` busy or partly there, `off` offline or absent. */
    presence: "online" | "away" | "off";
    /** Inverts the tile, for a chosen row. */
    ink?: boolean;
    trailing?: Snippet;
  } = $props();
</script>

<span class="tile" style={ink ? '' : `color:${hue}`} class:ink><Icon /></span>
<span class="text">
  <span class="name">{name}</span>
  <span class="meta"
    ><span
      class="dot"
      class:away={presence === 'away'}
      class:online={presence === 'online'}
    ></span>{meta}</span
  >
</span>
{#if trailing}
  {@render trailing()}
{/if}

<style>
  .tile {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    width: 26px;
    height: 26px;
    border-radius: var(--radius-sm);
    background: var(--surface-raised);
    box-shadow: var(--shadow-tile);
  }
  .tile.ink {
    background: var(--ink-strong);
    color: var(--on-brand);
    box-shadow: none;
  }
  .tile :global(svg) {
    flex: none;
    width: 16px;
    height: 16px;
  }
  .text {
    flex: 1;
    min-width: 0;
  }
  .name {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font: var(--type-label);
    color: var(--ink-strong);
  }
  .meta {
    display: flex;
    align-items: center;
    gap: 6px;
    overflow: hidden;
    font: var(--type-meta);
    color: var(--ink-subtle);
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .dot {
    flex: none;
    width: 6px;
    height: 6px;
    border-radius: var(--radius-pill);
    background: var(--neutral-8);
  }
  .dot.online {
    background: var(--hue-green-500);
  }
  .dot.away {
    background: var(--hue-orange-500);
  }
</style>
