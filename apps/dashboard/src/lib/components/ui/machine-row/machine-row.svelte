<script lang="ts">
  /**
   * One machine, as a row inside a machine popover: a hued tile carrying the
   * machine's kind, its name, and a meta line led by a presence dot. The row
   * element itself (a toggle button in the new-session picker, a plain item
   * in a rollout popover) belongs to the caller; this is what sits inside it.
   */
  import type { Component, Snippet } from "svelte";
  import { iconTileVariants } from "#lib/components/ui/icon-tile/index.js";

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

<span
  data-slot="tile"
  class={iconTileVariants()}
  data-ink={ink || undefined}
  style:color={ink ? undefined : hue}
  ><Icon class="size-icon-md flex-none" /></span
>
<span data-slot="text" class="min-w-0 flex-1">
  <span data-slot="name" class="type-label block truncate text-ink-strong"
    >{name}</span
  >
  <span
    data-slot="meta"
    class="type-meta mark-line flex items-center gap-space-2 text-ink-subtle"
    ><span
      data-slot="dot"
      data-machine-row-away={presence === "away" || undefined}
      class="size-(--status-dot-size) flex-none rounded-pill bg-presence-off data-is-away:bg-presence-away not-data-is-away:data-is-online:bg-presence-online"
      data-box
      data-is-away={presence === "away" || undefined}
      data-is-online={presence === "online" || undefined}
    ></span><span class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
      >{meta}</span
    ></span
  >
</span>
{#if trailing}
  {@render trailing()}
{/if}
