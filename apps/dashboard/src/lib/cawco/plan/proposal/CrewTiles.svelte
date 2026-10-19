<script lang="ts">
  /**
   * WHO IS ON A TO-DO (proposal, Crew first): each delegate's own tile at
   * the to-do's trailing edge, at the tree mark's 18px (DESIGN.md), a
   * --space-1 apart, never stacked over one another. A fine pointer lifts
   * the one under it; pressing one points at that delegate's row in the
   * stack above. A tile arrives from 0.92 over 120ms and leaves over
   * --dur-exit.
   */
  import { scale } from "svelte/transition";
  import SessionMark from "#lib/cawco/SessionMark.svelte";
  import type { Delegate } from "./fixtures";
  import { pointAt, useView } from "./view.svelte";

  let { delegates }: { delegates: Delegate[] } = $props();

  const view = useView();
</script>

{#if delegates.length > 0}
  <span class="crew" data-slot="crew">
    {#each delegates as one (one.id)}
      <button
        aria-label="{one.name} is on it: show its row"
        class="mini pressable"
        in:scale={{ start: 0.92, duration: 120 }}
        onclick={(event) => pointAt(view, event.currentTarget, one.id)}
        out:scale={{ start: 0.92, duration: 160 }}
        type="button"
      >
        <SessionMark id={one.id} place={one.place} status="idle" />
      </button>
    {/each}
  </span>
{/if}

<style>
  .crew {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
  }
  .mini {
    --mark-size: var(--pv-tile, 18px);
    display: grid;
    flex: none;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: var(--radius-xs);
    background: none;
    cursor: pointer;

    &:focus-visible {
      outline: 2px solid var(--focus-ring);
      outline-offset: 2px;
    }
    @media (prefers-reduced-motion: no-preference) {
      transition: translate var(--dur-control) var(--ease-out);
    }
  }
  @media (hover: hover) and (pointer: fine) {
    .mini:hover {
      translate: 0 -2px;
    }
  }
</style>
