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
  data-slot="tile"
  aria-hidden="true"
  class="grid size-(--tile) flex-none place-items-center rounded-sm bg-(--c)/18 text-(color:--c) transition-[background-color,color] dur-fade ease-out"
  style:--c={hueVar(hue)}
  style:--tile={`${size}px`}
>
  <ProviderMark mono {provider} size={size === 32 ? 18 : 16} />
</span>
