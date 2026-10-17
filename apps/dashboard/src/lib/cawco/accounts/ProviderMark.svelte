<script lang="ts">
  /**
   * A provider's mark (marks.ts): its logo as it ships, or, `mono`, its
   * silhouette in `currentColor` (an account's tile tints it in the
   * account's hue). A logo drawn in one plain ink is the silhouette in
   * `--ink-strong`. A provider with no mark draws the accounts glyph.
   */
  import { IconAccounts } from "#lib/icons.js";
  import { markOf } from "./marks";

  let {
    provider,
    mono = false,
    size = 16,
  }: { provider: string; mono?: boolean; size?: number } = $props();

  const mark = $derived(markOf(provider));
</script>

<span
  data-slot="mark"
  aria-hidden="true"
  data-mono={mono || undefined}
  class="inline-grid h-(--mark-size) w-(--mark-size) flex-none place-items-center text-ink-strong data-mono:text-inherit"
  data-box
  style:--mark-size={`${size}px`}
>
  {#if !mark}
    <IconAccounts />
  {:else if mark.logo && !mono}
    <!-- The mark's own source, from the icon sets bundled at build. -->
    {@html mark.logo}
  {:else}
    <i class="size-full bg-current" style:--mask={mark.mask}></i>
  {/if}
</span>

<style>
  /* residual: foreign-dom */
  [data-slot="mark"] :global(svg) {
    width: 100%;
    height: 100%;
  }
  /* residual: unmapped */
  i {
    mask: var(--mask) center / contain no-repeat;
  }
</style>
