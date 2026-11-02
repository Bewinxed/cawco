<script lang="ts">
  /**
   * The states list (spec, The states; the journey): every state of the
   * component in front, under its machine's section head (the app's list
   * section, `sectionHeadVariants`), in each machine's path order, one row
   * each (StateItem). Under it the journey's steps through the kept
   * state's machine: Previous, where he stands in words ("2 of 2, Failed
   * save"), Next. The list scrolls, the kept row in view as it is kept;
   * the steps stay at its foot.
   */
  import { bringIntoView } from "@cawco/core/bring-into-view";
  import { sectionHeadVariants } from "#lib/components/ui/section-header/index.js";
  import type { Review } from "./model";
  import StateItem from "./StateItem.svelte";
  import Stepper from "./Stepper.svelte";

  let {
    review,
    kept,
    keptVariant,
    against,
    stepper = true,
    onpress,
    onstep,
  }: {
    review: Review;
    kept: string;
    keptVariant: string | null;
    against: string | null;
    /** It draws the steps at its foot (none where the stage's foot holds them). */
    stepper?: boolean;
    onpress: (state: string, variant: string | null) => void;
    onstep: (state: string) => void;
  } = $props();

  const machine = $derived(
    review.machines.find((one) => one.path.includes(kept))
  );
  const path = $derived(machine?.path ?? []);
  const at = $derived(path.indexOf(kept));
  const many = $derived(review.machines.length > 1);
</script>

<div data-slot="journey" class="flex min-h-0 min-w-0 flex-1 flex-col">
  <!-- Its scrollbar's gutter held whether or not the list overflows: the
       steps at its foot come and go with the kept state's path (Stepper
       draws none for a path of one), and a scrollbar that came with them
       took its width from the rows, which wrapped anew. -->
  <div
    class="-mx-space-1 min-h-0 min-w-0 flex-1 overflow-y-auto px-space-1 scrollbar-gutter-stable"
  >
    {#each review.machines as one (one.name)}
      <section
        aria-label={one.name}
        class="flex min-w-0 flex-col pb-space-4 last:pb-space-1"
      >
        {#if many}
          <h3 class={sectionHeadVariants({ class: "m-0 mb-space-1" })}>
            <span class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
              >{one.name}</span
            >
          </h3>
        {/if}
        <ol class="m-0 flex min-w-0 list-none flex-col gap-space-1 p-0">
          {#each one.path as id (id)}
            {@const state = review.states[id]}
            {#if state}
              <li
                class="min-w-0"
                {@attach (node: HTMLElement) => {
                  if (id === kept) {
                    bringIntoView(node, { at: "nearest" });
                  }
                }}
              >
                <StateItem
                  against={id === against}
                  kept={id === kept}
                  keptVariant={id === kept ? keptVariant : null}
                  onpress={(variant) => onpress(id, variant)}
                  {state}
                />
              </li>
            {/if}
          {/each}
        </ol>
      </section>
    {/each}
  </div>

  {#if stepper}
    <div class="border-t border-border-hairline pt-space-2">
      <Stepper
        {at}
        machine={machine?.name ?? ""}
        name={review.states[kept]?.name ?? ""}
        {onstep}
        {path}
      />
    </div>
  {/if}
</div>
