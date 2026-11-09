<script lang="ts">
  /**
   * The states list (spec, The states; the journey): every state of the
   * component in front, under its machine's section head (the app's list
   * section, `sectionHeadVariants`), in each machine's path order, one row
   * each (StateItem). Under it the journey's steps along the same order:
   * Previous, where he stands in words ("8 of 11, Failed save"), Next. The
   * list opens with the kept row in view and a machine's head whole at its
   * top, never cut; after that a press leaves it where it stands and a
   * step brings the kept row in by the least it takes. The steps stay at
   * its foot.
   */
  import { bringIntoView } from "@cawco/core/bring-into-view";
  import { highlight } from "#lib/components/ui/highlight/highlight.svelte.js";
  import { sectionHeadVariants } from "#lib/components/ui/section-header/index.js";
  import { frameSize } from "#lib/platform/frame-observer.js";
  import { placeOpen } from "./list-place";
  import { pathOf, type Review } from "./model";
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
    lang,
  }: {
    review: Review;
    kept: string;
    keptVariant: string | null;
    against: string | null;
    /** It draws the steps at its foot (none where the stage's foot holds them). */
    stepper?: boolean;
    onpress: (state: string, variant: string | null) => void;
    onstep: (state: string) => void;
    /** The page's language, for the steps' figures. */
    lang: string | undefined;
  } = $props();

  const path = $derived(pathOf(review));
  const at = $derived(path.indexOf(kept));
  const many = $derived(review.machines.length > 1);

  let list = $state<HTMLElement>();
  /** He has scrolled or pressed in the list: its place is his from then on. */
  let touched = false;
  const rowOf = (scroller: HTMLElement, id: string) =>
    scroller.querySelector<HTMLElement>(`[data-state-id="${CSS.escape(id)}"]`);
  let placedFor: string | null = null;
  $effect(() => {
    const scroller = list;
    const id = kept;
    const row = scroller ? rowOf(scroller, id) : null;
    if (!(scroller && row)) {
      return;
    }
    if (placedFor === null) {
      placedFor = id;
      placeOpen(scroller, row);
      return;
    }
    if (placedFor !== id) {
      placedFor = id;
      touched = true;
      bringIntoView(row, { at: "nearest" });
    }
  });
  // The list relaid places its open row again: a scroll, so it runs in
  // the next frame with the writes (frameSize's `take`), not in the delivery.
  const relaid = frameSize(
    (node: HTMLElement) => node,
    (node) => {
      const scroller = node.parentElement;
      const row = scroller ? rowOf(scroller, kept) : null;
      if (scroller && row && !touched) {
        placeOpen(scroller, row);
      }
    }
  );
  /** His own scroll, press or key in the list: its place is his. */
  const heard = (node: HTMLElement) => {
    const leave = () => {
      touched = true;
    };
    const kinds = ["wheel", "pointerdown", "touchmove", "keydown"] as const;
    for (const kind of kinds) {
      node.addEventListener(kind, leave, { passive: true });
    }
    return () => {
      for (const kind of kinds) {
        node.removeEventListener(kind, leave);
      }
    };
  };
</script>

<div data-slot="journey" class="flex min-h-0 min-w-0 flex-1 flex-col">
  <!-- Its scrollbar's gutter held whether or not the list overflows: the
       steps at its foot come and go with the kept state's path (Stepper
       draws none for a path of one), and a scrollbar that came with them
       took its width from the rows, which wrapped anew. -->
  <!-- Hover is the list's one ghost, as the app's own lists draw it; the
       kept row is marked in its own words (StateItem), never a fill. Cut
       at an edge, the list fades there (the house edge fade). -->
  <div
    bind:this={list}
    {@attach heard}
    class="kit-edge-fade-block -mx-space-1 min-h-0 min-w-0 flex-1 overflow-y-auto px-space-1 pt-(--face-top,0px) scrollbar-gutter-stable scroll-timeline-transcript-head"
    {@attach highlight({ rows: '[data-slot="state-item"]' })}
  >
    <div class="min-w-0" {@attach relaid}>
      {#each review.machines as one (one.name)}
        <section
          aria-label={one.name}
          class="flex min-w-0 flex-col pb-space-4 last:pb-space-1"
        >
          {#if many}
            <h3 class={sectionHeadVariants({ class: "m-0 mb-space-1" })}>
              <span
                class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
                >{one.name}</span
              >
            </h3>
          {/if}
          <ol class="m-0 flex min-w-0 list-none flex-col gap-space-1 p-0">
            {#each one.path as id (id)}
              {@const state = review.states[id]}
              {#if state}
                <li class="min-w-0" data-state-id={id}>
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
  </div>

  {#if stepper}
    <!-- The room's foot: a hairline the room's width, as its head's. -->
    <div
      class="-mx-space-4 -mb-space-4 border-t border-border-hairline px-space-4 py-space-1"
    >
      <Stepper {at} {lang} {onstep} {path} />
    </div>
  {/if}
</div>
