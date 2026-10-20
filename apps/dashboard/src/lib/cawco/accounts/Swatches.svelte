<script lang="ts">
  /** The seven account colours; the chosen one ringed. */
  import { type AccountHue, accountsWords } from "@cawco/core";
  import { hueVar } from "./model.svelte";

  let {
    value = $bindable(),
    label = accountsWords.colour,
  }: { value: AccountHue; label?: string } = $props();
</script>

<div aria-label={label} class="flex flex-wrap gap-space-3" role="radiogroup">
  {#each accountsWords.swatches as swatch (swatch.hue)}
    <!-- biome-ignore lint/a11y/useSemanticElements: a colour swatch ringed when chosen; a native radio cannot draw it -->
    <button
      aria-checked={value === swatch.hue}
      aria-label={swatch.name}
      class="touch-hit size-space-7 rounded-sm border-none border-current bg-(--c) transition-[box-shadow,scale] dur-control ease-out focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-solid focus-visible:outline-focus-ring focus-visible:outline-offset-(--space-1) aria-checked:shadow-(--swatch-on) motion-safe:active:scale-(--press-scale)"
      onclick={() => {
        value = swatch.hue;
      }}
      role="radio"
      type="button"
      style:--c={hueVar(swatch.hue)}
      style:--swatch-on={"0 0 0 var(--focus-ring-width) var(--swatch-ground, var(--surface-raised)), 0 0 0 var(--space-1) var(--c)"}
    ></button>
  {/each}
</div>
