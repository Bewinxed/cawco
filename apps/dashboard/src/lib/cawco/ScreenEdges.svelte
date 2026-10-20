<script lang="ts">
  /**
   * The screen's two edges, in the colour of the page's own top and bottom,
   * so what Safari draws behind the status bar and its toolbar is the
   * page's own edge. "Safari has a surprisingly useful but not widely known
   * behavior: it can extend the background of a fixed element behind its
   * controls", and "needs at least 5px of the strip visible to pick up its
   * color" (joshpuckett.me/seamless-mobile-safari). So each edge is a fixed,
   * full-width strip that presses nothing, outside every transformed box
   * (the root layout draws it straight into the body), 12px tall or the
   * safe area's depth if that is more, and set 7px past the screen's edge
   * so 5px of it shows (Joe Bell's refinement there). The document's own
   * backgrounds are the same two colours (html the top, body the bottom),
   * and `theme-color` the top.
   *
   * Joe Bell's other half, a 48px fade from the edge colour to transparent
   * over the strip, is left out: each of the dashboard's edges is a solid
   * surface well over 48px deep (the bar, the tab row, the page's ground, a
   * sheet's surface), so a fade would be drawn over its own colour and show
   * nothing. Where a page scrolls under the screen's foot (a transcript),
   * the fade would also stand over the composer's glass above it.
   *
   * The top strip paints only above the safe area, where the status bar is,
   * through a mask; at a desk (no inset) that is the 7px past the screen's
   * edge, so it draws nothing over the bar's glass. It keeps its whole box
   * and its colour, because that is what WebKit reads: "a horizontal
   * candidate must cover at least 90 percent of the viewport width", and the
   * direct read of its computed colour needs both border-box sides over
   * 10px (exsesx.dev/blog/en/safari-26-invisible-tint-sampler). So a
   * narrower strip drops out and the tint breaks. A mask, because WebKit
   * hides it from no one: "`mask-image`, not `visibility`/`opacity`/
   * `display` — the sampler rejects all three of those; it does not look at
   * masks" (github.com/facebook/astryx/pull/5342).
   *
   * Which colour each edge is is decided here and nowhere else, from what
   * stands on it:
   *   - the top is the bar (surface-raised), or the session tabs' shelf
   *     (surface-shelf) where the bar floats over the phone's tab row or
   *     hosts the tabs on a wide screen (Shell `.top.floating`/`.hosting`);
   *   - the bottom is the page's ground (surface-recess): the board's, the
   *     transcript's and every other page's;
   *   - an open scrim (a dialog's, a sheet's, the lightbox's) lays the
   *     page's background over both at the scrim's own share
   *     (effect.scrim-mix): the colour the scrim makes of that edge;
   *   - a bottom sheet the kit rests on the screen's foot is the bottom
   *     edge itself, from its first frame (it rises from below the screen,
   *     so it covers the foot at once) until it is gone: its surface
   *     (surface-raised);
   *   - a side sheet holds part of each edge's width and the scrim the
   *     rest: two colours on one edge, where one strip would paint one of
   *     them over the other. So while one is open the strips are not drawn,
   *     and the edges are the page's own layers, the sheet and the scrim
   *     beside it; the document and `theme-color` take the sheet's surface
   *     (surface-raised, or the sidebar's ground for the phone's sidebar).
   *     As it closes they come back on the scrim's way out.
   * An edge under a scrim follows it in and out on the scrim's own clock.
   */
  import { theme } from "#lib/theme.svelte.js";

  let top = $state<HTMLElement | null>(null);
  /** The top edge's colour as drawn, for `theme-color`; none until read. */
  let topColour = $state<string | undefined>(undefined);

  /**
   * Every change of an edge's state runs a transition on its strip (a
   * scrim's fade, or a step a millisecond long), so its end is where the
   * colour is read. A theme switch turns every transition off while it
   * flips (app.css `theme-flip`), so the scheme on screen is read too.
   */
  const read = () => {
    if (top) {
      topColour = getComputedStyle(top).backgroundColor;
    }
  };
  $effect(() => {
    // Again whenever the scheme drawn changes: the theme class is set by then.
    if (theme.resolved) {
      read();
    }
  });
</script>

<svelte:head>
  <meta content={topColour} name="theme-color" />
</svelte:head>

<!-- The strips are fixed elements themselves, not a static element's
     ::after: WebKit finds the colour to extend by hit-testing the middle of
     each edge of the viewport (ignoring pointer-events) and walking up the
     hit element's renderer lineage to the first fixed or sticky box, whose
     own background it takes (LocalFrameView.cpp, fixedContainerEdges:
     `midpointOnSide`, `findFixedContainer`). A pseudo-element hits as its
     host, so a static host led the walk to <body> and <html>, found no fixed
     box, and Safari fell back to the page's background (the body's, the
     bottom edge): the status bar took the page's ground on the home and the
     drawer's surface while it was open. Over every layer, toasts' (sonner,
     --layer-toast) included (--layer-screen-edge): the strip is the colour of whatever stands on its edge,
     so it is never seen as itself. Each strip runs two clocks in one
     transition, its colour's and its showing's. -->
<div
  data-slot="edge-top"
  aria-hidden="true"
  class="fixed inset-x-0 -top-space-2 z-(--layer-screen-edge) h-(--edge-h) pointer-events-none edge-mask-top opacity-(--edge-shown) bg-(--edge-top-background) transition-[background-color,opacity] duration-(--edge-top-durs) ease-out"
  ontransitionend={read}
  style:--edge-h="max(var(--icon-sm), env(safe-area-inset-top))"
  style:--edge-top-durs="var(--edge-top-fade), var(--edge-show-fade)"
  bind:this={top}
></div>
<div
  data-slot="edge-bottom"
  aria-hidden="true"
  class="fixed inset-x-0 -bottom-space-2 z-(--layer-screen-edge) h-(--edge-h) pointer-events-none opacity-(--edge-shown) bg-(--edge-bottom-background) transition-[background-color,opacity] duration-(--edge-bottom-durs) ease-out"
  style:--edge-h="max(var(--icon-sm), env(safe-area-inset-bottom))"
  style:--edge-bottom-durs="var(--edge-bottom-fade), var(--edge-show-fade)"
></div>
