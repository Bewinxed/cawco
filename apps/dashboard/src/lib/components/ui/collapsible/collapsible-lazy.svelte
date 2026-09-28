<script lang="ts">
  import { flushSync, type Snippet, untrack } from "svelte";

  /** Children exist in the DOM only while the panel is open (or closing):
   *  a transcript can hold hundreds of collapsed panels, and mounting their
   *  pre blocks and diffs eagerly is what made route renders take seconds.
   *
   *  What opens is drawn a frame's budget at a time. The snippet is handed
   *  how many of its `count` units to draw, and each frame draws units one
   *  by one until the frame has spent its budget: the head lands in the
   *  first frames, the rest below it right behind, and no frame carries more
   *  than one heavy unit. A delegate's transcript drawn whole held the click
   *  for 100-120ms; drawn a fixed four rows then one a frame it took a
   *  second to finish, and a page of markdown landing beside the report of
   *  the same page made one 40ms frame. A panel that mounts open is drawn
   *  whole. */
  let {
    open,
    count,
    alone,
    children,
  }: {
    open: boolean;
    count: number;
    /**
     * Units heavy enough to take a frame to themselves — a page of markdown
     * is 10ms to build and 15ms to lay out in WebKit. One is drawn first in
     * its frame and ends it, instead of landing after the budget's other
     * units and doubling that frame.
     */
    alone?: (index: number) => boolean;
    children?: Snippet<[number]>;
  } = $props();

  /**
   * What a frame may spend drawing units, in ms: each unit is drawn,
   * flushed and laid out on its own, and the budget is checked after it, so
   * a unit that costs more than the budget is drawn alone in its frame.
   */
  const BUDGET_MS = 8;

  // Seeded from the initial `open` so a panel that starts open is server-rendered:
  // effects do not run during SSR, so waiting for one would ship it empty.
  // svelte-ignore state_referenced_locally
  let rendered = $state(open);
  // A panel that mounts open — the virtualiser building its row again, a
  // pane coming back — is drawn whole, at the height it was left at.
  // svelte-ignore state_referenced_locally
  let limit = $state(open ? Number.POSITIVE_INFINITY : 0);

  $effect.pre(() => {
    if (open) {
      rendered = true;
    }
  });

  // Keep content through the 160ms fold shut (`collapsible-content`) plus slack, then drop it.
  $effect(() => {
    if (!open && rendered) {
      const timer = setTimeout(() => {
        rendered = false;
        limit = 0;
      }, 200);
      return () => clearTimeout(timer);
    }
  });

  $effect(() => {
    if (!(open && rendered) || limit >= count) {
      return;
    }
    const frame = requestAnimationFrame((start) => {
      const total = untrack(() => count);
      let drawn = 0;
      for (;;) {
        const next = untrack(() => limit);
        const heavy = alone?.(next) ?? false;
        if (drawn > 0 && heavy) {
          break;
        }
        flushSync(() => {
          limit = next + 1;
        });
        // Laid out here rather than after the frame's callbacks, so what a
        // unit costs to lay out — a page of markdown is most of its cost —
        // counts against the budget it was drawn under.
        // biome-ignore lint/complexity/noVoid: a layout read, made for its side effect of laying the unit out now
        void document.documentElement.offsetHeight;
        drawn += 1;
        if (
          heavy ||
          next + 1 >= total ||
          performance.now() - start >= BUDGET_MS
        ) {
          break;
        }
      }
    });
    return () => cancelAnimationFrame(frame);
  });
</script>

{#if rendered}
  {@render children?.(limit)}
{/if}
