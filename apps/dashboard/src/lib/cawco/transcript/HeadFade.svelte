<!--
  The transcript's head going out of focus under the tab strip: rows scrolled
  up past the transcript's top edge blur progressively toward it, up to
  `--c-head-fade-blur` at the edge over `--c-head-fade`, so they never meet
  the tab's rim edge-on. A blur, never a colour: nothing is painted over the
  rows. A pane draws it beside FootFade, in the transcript's own layer, so the
  transcript's overlays stand above it and only its rows pass under.

  A progressive blur is a stack of uniform ones: each layer blurs the whole
  band and a linear mask keeps only its slice, the radius doubling layer by
  layer toward the edge (kennethnym.com/blog/progressive-blur-in-css: "each
  section is a div that takes up the whole progressive blur area. to only blur
  a specific area within a section ... we can use a combination of mask and
  linear-gradient"). The mask is applied after the filter, so a slice's edge is
  soft, not cut (joshwcomeau.com/css/backdrop-filter: "The masking algorithm
  happens after the filters, in all browsers").

  The slices are bounded at inOutCubic(j / 5), j = 0…5, read from the band's
  sharp end up to the edge: 0, 3.2, 25.6, 74.4, 96.8, 100% (the stops of
  jh3y's easing gradients). Layer k fades in over [q(k), q(k+1)], holds to
  q(k+2) and fades out by q(k+3); the strongest holds to the edge. CawCoKit's
  HeadFade carries the same slices.

  Scrolled to the very top there is nothing under it and it is clear; it comes
  in over the first `--c-head-fade` of scroll. The pane names the transcript's
  scroll timeline in scope (`timeline-scope: --transcript-head`); Transcript's
  scroller is that timeline. The fade-in is on each layer, never on the band:
  an ancestor below full opacity is a backdrop root, and the layers in it would
  have only each other to blur.
-->
<div aria-hidden="true" class="head-fade">
  <div class="layer"></div>
  <div class="layer"></div>
  <div class="layer"></div>
  <div class="layer"></div>
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
    -webkit-backdrop-filter: blur(var(--blur));
    backdrop-filter: blur(var(--blur));
    mask-image: linear-gradient(to top, var(--slice));
    /* Clear while nothing is under it: at rest, and whenever the transcript
       does not scroll (its timeline is inactive). */
    opacity: 0;
    animation: head-fade linear both;
    animation-timeline: --transcript-head;
    animation-range: 0 var(--c-head-fade);
  }
  .layer:nth-child(1) {
    --blur: calc(var(--c-head-fade-blur) / 8);
    --slice: transparent 0%, #000 3.2%, #000 25.6%, transparent 74.4%;
  }
  .layer:nth-child(2) {
    --blur: calc(var(--c-head-fade-blur) / 4);
    --slice: transparent 3.2%, #000 25.6%, #000 74.4%, transparent 96.8%;
  }
  .layer:nth-child(3) {
    --blur: calc(var(--c-head-fade-blur) / 2);
    --slice: transparent 25.6%, #000 74.4%, #000 96.8%, transparent 100%;
  }
  .layer:nth-child(4) {
    --blur: var(--c-head-fade-blur);
    --slice: transparent 74.4%, #000 96.8%;
  }
  @keyframes head-fade {
    to {
      opacity: 1;
    }
  }
</style>
