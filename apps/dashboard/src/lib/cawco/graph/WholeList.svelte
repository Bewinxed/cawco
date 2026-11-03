<script lang="ts">
  /**
   * The whole set as a list (WholeSet's `phoneMap: "list"`, one of the
   * owner's three options for the map at a phone's width): each machine
   * under its section head, as the states list draws one, each state a
   * row with the map card's own words (its name, its marks, its note), and
   * under it each move out of it: the act that makes it and where it goes
   * ("Fill it in", "Just opened → Filled in"). Nothing pans or zooms, so
   * every word stands at its own size. One press on a row keeps its state,
   * or, while comparing, compares with it, as a card does.
   */
  import { graphWords as words } from "@cawco/core/words/graph";
  import { sectionHeadVariants } from "#lib/components/ui/section-header/index.js";
  import type { Review } from "./model";
  import StateHead from "./StateHead.svelte";
  import type { StateCard } from "./StateNode.svelte";

  let {
    review,
    cardOf,
  }: {
    review: Review;
    /** A state's card, as the map draws it. */
    cardOf: (id: string) => StateCard | null;
  } = $props();

  const nameOf = (id: string) => review.states[id]?.name ?? id;
  const outOf = (id: string) => review.moves.filter((move) => move.from === id);
</script>

<section
  data-slot="whole-list"
  class="kit-edge-fade-block min-h-0 min-w-0 flex-1 overflow-y-auto"
  aria-label={words.wholeMap(review.name)}
>
  {#each review.machines as machine (machine.name)}
    <section
      aria-label={machine.name}
      class="flex min-w-0 flex-col pb-space-4 last:pb-space-1"
    >
      {#if review.machines.length > 1}
        <h3 class={sectionHeadVariants({ class: "m-0 mb-space-1" })}>
          <span class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
            >{machine.name}</span
          >
        </h3>
      {/if}
      <ol class="m-0 flex min-w-0 list-none flex-col gap-space-1 p-0">
        {#each machine.path as id (id)}
          {@const card = cardOf(id)}
          {#if card}
            <li
              data-slot="whole-row"
              class={[
                "relative flex min-w-0 flex-col gap-space-row rounded-sm px-space-3 py-space-2",
                card.against &&
                  "outline-solid outline-(length:--c-change-ring-width) outline-c-change-ring",
              ]}
            >
              <StateHead {card} row />
              {#if card.note}
                <span
                  class={[
                    "line-clamp-2 min-w-0 type-meta text-pretty wrap-anywhere",
                    card.kept ? "text-selected-ink" : "text-ink-muted",
                  ]}>{card.note}</span
                >
              {/if}
              {#each outOf(id) as move (move.to)}
                <span class="flex min-w-0 flex-wrap gap-x-space-2 type-meta">
                  {#if move.label}
                    <span class="text-ink-row">{move.label}</span>
                  {/if}
                  <span class="min-w-0 text-ink-muted wrap-anywhere"
                    >{words.move(nameOf(move.from), nameOf(move.to))}</span
                  >
                </span>
              {/each}
            </li>
          {/if}
        {/each}
      </ol>
    </section>
  {/each}
</section>
