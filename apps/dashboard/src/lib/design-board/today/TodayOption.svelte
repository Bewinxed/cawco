<script lang="ts">
  /**
   * COMPARISON ONLY, deleted once the owner picks (2026-11-25): a listed
   * option as it stood at 5cecb35a9f, its mark in a `mark-cell` one line
   * tall, its words bare beside it; picked by its pressed state, which the
   * chip draws as it drew a checked radio.
   */
  import type { Snippet } from "svelte";
  import { today } from "./today.js";

  let { chosen, children }: { chosen: boolean; children: Snippet } = $props();
</script>

<button aria-pressed={chosen} class={today.option} type="button">
  <span aria-hidden="true" class="mark-cell" data-box>
    <span
      class={[
        "grid size-icon-md flex-none place-items-center rounded-pill",
        chosen ? "radio-on" : "border border-ui-3 bg-bg",
      ]}
    ></span>
  </span>
  {@render children()}
</button>
