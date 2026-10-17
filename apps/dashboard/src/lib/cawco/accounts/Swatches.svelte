<script lang="ts">
  /** The seven account colours; the chosen one ringed. */
  import { type AccountHue, accountsWords } from "@cawco/core";
  import { hueVar } from "./model.svelte";

  let {
    value = $bindable(),
    label = accountsWords.colour,
  }: { value: AccountHue; label?: string } = $props();
</script>

<div
  aria-label={label}
  class="flex flex-wrap gap-space-3"
  role="radiogroup"
>
  <!-- literal: 26px, 4px, 5px -->
  {#each accountsWords.swatches as swatch (swatch.hue)}
    <!-- biome-ignore lint/a11y/useSemanticElements: a colour swatch ringed when chosen; a native radio cannot draw it -->
    <button
      aria-checked={value === swatch.hue}
      aria-label={swatch.name}
      class="swatch touch-hit size-(--swatch) cursor-pointer rounded-sm border-none border-current bg-(--c) transition-[box-shadow] dur-control ease-out focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-solid focus-visible:outline-focus-ring focus-visible:outline-offset-(--swatch-focus) motion-safe:transition-[box-shadow,transform] motion-safe:active:transform-(--tpress)"
      onclick={() => {
        value = swatch.hue;
      }}
      role="radio"
      type="button"
      style:--c={hueVar(swatch.hue)}
      style:--tpress="scale(var(--press-scale))"
      style:--swatch="26px"
      style:--swatch-ring="4px"
      style:--swatch-focus="5px"
    ></button>
  {/each}
</div>

<style>
  /* residual: unmapped */
  .swatch[aria-checked="true"] {
    box-shadow:
      0 0 0 2px var(--swatch-ground, var(--surface-raised)),
      0 0 0 var(--swatch-ring) var(--c);
  }
</style>
