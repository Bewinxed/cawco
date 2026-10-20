<script lang="ts">
  /**
   * The top bar's glass (DESIGN.md, Top bar's trailing edge): one group on
   * the bar's control height, a capsule of the panel's glass holding the
   * bar's borderless items concentric inside it, Caw's head last at the
   * edge. Under the desk line it is Caw's tab tucked into the screen's
   * trailing edge, square on that side and round on the other, topping with
   * the tabs and standing a neck (`--caw-neck`) clear of the row's floor.
   *
   * Its form follows the shell, not the window: the phone form answers to
   * the `shell` container (`@max-desk/shell`, the shell's root, as wide as
   * the window), so a frame of any width draws the form its own width
   * would. It knows nothing of the stores: what it holds arrives as
   * `children` (the bar's controls) and `head` (Caw's head), its states as
   * props (`joined`, `instant`, bar-glass).
   *
   * While a card hangs from it (Caw's panel, the machines, Jump, Files:
   * HangCard `glass`) the glass is one shape with the card (DESIGN.md, Caw's
   * panel): its join takes the card's `surface-raised` and `border-control`
   * edge over its top, down its flanks and up a `radius-lg` flare at its
   * leading foot, with no edge across the foot, fading in over `--dur-pop`
   * and out over `--dur-exit`; a card the keyboard opened changes it at once
   * (`instant`). On the phone the join runs on down through the neck, square
   * on the screen's side.
   */
  import type { Snippet } from "svelte";

  let {
    head,
    children,
    joined = false,
    instant = false,
  }: {
    /** Caw's head, last in the group, at the edge. */
    head: Snippet;
    /** The bar's controls ahead of the head (Files, Jump, the machines). */
    children?: Snippet;
    /** A card stands drawn out of the glass: the glass draws its join. */
    joined?: boolean;
    /** The card standing came from the keyboard: the join comes and goes at once. */
    instant?: boolean;
  } = $props();
</script>

<!-- The glass is drawn by a layer under the items (`before:`), never by the
     group itself: a backdrop filter on the group would make it the box
     Caw's fixed drawer is laid out in. `--flare` is how far its leading
     foot flares into the card (HangCard reads it). Caw, the phone group's
     one item, is the glass's whole box there. -->
<div
  data-slot="tools"
  class="group/tools relative flex items-center gap-c-bar-group-pad h-c-btn-h p-c-bar-group-pad rounded-pill hit-gap-x-(--c-bar-group-pad) coarse:gap-space-5 coarse:hit-gap-x-(--space-5) before:absolute before:inset-0 before:rounded-inherit before:border before:border-border-hairline before:bg-material-panel before:shadow-tile before:glass-backdrop before:pointer-events-none contrast-more:before:border-border-contrast contrast-more:before:bg-surface-raised contrast-more:before:backdrop-filter-none reduced-transparency:before:border-border-contrast reduced-transparency:before:bg-surface-raised reduced-transparency:before:backdrop-filter-none @max-desk/shell:before:border-e-0 @max-desk/shell:self-start @max-desk/shell:h-c-bar-caw-glass-phone @max-desk/shell:mt-(--tools-top) @max-desk/shell:p-0 @max-desk/shell:rounded-s-(--tools-round) @max-desk/shell:rounded-e-none @max-desk/shell:caw-neck-(--tools-neck) @max-desk/shell:**:data-bar-item:w-c-bar-caw-glass-phone @max-desk/shell:**:data-bar-item:min-w-c-bar-caw-glass-phone @max-desk/shell:**:data-bar-item:h-c-bar-caw-glass-phone"
  data-bar-group
  data-instant={instant ? "" : undefined}
  data-joined={joined ? "" : undefined}
  style:--flare="var(--radius-lg)"
  style:--tools-top="calc(var(--c-top-bar-h) - var(--c-tab-row-h))"
  style:--tools-round="calc(var(--c-bar-caw-glass-phone) / 2)"
  style:--tools-neck={"calc(var(--c-tab-row-h) - var(--c-bar-caw-glass-phone))"}
>
  <!-- The join: a layer one flare wider than the glass on its leading side
       and 1px under its foot, into the card's top edge. The layer is the
       edge's ink in the outline (`--join-edge`), its `::before` the surface
       1px inside it (`clip-join`), so the edge runs up the flare, both
       flanks and over the top. Its top corners are the pill's end (`--r`). -->
  <span
    data-slot="join"
    aria-hidden="true"
    class="absolute inset-bs-0 -inset-be-px -start-(--f) end-0 pointer-events-none opacity-0 bg-border-control clip-path-(--join-edge) transition-[opacity] duration-(--dur-exit) ease-out [--r:var(--join-round)] group-data-joined/tools:opacity-100 group-data-joined/tools:not-group-data-instant/tools:duration-(--dur-pop) group-data-instant/tools:transition-off before:absolute before:inset-0 before:bg-surface-raised before:clip-join @max-desk/shell:-inset-be-(--caw-neck) @max-desk/shell:[--r:var(--tools-round)] @max-desk/shell:clip-path-(--join-edge-phone) @max-desk/shell:before:clip-join-phone"
    style:--f="var(--flare)"
    style:--h="calc(100% - 1px)"
    style:--join-round="calc(var(--c-btn-h) / 2)"
    style:--join-edge={"shape(from 0 var(--h), arc to var(--f) calc(var(--h) - var(--f)) of var(--f) ccw, line to var(--f) var(--r), arc to calc(var(--f) + var(--r)) 0 of var(--r) cw, line to calc(100% - var(--r)) 0, arc to 100% var(--r) of var(--r) cw, line to 100% 100%, line to 0 100%, close)"}
    style:--join-edge-phone={"shape(from 0 var(--h), arc to var(--f) calc(var(--h) - var(--f)) of var(--f) ccw, line to var(--f) var(--r), arc to calc(var(--f) + var(--r)) 0 of var(--r) cw, line to 100% 0, line to 100% 100%, line to 0 100%, close)"}
  ></span>
  {@render children?.()}
  {@render head()}
</div>
