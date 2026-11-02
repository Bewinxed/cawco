<script lang="ts">
  /**
   * The whole set (spec, The whole set): every state of every machine and
   * every move out of it, drawn whole on a page that scrolls, for judging
   * whether the set is complete. Each machine is a section of the app's
   * list (`sectionHeadVariants`), each state one card (the room's raised
   * surface on its recess, its edge `border-control`), and under its name
   * where its moves go, each said as the person causes it ("Try again →
   * Saving"), moves into other machines too. An error state, and a state
   * no move reaches or none leaves, is marked by a glyph after its name;
   * its words are the glyph's tooltip and the card's description, never a
   * line on the page. One press keeps a state, or, while comparing,
   * compares with it.
   */
  import { graphWords as words } from "@cawco/core/words/graph";
  import { sectionHeadVariants } from "#lib/components/ui/section-header/index.js";
  import { IconError, IconWarningTriangle } from "#lib/icons.js";
  import { holesOf, type Review } from "./model";

  let {
    review,
    kept,
    against,
    onpress,
  }: {
    review: Review;
    kept: string;
    against: string | null;
    onpress: (state: string, variant: string | null) => void;
  } = $props();

  const outOf = (id: string) => review.moves.filter((one) => one.from === id);
  const many = $derived(review.machines.length > 1);
  const uid = $props.id();
</script>

<div
  data-slot="whole-set"
  class="-mx-space-1 min-h-0 min-w-0 flex-1 overflow-y-auto px-space-1"
>
  {#each review.machines as one (one.name)}
    <section
      aria-label={one.name}
      class="flex min-w-0 flex-col pb-space-4 last:pb-space-1"
    >
      {#if many}
        <h3 class={sectionHeadVariants({ class: "m-0 mb-space-2" })}>
          <span class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
            >{one.name}</span
          >
        </h3>
      {/if}
      <ol class="m-0 flex min-w-0 list-none flex-col gap-space-2 p-0">
        {#each one.path as id (id)}
          {@const state = review.states[id]}
          {@const holes = holesOf(review, id)}
          {@const moves = outOf(id)}
          {@const marks = [
            state?.failure ? words.errorState : null,
            holes.reaches ? null : words.nothingReaches,
            holes.leaves ? null : words.nothingLeaves,
          ].filter((mark) => mark !== null)}
          {#if state}
            <li
              data-slot="whole-state"
              class={[
                "relative flex min-w-0 flex-col gap-space-row rounded-md border px-space-3 py-space-2 transition-control",
                id === kept
                  ? "border-transparent bg-selected-bg"
                  : "border-border-control bg-surface-raised can-hover:has-[button:hover]:bg-surface-hover",
                id === against &&
                  "outline-solid outline-(length:--c-change-ring-width) outline-c-change-ring",
              ]}
            >
              <div class="mark-line flex min-w-0 items-center gap-space-2">
                <button
                  type="button"
                  aria-current={id === kept ? "true" : undefined}
                  aria-describedby={marks.length > 0
                    ? `${uid}-${id}-marks`
                    : undefined}
                  class={[
                    "min-w-0 flex-1 text-start type-label wrap-anywhere outline-none before:absolute before:inset-0 before:rounded-md focus-visible:before:outline-(length:--focus-ring-width) focus-visible:before:outline-solid focus-visible:before:outline-focus-ring focus-visible:before:-outline-offset-2",
                    id === kept ? "text-selected-ink" : "text-ink-row",
                  ]}
                  onclick={() => onpress(id, null)}
                >
                  {state.name}
                </button>
                {#if marks.length > 0}
                  <span
                    id={`${uid}-${id}-marks`}
                    class="relative flex flex-none items-center gap-space-1"
                    data-box
                    title={marks.join(". ")}
                  >
                    <span class="sr-only">{marks.join(". ")}</span>
                    {#if state.failure}
                      <IconError
                        aria-hidden="true"
                        class="size-icon-sm text-status-fail-glyph"
                        data-box
                      />
                    {/if}
                    {#if !(holes.reaches && holes.leaves)}
                      <IconWarningTriangle
                        aria-hidden="true"
                        class="size-icon-sm text-status-attn-glyph"
                        data-box
                      />
                    {/if}
                  </span>
                {/if}
              </div>
              {#if moves.length > 0}
                <ul
                  aria-label={words.movesOut(state.name)}
                  class="m-0 flex min-w-0 list-none flex-col p-0"
                >
                  {#each moves as move (move.to)}
                    <li
                      class={[
                        "min-w-0 type-meta wrap-anywhere",
                        id === kept ? "text-selected-ink" : "text-ink-muted",
                      ]}
                    >
                      {words.moveTo(
                        move.label,
                        review.states[move.to]?.name ?? move.to
                      )}
                    </li>
                  {/each}
                </ul>
              {/if}
            </li>
          {/if}
        {/each}
      </ol>
    </section>
  {/each}
</div>
