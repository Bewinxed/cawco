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
  aria-hidden="true"
  class={["mark", mono && "mono"]}
  style:--mark-size={`${size}px`}
>
  {#if !mark}
    <IconAccounts />
  {:else if mark.logo && !mono}
    <!-- The mark's own source, from the icon sets bundled at build. -->
    {@html mark.logo}
  {:else}
    <i class="ink" style:--mask={mark.mask}></i>
  {/if}
</span>

<style>
  .mark {
    display: inline-grid;
    flex: none;
    place-items: center;
    width: var(--mark-size);
    height: var(--mark-size);
    color: var(--ink-strong);
  }
  .mono {
    color: inherit;
  }
  .mark :global(svg) {
    width: 100%;
    height: 100%;
  }
  .ink {
    width: 100%;
    height: 100%;
    background: currentColor;
    mask: var(--mask) center / contain no-repeat;
  }
</style>
