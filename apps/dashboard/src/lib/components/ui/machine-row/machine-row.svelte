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

<!-- literal: 26px -->
<span
  data-slot="tile"
  class="inline-flex size-(--tile) flex-none items-center justify-center rounded-sm bg-surface-raised text-(--tile-hue) shadow-tile data-ink:bg-ink-solid data-ink:text-on-ink data-ink:shadow-none"
  data-ink={ink || undefined}
  style:--tile="26px"
  style:--tile-hue={ink ? undefined : hue}
  ><Icon class="size-icon-md flex-none" /></span
>
<span data-slot="text" class="min-w-0 flex-1">
  <span data-slot="name" class="type-label block truncate text-ink-strong"
    >{name}</span
  >
  <!-- literal: 6px -->
  <span
    data-slot="meta"
    class="type-meta mark-line flex items-center gap-(--meta-gap) text-ink-subtle"
    style:--meta-gap="6px"
    ><!-- literal: 6px --><span
      data-slot="dot"
      data-machine-row-away={presence === "away" || undefined}
      class="size-(--dot) flex-none rounded-pill bg-neutral-8 data-is-away:bg-hue-orange-500 data-is-online:bg-hue-green-500"
      data-box
      data-is-away={presence === "away" || undefined}
      data-is-online={presence === "online" || undefined}
      style:--dot="6px"
    ></span><span class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
      >{meta}</span
    ></span
  >
</span>
{#if trailing}
  {@render trailing()}
{/if}
