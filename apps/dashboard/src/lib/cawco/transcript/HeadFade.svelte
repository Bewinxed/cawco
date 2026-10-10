<!--
  The transcript's head dissolving under the tab strip: rows scrolled up past
  the transcript's top edge fade out over `--c-head-fade` instead of meeting
  the tab's rim edge-on, so the tab and its pane read as one shape. The mirror
  of FootFade: a pane draws it in the transcript's own layer, so the
  transcript's overlays stand above it and only its rows pass under.

  An overlay, not a mask on the scroller: a mask would fade the scrollbar and
  the dock with the rows.

  Scrolled to the very top there is nothing under it and it is clear; it comes
  in over the first `--c-head-fade` of scroll. The pane names the transcript's
  scroll timeline in scope (`timeline-scope: --transcript-head`); Transcript's
  scroller is that timeline.
-->
<div aria-hidden="true" class="head-fade"></div>

<style>
  .head-fade {
    position: absolute;
    inset-inline: 0;
    inset-block-start: 0;
    z-index: 1;
    block-size: var(--c-head-fade);
    pointer-events: none;
    /* The stops follow --c-head-fade-curve, cubic-bezier(0.42, 0, 0.58, 1),
       sampled at 13 points from 0 to 1 (alpha = 1 - curve(i / 12)): an
       eased gradient (larsenwork.com/easing-gradients) leaves no hard band
       where a two-stop one starts and ends. CawCoKit's HeadFade carries the
       same list. */
    background: linear-gradient(
      to bottom,
      var(--surface-recess) 0%,
      oklch(from var(--surface-recess) l c h / 0.9864) 8.3333%,
      oklch(from var(--surface-recess) l c h / 0.9439) 16.6667%,
      oklch(from var(--surface-recess) l c h / 0.8708) 25%,
      oklch(from var(--surface-recess) l c h / 0.7682) 33.3333%,
      oklch(from var(--surface-recess) l c h / 0.6412) 41.6667%,
      oklch(from var(--surface-recess) l c h / 0.5) 50%,
      oklch(from var(--surface-recess) l c h / 0.3588) 58.3333%,
      oklch(from var(--surface-recess) l c h / 0.2318) 66.6667%,
      oklch(from var(--surface-recess) l c h / 0.1292) 75%,
      oklch(from var(--surface-recess) l c h / 0.0561) 83.3333%,
      oklch(from var(--surface-recess) l c h / 0.0136) 91.6667%,
      oklch(from var(--surface-recess) l c h / 0) 100%
    );
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
