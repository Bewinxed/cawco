<script lang="ts">
  /** An account's tile: its glyph in its colour, on that colour at a low alpha. */
  import type { AccountHue } from "@cawco/core";
  import { IconAccounts } from "#lib/icons.js";
  import { hueVar } from "./model.svelte";

  let { hue, size = 32 }: { hue: AccountHue; size?: 28 | 32 } = $props();
</script>

<span
  aria-hidden="true"
  class="tile"
  style:--c={hueVar(hue)}
  style:--tile={`${size}px`}
>
  <IconAccounts />
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
  .tile :global(svg) {
    width: 18px;
    height: 18px;
  }
</style>
