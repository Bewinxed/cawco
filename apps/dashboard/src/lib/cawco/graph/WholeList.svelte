<script lang="ts">
  /**
   * The whole set in a pane under 640px, as DESIGN.md's Map mode draws a
   * narrow map ("In a pane under 640px … the map is a list"): each machine
   * under its head in the caps role, each state its map card (WholeCard)
   * at the column's width, and under its words each move out of it, the
   * act that makes it and where it goes ("Fill it in", "Just opened →
   * Filled in"). Nothing pans or zooms, so every word stands at its own
   * size. It opens on the state on stage, its machine's head whole at the
   * top where that shows it (list-place `placeOpen`), as the narrow map
   * opens on the canvas's own card. A machine always holds a state (model
   * `reviewOf`), so no group stands empty. One press on a card keeps its
   * state, or, while comparing, compares with it, as on the map.
   */
  import { graphWords as words } from "@cawco/core/words/graph";
  import { untrack } from "svelte";
  import { placeOpen } from "./list-place";
  import type { Review } from "./model";
  import type { StateCard } from "./StateNode.svelte";
  import WholeCard from "./WholeCard.svelte";

  let {
    review,
    kept,
    cardOf,
    onmove,
  }: {
    review: Review;
    /** The state on stage: the list opens on it. */
    kept: string;
    /** A state's card, as the map draws it. */
    cardOf: (id: string) => StateCard | null;
    /** A move pressed: it opens on the Animation face, as the map's arrow does. */
    onmove: (from: string, to: string) => void;
  } = $props();

  const nameOf = (id: string) => review.states[id]?.name ?? id;
  const outOf = (id: string) => review.moves.filter((move) => move.from === id);

  /** Placed once, as the list comes: from then on its place is his. */
  const openOnKept = (scroller: HTMLElement) => {
    untrack(() => {
      const row = scroller.querySelector<HTMLElement>(
        `[data-state-id="${CSS.escape(kept)}"]`
      );
      if (row) {
        placeOpen(scroller, row);
      }
    });
  };
</script>

<section
  data-slot="whole-list"
  class="kit-edge-fade-block grid min-h-0 min-w-0 flex-1 content-start gap-space-5 overflow-y-auto overscroll-contain pt-(--face-top,0px) scroll-timeline-transcript-head"
  aria-label={words.wholeMap(review.name)}
  {@attach openOnKept}
>
  {#each review.machines as machine (machine.name)}
    <section aria-label={machine.name} class="grid min-w-0 gap-space-2">
      {#if review.machines.length > 1}
        <h3 class="m-0 truncate text-ink-muted type-caps">{machine.name}</h3>
      {/if}
      <ol class="m-0 grid min-w-0 list-none gap-space-3 p-0">
        {#each machine.path as id (id)}
          {@const card = cardOf(id)}
          {#if card}
            <li class="min-w-0" data-state-id={id}>
              <WholeCard {card} wide>
                {#each outOf(id) as move (move.to)}
                  <!-- A move is a press of its own over the card's: it
                       opens on the Animation face, as the map's arrow does. -->
                  <button
                    type="button"
                    class="pointer-hit touch-hit relative -mx-space-1 flex min-w-0 flex-wrap gap-x-space-2 rounded-xs px-space-1 text-start type-meta transition-control can-hover:hover:bg-surface-hover"
                    onclick={() => onmove(move.from, move.to)}
                  >
                    {#if move.label}
                      <span class="text-ink-row">{move.label}</span>
                    {/if}
                    <span class="min-w-0 text-ink-muted wrap-anywhere"
                      >{words.move(nameOf(move.from), nameOf(move.to))}</span
                    >
                  </button>
                {/each}
              </WholeCard>
            </li>
          {/if}
        {/each}
      </ol>
    </section>
  {/each}
</section>
