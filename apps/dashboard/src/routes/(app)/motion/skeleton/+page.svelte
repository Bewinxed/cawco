<script lang="ts">
  /**
   * SKELETON BENCH: the kit skeleton's pulse and its reveal (DESIGN.md
   * Skeleton; transitions.dev Skeleton loader and reveal), read by the
   * `skeleton-motion` spec. It opens on its content; `window.__skeletonBench`
   * `wait()` puts the skeleton in its place (its pulse starts), and `load()`
   * hands the place back to the content as every skeleton swap does: the
   * skeleton by `revealOut`, the content by `reveal` (motion/curves). The
   * list under it does the same as a `reflow` list does (motion/rows): its
   * skeleton rows, marked `data-flip-skeleton`, hand their place to its rows.
   */
  import { onMount } from "svelte";
  import { reveal, revealOut } from "#lib/cawco/motion/curves.svelte.js";
  import { reflow } from "#lib/cawco/motion/rows.svelte.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";

  let waiting = $state(false);
  onMount(() => {
    (
      window as unknown as {
        __skeletonBench: { load: () => void; wait: () => void };
      }
    ).__skeletonBench = {
      load: () => {
        waiting = false;
      },
      wait: () => {
        waiting = true;
      },
    };
  });
</script>

<div class="p-space-7">
  <div
    class="relative flex w-c-canvas-skeleton-w flex-col gap-space-2"
    data-bench="stage"
  >
    {#if waiting}
      <div
        aria-busy="true"
        aria-label="Reading"
        class="flex flex-col gap-space-2"
        data-case="skeleton"
        role="status"
        out:revealOut
      >
        <Skeleton class="w-3/5" line="label" radius="text" />
        <Skeleton class="w-full" line="body" radius="text" />
        <Skeleton line="meta" radius="text" width="name" />
      </div>
    {:else}
      <div class="flex flex-col gap-space-2" data-case="content" in:reveal>
        <p class="type-label m-0 text-ink-strong">Pricing tiers</p>
        <p class="type-body m-0 text-ink-strong">
          Three plans, each a step up from the last.
        </p>
        <p class="type-meta m-0 text-ink-muted">Updated 3d ago</p>
      </div>
    {/if}
  </div>
  <div
    class="mt-space-7 flex w-c-canvas-skeleton-w flex-col"
    data-bench="list"
    {@attach reflow()}
  >
    {#if waiting}
      {#each [0, 1, 2] as row (row)}
        <div
          class="flex h-c-btn-h items-center px-space-3"
          data-case="skeleton-row"
          data-flip
          data-flip-skeleton
        >
          <Skeleton class="w-3/5" line="label" radius="text" />
        </div>
      {/each}
    {:else}
      {#each ["Harbour", "Lantern", "Quay"] as name (name)}
        <div
          class="type-label flex h-c-btn-h items-center px-space-3 text-ink-strong"
          data-case="row"
          data-flip
        >
          {name}
        </div>
      {/each}
    {/if}
  </div>
</div>
