<script lang="ts">
  /**
   * Every system law the hub caught broken since it started (core
   * invariant.ts, hub laws.ts), one red alert each, standing over the whole
   * app in the top layer until the hub restarts. A broken law is a
   * programmer's error: the frame or request it was found in failed, and the
   * board may be behind until it is fixed, so it is never dismissed.
   */
  import {
    Alert,
    AlertDescription,
    AlertTitle,
  } from "#lib/components/ui/alert/index.js";
  import { IconError } from "#lib/icons.js";
  import { cawco } from "./client.svelte";

  let shelf = $state<HTMLDivElement | null>(null);
  const broken = $derived(cawco.lawsBroken);

  // In the top layer while any law is broken: over every pane and dialog,
  // with no stacking order of its own to keep.
  $effect(() => {
    if (!shelf) {
      return;
    }
    if (broken.length > 0 && !shelf.matches(":popover-open")) {
      shelf.showPopover();
    }
    if (broken.length === 0 && shelf.matches(":popover-open")) {
      shelf.hidePopover();
    }
  });
</script>

<div bind:this={shelf} class="laws-broken" popover="manual">
  {#each broken as law (law.law)}
    <Alert variant="destructive">
      <IconError />
      <AlertTitle>Law broken: {law.law}</AlertTitle>
      <AlertDescription>
        <span>{law.statement}</span>
        <span>{law.words}</span>
        {#if law.count > 1}
          <span>Caught {law.count} times since the hub started.</span>
        {/if}
      </AlertDescription>
    </Alert>
  {/each}
</div>

<style>
  .laws-broken {
    inset: var(--space-3) var(--space-3) auto;
    margin: 0 auto;
    max-width: var(--c-composer-w);
    padding: 0;
    border: 0;
    background: transparent;
    display: none;
    flex-direction: column;
    gap: var(--space-2);
  }

  .laws-broken:popover-open {
    display: flex;
  }
</style>
