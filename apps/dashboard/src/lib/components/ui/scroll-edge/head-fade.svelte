<!--
  The transcript's head dissolving into the chosen tab: rows scrolled up past
  the transcript's top edge blur progressively toward it, up to
  `--spacing-c-head-fade-blur` at the edge over `--spacing-c-head-fade`, and dissolve into the
  chosen tab's sheet (`--color-tab-sheet`, the fill PaneTabs paints the tab in), so
  at the edge they have become the tab's fill and the transcript and its tab
  read as one sheet (owner: "it should not just be a blur, but it should blur
  into the color of the highlighted tab"). A pane draws it beside FootFade, in
  the transcript's own layer, so the transcript's overlays stand above it and
  only its rows pass under.

  A floating bar draws the same edge under its glass groups (BarFloat): its
  band is the bar's height (`band`) and its colour the ground the surface's
  content stands on (`tint`), so what scrolls under the bar blurs and fades
  into that ground (DESIGN.md, The Title Bars Follow Liquid Glass Rule: "the
  content blurs and fades under the bar … in from the first scroll and absent
  at rest").

  The blur is the app's progressive blur (progressive-blur.ts): its layers,
  their blurs and their slices are drawn from there. The colour is one layer
  over them, the tab's sheet through `--head-tint-ramp`: none at the band's
  foot, the sheet whole at the edge, on inOutCubic, the curve the blur's
  slices are bounded on, so the two arrive together. Flat at both ends: no
  line where the band starts on the rows, none where it meets the tab's foot.
  It reads the very token the tab's sheet does, so whatever changes the one
  changes the other in the same frame.

  Scrolled to the very top there is nothing under it and it is clear; it comes
  in over the first `--spacing-c-head-fade` of scroll. The pane names the transcript's
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
    /** The band's height, a CSS length: `--spacing-c-head-fade` under a tab strip, a bar's height under a floating bar. */
    band?: string;
    /** The ground the rows dissolve into, a background class: the chosen tab's sheet by default. */
    tint?: string;
  } = $props();
</script>

<div
  data-slot="head-fade"
  aria-hidden="true"
  class="absolute inset-x-0 top-0 z-1 h-(--band) pointer-events-none"
  style:--band={band ?? "var(--spacing-c-head-fade)"}
>
  <!-- Each layer clear while nothing is under it: at rest, and whenever the
       transcript does not scroll (its timeline is inactive). -->
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
  <!-- The chosen tab's sheet, over the blur, on the ramp. -->
  <div
    data-slot="layer"
    class={[
      "absolute inset-0 opacity-0 mask-(--head-tint-ramp) head-fade-scrub",
      tint,
    ]}
  ></div>
</div>
