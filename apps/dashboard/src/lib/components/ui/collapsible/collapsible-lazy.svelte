<script lang="ts">
  import { type Snippet, untrack } from "svelte";
  import { draw } from "./draw";

  /** Children exist in the DOM only while the panel is open (or closing):
   *  a transcript can hold hundreds of collapsed panels, and mounting their
   *  pre blocks and diffs eagerly is what made route renders take seconds.
   *
   *  What opens is drawn in steps under a frame's budget (`draw`): the
   *  snippet is handed how many of its `count` units to draw, one more per
   *  step, and a message mounted by a step draws its own blocks the same way
   *  before the next unit. A delegate's transcript drawn whole held the click
   *  for 100-120ms; drawn a fixed count per frame, a page of markdown landing
   *  beside the next made 40ms frames. A panel that mounts open is drawn
   *  whole, and so is everything in it. */
  let {
    open,
    count,
    children,
  }: { open: boolean; count: number; children?: Snippet<[number]> } = $props();

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

  // One drawer for as long as there is something left to draw. Units that
  // arrive while it runs (a read settling) are drawn by it, in its place: a
  // drawer registered again goes to the front, ahead of a message it mounted
  // that is still drawing its blocks, and that message then grew last.
  let stop: (() => void) | undefined;
  $effect(() => {
    if (!(open && rendered)) {
      stop?.();
      stop = undefined;
      return;
    }
    if (stop || untrack(() => limit) >= count) {
      return;
    }
    stop = draw({
      step: () => {
        limit = untrack(() => limit) + 1;
        const more = limit < untrack(() => count);
        if (!more) {
          stop = undefined;
        }
        return more;
      },
    });
  });
  $effect(() => () => stop?.());
</script>

{#if rendered}
  {@render children?.(limit)}
{/if}
