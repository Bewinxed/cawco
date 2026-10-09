<script lang="ts">
  /**
   * An account's tile: its provider's mark in one ink, the account's colour,
   * on that colour at a low alpha.
   */
  import type { AccountHue } from "@cawco/core";
  import { hueVar } from "./model.svelte";
  import ProviderMark from "./ProviderMark.svelte";

  let {
    hue,
    provider,
    size = 32,
  }: { hue: AccountHue; provider: string; size?: 28 | 32 } = $props();
</script>

<span
  aria-hidden="true"
  class="tile"
  style:--c={hueVar(hue)}
  style:--tile={`${size}px`}
>
  <ProviderMark mono {provider} size={size === 32 ? 18 : 16} />
</span>

<style>
  .tile {
    display: grid;
    flex: none;
    place-items: center;
    width: var(--tile);
    height: var(--tile);
    border-radius: var(--radius-sm);
    background: color-mix(in oklab, var(--c) 18%, transparent);
    color: var(--c);
    transition:
      background-color var(--dur-fade) var(--ease-out),
      color var(--dur-fade) var(--ease-out);
  }
</style>
