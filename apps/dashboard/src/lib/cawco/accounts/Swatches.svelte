<script lang="ts">
  /** The seven account colours; the chosen one ringed. */
  import type { AccountHue } from "@cawco/core";
  import { hueVar, SWATCHES } from "./model.svelte";

  let {
    value = $bindable(),
    label = "Colour",
  }: { value: AccountHue; label?: string } = $props();

  const NAMES: Record<AccountHue, string> = {
    amber: "Amber",
    blue: "Blue",
    cyan: "Cyan",
    green: "Green",
    orange: "Orange",
    rose: "Rose",
    violet: "Violet",
  };
</script>

<div aria-label={label} class="swatches" role="radiogroup">
  {#each SWATCHES as hue (hue)}
    <!-- biome-ignore lint/a11y/useSemanticElements: a colour swatch ringed when chosen; a native radio cannot draw it -->
    <button
      aria-checked={value === hue}
      aria-label={NAMES[hue]}
      class="swatch touch-hit"
      onclick={() => {
        value = hue;
      }}
      role="radio"
      type="button"
      style:--c={hueVar(hue)}
    ></button>
  {/each}
</div>

<style>
  .swatches {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
  }
  .swatch {
    width: 26px;
    height: 26px;
    border: 0;
    border-radius: var(--radius-sm);
    background: var(--c);
    cursor: pointer;
    transition: box-shadow var(--dur-control) var(--ease-out);
  }
  @media (prefers-reduced-motion: no-preference) {
    .swatch {
      transition:
        box-shadow var(--dur-control) var(--ease-out),
        transform var(--dur-control) var(--ease-out);
    }
    .swatch:active {
      transform: scale(var(--press-scale));
    }
  }
  .swatch[aria-checked="true"] {
    box-shadow:
      0 0 0 2px var(--swatch-ground, var(--surface-raised)),
      0 0 0 4px var(--c);
  }
  .swatch:focus-visible {
    outline: var(--focus-ring-width) solid var(--focus-ring);
    outline-offset: 5px;
  }
</style>
