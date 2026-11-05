<script lang="ts">
  /**
   * The one bar of a pane, a sheet or Caw's docked pane (DESIGN.md, The
   * Title Bars Follow Liquid Glass Rule): its short name, what it puts in
   * its glass group, then Close as a bare symbol named by where it goes.
   */
  import type { Snippet } from "svelte";
  import { BarGlass } from "#lib/components/ui/bar-glass/index.js";
  import { IconClose } from "#lib/icons.js";

  let {
    title,
    closeLabel,
    onclose,
    symbols,
  }: {
    title: string;
    closeLabel: string;
    onclose: () => void;
    /** Bare symbols before Close, in the same glass group. */
    symbols?: Snippet;
  } = $props();
</script>

<header
  class="flex h-c-top-bar-h flex-none items-center gap-space-3 ps-space-5 pe-space-3"
>
  <h2
    class="min-w-0 flex-1 overflow-clip text-ellipsis whitespace-nowrap type-label text-ink-strong"
  >
    {title}
  </h2>
  <BarGlass form="group">
    {@render symbols?.()}
    <button
      data-bar-item
      type="button"
      class="select-none touch-hit press-tint"
      aria-label={closeLabel}
      onclick={onclose}
    >
      <IconClose data-slot="bar-symbol" aria-hidden="true" />
    </button>
  </BarGlass>
</header>
