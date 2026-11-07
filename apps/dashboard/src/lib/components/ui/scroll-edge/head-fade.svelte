<!--
  The transcript's head dissolving into the chosen tab: rows scrolled up past
  the transcript's top edge blur progressively toward it, up to
  `--c-head-fade-blur` at the edge over `--c-head-fade`, and dissolve into the
  chosen tab's sheet (`--tab-sheet`, the fill PaneTabs paints the tab in), so
  at the edge they have become the tab's fill and the transcript and its tab
  read as one sheet (owner: "it should not just be a blur, but it should blur
  into the color of the highlighted tab"). A pane draws it beside FootFade, in
  the transcript's own layer, so the transcript's overlays stand above it and
  only its rows pass under.

  A head floating over its content (a bar, BarFloat; a sheet's or a panel's
  head) draws the same edge under it: `band` is the head's room and `tint`
  the ground the content stands on. Under the room the ground is whole, so
  nothing that scrolls there is drawn under the head's words; the blur and
  the fade run over `--c-head-fade` below it, where the rows leave the room
  (DESIGN.md, The Title Bars Follow Liquid Glass Rule; HIG, Toolbars: "use a
  ScrollEdgeEffectStyle when necessary to distinguish the toolbar area from
  the content area"). A ramp over the room itself left its midpoint, half
  ground and a pixel of blur, under the title, and rows read through it.

  The blur is the app's progressive blur (progressive-blur.ts): its layers,
  their blurs and their slices are drawn from there. The colour is one layer
  over them, the tab's sheet through `--head-tint-ramp`: none at the band's
  foot, the sheet whole at the edge, on inOutCubic, the curve the blur's
  slices are bounded on, so the two arrive together. Flat at both ends: no
  line where the band starts on the rows, none where it meets the tab's foot.
  It reads the very token the tab's sheet does, so whatever changes the one
  changes the other in the same frame.

  Scrolled to the very top there is nothing under it and it is clear; it comes
  in over the first `--c-head-fade` of scroll. The pane names the transcript's
  scroll timeline in scope (`timeline-scope: --transcript-head`); Transcript's
  scroller is that timeline. The fade-in is on each layer, never on the band:
  an ancestor below full opacity is a backdrop root, and the layers in it would
  have only each other to blur.
-->
<script lang="ts">
  import { layerBlur, layerMask, PROGRESSIVE_BLUR } from "./progressive-blur";

  let {
    band,
    tint = "bg-tab-sheet",
  }: {
    /** The room of the head floating over the content, a CSS length (a bar's height under a floating bar); none under a tab strip, where the edge is the ramp alone. */
    band?: string;
    /** The ground the rows dissolve into, a background class: the chosen tab's sheet by default. */
    tint?: string;
  } = $props();
</script>

<!-- Each layer clear while nothing is under it: at rest, and whenever the
     transcript does not scroll (its timeline is inactive). The fade-in is on
     each layer, never on a box round them (a backdrop root). -->
<div
  data-slot="head-fade"
  aria-hidden="true"
  class="absolute inset-x-0 top-0 z-1 h-(--edge) pointer-events-none"
  style:--room={band ?? "0px"}
  style:--edge="calc({band ?? '0px'} + var(--c-head-fade))"
>
  {#if band}
    <!-- The head's room: the ground whole under it, from a pixel above its
         top. A head standing at a fractional top (a sheet risen to 218.81)
         paints its ground from the next whole pixel, while the rows under it
         are cut at the pixel before, so a hair of a line showed above it. -->
    <div
      data-slot="layer"
      class={[
        "absolute inset-x-0 -top-px h-(--room-ground) opacity-0 head-fade-scrub",
        tint,
      ]}
      style:--room-ground="calc(var(--room) + 1px)"
    ></div>
  {/if}
  <!-- Below the room, the rows going out of focus and into the ground. -->
  <div data-slot="ramp" class="absolute inset-x-0 top-(--room) h-c-head-fade">
    {#each PROGRESSIVE_BLUR as layer, k (k)}
      <!-- The layer's blur and its slice (progressive-blur.ts). -->
      <div
        data-slot="layer"
        class="absolute inset-0 opacity-0 head-fade-scrub"
        style="-webkit-backdrop-filter: {layerBlur(
          layer
        )}; backdrop-filter: {layerBlur(layer)}; mask-image: {layerMask(layer)}"
      ></div>
    {/each}
    <!-- The ground, over the blur, on the ramp. -->
    <div
      data-slot="layer"
      class={[
        "absolute inset-0 opacity-0 mask-(--head-tint-ramp) head-fade-scrub",
        tint,
      ]}
    ></div>
  </div>
</div>
