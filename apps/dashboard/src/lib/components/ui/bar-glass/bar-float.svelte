<script lang="ts">
  /**
   * A surface's bar as Liquid Glass draws it (DESIGN.md, The Title Bars
   * Follow Liquid Glass Rule): one row over the top of the surface's content,
   * with no ground of its own, its controls in at most three floating groups
   * (leading, centre, trailing), each the kit's BarGlass `form="group"`
   * capsule the caller draws in its snippet. The row takes no press; only
   * its groups (`data-slot="tools"`) do, so the content under the row's empty stretches stays
   * live.
   *
   * Under the groups it draws the scroll edge effect (HeadFade): what
   * scrolls under the bar blurs and fades into the content's ground (`tint`),
   * in from the first scroll and absent at rest. The surface names its
   * scroller's timeline in scope (`timeline-scope-transcript-head` on a box
   * holding both, `scroll-timeline-transcript-head` on the scroller); with
   * none in scope the edge stays clear. The content clears the row at rest
   * by `--c-top-bar-h` (HIG, Toolbars: "use a ScrollEdgeEffectStyle when
   * necessary to distinguish the toolbar area from the content area").
   *
   * The surface it heads is its positioning box (`relative`).
   */
  import type { Snippet } from "svelte";
  import HeadFade from "#lib/components/ui/scroll-edge/head-fade.svelte";

  let {
    leading,
    center,
    trailing,
    tint,
  }: {
    /** Going back and the title, where the surface has them. */
    leading?: Snippet;
    /** The view's mode or switch. */
    center?: Snippet;
    /** What acts on the view, then More, the prominent action and Close. */
    trailing?: Snippet;
    /** The ground the content stands on, a background class, for the scroll edge (HeadFade's `tint`). */
    tint?: string;
  } = $props();
</script>

<HeadFade band="var(--c-top-bar-h)" {tint} />
<div
  data-slot="bar"
  class="pointer-events-none absolute inset-x-0 top-0 z-2 grid h-c-top-bar-h grid-cols-[1fr_auto_1fr] items-center gap-space-2 px-space-2 [&_[data-slot=tools]]:pointer-events-auto"
>
  <div class="flex min-w-0 items-center gap-space-2 justify-self-start">
    {@render leading?.()}
  </div>
  <div class="flex items-center justify-self-center">
    {@render center?.()}
  </div>
  <div class="flex items-center gap-space-2 justify-self-end">
    {@render trailing?.()}
  </div>
</div>
