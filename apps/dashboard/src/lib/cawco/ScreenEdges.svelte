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
  import { onMount } from "svelte";

  let top = $state<HTMLElement | null>(null);
  /** The top edge's colour as drawn, for `theme-color`; none until read. */
  let topColour = $state<string | undefined>(undefined);

  /**
   * Every change of either edge colour runs a transition on its strip (a
   * scrim's fade, or a step a millisecond long), so its end is where the
   * colour is read: one listener for every state, the theme's included.
   */
  const read = () => {
    if (top) {
      topColour = getComputedStyle(top, "::after").backgroundColor;
    }
  };
  onMount(read);
</script>

<svelte:head>
  <meta content={topColour} name="theme-color" />
</svelte:head>

<div
  aria-hidden="true"
  class="edge-top"
  ontransitionend={read}
  bind:this={top}
></div>
<div aria-hidden="true" class="edge-bottom"></div>

<style>
  /* css-scope: the screen's edges are the document's own, set on its root */
  :global(:root) {
    --edge-top-under: var(--surface-raised);
    --edge-bottom-under: var(--surface-recess);
    --edge-top-background: var(--edge-top-under);
    --edge-bottom-background: var(--edge-bottom-under);
    /* How long each edge takes to its new colour: at once, but as a
       transition, so its end can be heard (`read`). */
    --edge-top-fade: 1ms;
    --edge-bottom-fade: 1ms;
    /* Whether the strips are drawn, and how long they take to come back. */
    --edge-shown: 1;
    --edge-show-fade: var(--dur-exit);
    background: var(--edge-top-background);
  }
  /* css-scope: the body's background is the bottom edge */
  :global(body) {
    background: var(--edge-bottom-background);
  }

  /* The session's tabs at the top: the phone's tab row under the floating
     bar, or the wide bar hosting them on their shelf. Under the narrow
     query the bar draws itself raised even while hosting (Shell). */
  /* css-scope: reads the Shell's bar from the root to colour the top edge */
  :global(:root:has(.top.floating)),
  :global(:root:has(.top.hosting)) {
    --edge-top-under: var(--surface-shelf);
  }
  @media (max-width: 899px), (pointer: coarse) and (orientation: portrait) {
    /* css-scope: reads the Shell's bar from the root to colour the top edge */
    :global(:root:has(.top.hosting)) {
      --edge-top-under: var(--surface-raised);
    }
  }

  /* An open scrim, the kit's (`.kit-scrim`, portalled into the body) or
     the lightbox's (PhotoSwipe's root, its bg the scrim at full opacity). */
  /* css-scope: reads an open scrim from the root to colour both edges */
  :global(:root:has(> body > .kit-scrim[data-state="open"])),
  :global(:root:has(> body > .cawco-pswp.pswp--open)) {
    --edge-top-background: color-mix(
      in srgb,
      var(--background) var(--scrim-mix),
      var(--edge-top-under)
    );
    --edge-bottom-background: color-mix(
      in srgb,
      var(--background) var(--scrim-mix),
      var(--edge-bottom-under)
    );
    --edge-top-fade: var(--dur-panel);
    --edge-bottom-fade: var(--dur-panel);
  }
  /* css-scope: times the edges to a closing scrim's fade */
  :global(:root:has(> body > .kit-scrim[data-state="closed"])) {
    --edge-top-fade: var(--dur-exit);
    --edge-bottom-fade: var(--dur-exit);
  }
  /* A bottom sheet on the screen's foot is the bottom edge, at once, for as
     long as it is there: opening and closing it covers the foot. */
  /* css-scope: reads a kit bottom sheet from the root to colour the foot */
  :global(
    :root:has(
      > body
        > [data-slot="drawer-content"][data-placed][data-vaul-drawer-direction="bottom"]
    )
  ) {
    --edge-bottom-background: var(--surface-raised);
    --edge-bottom-fade: 1ms;
  }
  /* A side sheet: the strips step aside at once (see above). */
  /* css-scope: reads a kit side sheet from the root to set both edges */
  :global(
    :root:has(
      > body
        > [data-slot="sheet-content"]:is(
          [data-side="left"],
          [data-side="right"]
        )[data-state="open"]
    )
  ) {
    --edge-top-background: var(--surface-raised);
    --edge-bottom-background: var(--surface-raised);
    --edge-shown: 0;
    --edge-show-fade: 0s;
  }
  /* The phone's sidebar fills its sheet with its own ground (Shell). */
  /* css-scope: reads the Shell's sidebar sheet from the root */
  :global(
    :root:has(
      > body > [data-slot="sheet-content"].rail-sheet[data-state="open"]
    )
  ) {
    --edge-top-background: var(--sidebar);
    --edge-bottom-background: var(--sidebar);
  }

  .edge-top::after,
  .edge-bottom::after {
    content: "";
    position: fixed;
    inset-inline: 0;
    /* Over every layer, toasts' (sonner, 1000) included: the strip is the
       colour of whatever stands on its edge, so it is never seen as itself. */
    z-index: 1001;
    pointer-events: none;
    opacity: var(--edge-shown);
  }
  .edge-top::after {
    top: -7px;
    block-size: max(12px, env(safe-area-inset-top));
    background-color: var(--edge-top-background);
    transition:
      background-color var(--edge-top-fade) var(--ease-out),
      opacity var(--edge-show-fade) var(--ease-out);
  }
  .edge-bottom::after {
    bottom: -7px;
    block-size: max(12px, env(safe-area-inset-bottom));
    background-color: var(--edge-bottom-background);
    transition:
      background-color var(--edge-bottom-fade) var(--ease-out),
      opacity var(--edge-show-fade) var(--ease-out);
  }
</style>
