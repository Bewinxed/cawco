<script lang="ts">
  /**
   * The desk's side card at the split's 360px, as tall as the split gives
   * it, holding the plan. It was opened from the plan's ring, which already
   * names it, so it carries no title, no count and no task badge (DESIGN.md,
   * The Title Bars Follow Liquid Glass Rule: "A side panel or column the
   * person opened by its name … carries no title: its title area stays
   * empty and its actions float over its content"). Expand and Close float
   * at its trailing edge as one capsule of the panel's glass holding bare
   * symbols, the top bar's glass recipe (BarGlass); the plan runs to the
   * card's top edge under them, its first row standing clear of them at
   * rest and blurring and fading under them once it scrolls (the house edge
   * fade). Expand does nothing here.
   */
  import type { Snippet } from "svelte";
  import { capEdgeFades } from "#lib/cawco/edge-fade-caps.js";
  import { IconClose, IconMaximize } from "#lib/icons.js";
  import { holdOn } from "./focus";
  import { standWhole } from "./whole";

  let {
    focus,
    whole = false,
    children,
  }: {
    /** The row the card stands scrolled to (a step a story opens). */
    focus?: string;
    /** Show the whole plan, the frame as tall as it is (standWhole): a decision page's drawing. */
    whole?: boolean;
    children: Snippet;
  } = $props();

  let desk = $state<HTMLElement>();

  /** The split's height the card stands at (its block size, c-plan-card-h). */
  const DESK_TALL = 680;
</script>

<!-- One cell the card fills, at the split's 680px whatever holds it. -->
<section
  aria-label="Plan"
  bind:this={desk}
  class="relative grid h-c-plan-card-h w-c-plan-card-w max-w-full grid-cols-1 grid-rows-1 rounded-lg bg-surface-raised shadow-drawer"
  data-slot="side-card"
>
  <!-- The bar: no ground of its own, one glass group trailing. -->
  <div
    class="pointer-events-none absolute inset-x-0 top-0 z-2 flex justify-end p-space-2"
    data-slot="side-head"
  >
    <div
      class="pointer-events-auto relative flex items-center gap-c-bar-group-pad h-c-btn-h p-c-bar-group-pad rounded-pill hit-gap-x-c-bar-group-pad before:absolute before:inset-0 before:rounded-inherit before:border before:border-border-hairline before:bg-material-panel before:shadow-tile before:glass-backdrop before:pointer-events-none contrast-more:before:border-border-contrast contrast-more:before:bg-surface-raised contrast-more:before:backdrop-filter-none reduced-transparency:before:border-border-contrast reduced-transparency:before:bg-surface-raised reduced-transparency:before:backdrop-filter-none"
      data-bar-group
      data-slot="tools"
    >
      <button
        aria-label="Expand"
        class="touch-hit press-tint"
        data-bar-item
        title="Expand"
        type="button"
      >
        <IconMaximize aria-hidden="true" data-slot="bar-symbol" />
      </button>
      <button
        aria-label="Close"
        class="touch-hit press-tint"
        data-bar-item
        data-slot="close"
        title="Close"
        type="button"
      >
        <IconClose aria-hidden="true" data-slot="bar-symbol" />
      </button>
    </div>
  </div>
  <div
    class="kit-edge-fade-block min-h-0 overflow-y-auto overscroll-contain px-space-4 pt-(--plan-top) pb-space-4"
    data-slot="plan-scroll"
    style:--plan-top="calc(var(--c-btn-h) + 2 * var(--space-2))"
    {@attach holdOn(focus)}
    {@attach capEdgeFades}
    {@attach whole && standWhole(() => desk, DESK_TALL)}
  >
    {@render children()}
  </div>
</section>
