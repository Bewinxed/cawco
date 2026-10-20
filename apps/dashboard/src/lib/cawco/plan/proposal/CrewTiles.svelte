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
  <span class="inline-flex items-center gap-space-1" data-slot="crew">
    {#each delegates as one (one.id)}
      <button
        aria-label="{one.name} is on it: show its row"
        class="pressable grid flex-none place-items-center rounded-xs p-0 motion-safe:transition-[translate] motion-safe:duration-(--dur-control) motion-safe:ease-out hover:-translate-y-space-row"
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
