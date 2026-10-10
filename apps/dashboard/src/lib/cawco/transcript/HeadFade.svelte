<!--
  The transcript's head going out of focus under the tab strip: rows scrolled
  up past the transcript's top edge blur progressively toward it, up to
  `--c-head-fade-blur` at the edge over `--c-head-fade`, so they never meet
  the tab's rim edge-on. A blur, never a colour: nothing is painted over the
  rows. A pane draws it beside FootFade, in the transcript's own layer, so the
  transcript's overlays stand above it and only its rows pass under.

  The blur is the app's progressive blur (progressive-blur.ts): its layers,
  their blurs and their slices are drawn from there, as the recall wheel's
  far edge draws them.

  Scrolled to the very top there is nothing under it and it is clear; it comes
  in over the first `--c-head-fade` of scroll. The pane names the transcript's
  scroll timeline in scope (`timeline-scope: --transcript-head`); Transcript's
  scroller is that timeline. The fade-in is on each layer, never on the band:
  an ancestor below full opacity is a backdrop root, and the layers in it would
  have only each other to blur.
-->
<script lang="ts">
  import { layerBlur, layerMask, PROGRESSIVE_BLUR } from "./progressive-blur";
</script>

<div aria-hidden="true" class="head-fade">
  {#each PROGRESSIVE_BLUR as layer, k (k)}
    <div
      class="layer"
      style="-webkit-backdrop-filter: {layerBlur(
        layer
      )}; backdrop-filter: {layerBlur(layer)}; mask-image: {layerMask(layer)}"
    ></div>
  {/each}
</div>

<style>
  .head-fade {
    position: absolute;
    inset-inline: 0;
    inset-block-start: 0;
    z-index: 1;
    block-size: var(--c-head-fade);
    pointer-events: none;
  }
  .layer {
    position: absolute;
    inset: 0;
    /* Clear while nothing is under it: at rest, and whenever the transcript
       does not scroll (its timeline is inactive). */
    opacity: 0;
    animation: head-fade linear both;
    animation-timeline: --transcript-head;
    animation-range: 0 var(--c-head-fade);
  }
  @keyframes head-fade {
    to {
      opacity: 1;
    }
  }
</style>
