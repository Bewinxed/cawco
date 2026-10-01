<script lang="ts">
  import { machineLabel } from "@cawco/core";
  /**
   * The line under an install command: waiting while no new machine has
   * checked in, and which machine joined once one has. Reads one CheckIn —
   * the watcher both join surfaces share — so the popover and the dialog
   * flip on the same frame for the same machine.
   */
  import type { Snippet } from "svelte";
  import type { CheckIn } from "./join.svelte";

  let { checkIn, trail }: { checkIn: CheckIn; trail?: Snippet } = $props();
</script>

<div class="status">
  <span aria-live="polite" class="said">
    <span class="dot" class:online={checkIn.joined !== undefined}></span>
    {#if checkIn.joined}
      {machineLabel(checkIn.joined.hostname)}
      joined the fleet.
    {:else}
      Waiting for check-in…
    {/if}
  </span>
  {#if trail}
    {@render trail()}
  {/if}
</div>

<style>
  .status {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-height: 30px;
  }
  .said {
    display: flex;
    align-items: center;
    gap: 8px;
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .dot {
    flex: none;
    width: 6px;
    height: 6px;
    border-radius: var(--radius-pill);
    background: var(--hue-orange-500);
    transition: background-color var(--dur-control) var(--ease-out);
  }
  .dot.online {
    background: var(--hue-green-500);
  }
</style>
