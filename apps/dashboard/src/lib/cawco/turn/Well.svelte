<script lang="ts">
  /**
   * The reader's well, one message's part of it (MessageRow's `.turn.you`,
   * PinCard's person's entries): the reader's own turns are the one thing
   * that carries a surface, ONE well holding the whole run of them, a step
   * below the pane, with a hairline between its messages. A list drawn a
   * row at a time draws it a part at a time: the top edge on the run's
   * first part, the bottom edge on its last, a hairline where the next
   * message follows. Every part has the same box whatever its place, so a
   * run growing or shrinking changes paint only. It stands inside a Turn
   * (`--pad`) and imports nothing of the transcript or the fleet.
   */
  import type { Snippet } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";

  let {
    grouped = false,
    runsOn = false,
    lifted = false,
    class: extra,
    children,
    ...rest
  }: HTMLAttributes<HTMLDivElement> & {
    /** A later message of the run: open at the top, the hairline over the part above. */
    grouped?: boolean;
    /** Another message follows: no bottom edge or corners. */
    runsOn?: boolean;
    /** Its words are away (in the composer): the well folds away with them. */
    lifted?: boolean;
    children: Snippet;
  } = $props();
</script>

<div
  data-slot="well"
  data-runs-on={runsOn || undefined}
  data-grouped={grouped || undefined}
  class={["well", grouped && "grouped", runsOn && "runs-on", extra]}
  class:lifted
  {...rest}
>
  {@render children()}
</div>

<style>
  /* The surface and its edge are painted by ::before, under the words, so a
     part can open without clipping the words landing in it; ::after is the
     hairline from the message above. The box is the same for every part —
     padding above (--space-2, plus the edge on a run's first part) and
     --space-2 plus the edge's 1px below — so a part becoming the last, or no
     longer the last, repaints and never reflows. It holds a later message's
     clock, floated into its first line, inside its own box. */
  .well {
    position: relative;
    isolation: isolate;
    display: flow-root;
    margin-inline-start: var(--well-x);
    padding-block: calc(var(--space-2) + 1px);
    padding-inline: var(--pad);

    &::before {
      content: "";
      position: absolute;
      inset: 0;
      z-index: -1;
      border: 1px solid var(--well-edge);
      border-radius: var(--well-r);
      background: var(--surface-recess-deep);

      /* A run growing or shrinking: the edge and corners follow. */
      @media (prefers-reduced-motion: no-preference) {
        transition:
          border-color var(--dur-pop) var(--ease-out),
          border-radius var(--dur-pop) var(--ease-out),
          opacity var(--dur-panel) var(--ease-drawer);
      }
    }
    /* Drawn by the LOWER message, across the text column only, on the pixel
       row the part above leaves for its edge. The list places rows at
       fractional offsets, so a later row's surface can cover the last pixel
       of the row above: a hairline painted by the row above went missing.
       Painted by the row below, it is painted last. */
    &::after {
      content: "";
      position: absolute;
      inset-inline: var(--pad);
      inset-block-start: -1px;
      block-size: 1px;
      background: var(--seam);
      opacity: 0;

      @media (prefers-reduced-motion: no-preference) {
        transition: opacity var(--dur-pop) var(--ease-out);
      }
    }

    /* The words run to the well's edge, not the prose measure. */
    & :global(.msg) {
      max-inline-size: none;
    }
    /* The well is the deepest step, so a code span lifts to the raised
       surface instead of vanishing into it. */
    & :global(.msg code) {
      background: var(--surface-raised);
    }
  }
  /* Its words lifted into the composer, the well folds away with them (the
     note beside "You" says where they went), on the words' own curve; an
     empty well would stay behind as a sliver. */
  .well {
    @media (prefers-reduced-motion: no-preference) {
      transition: padding-block var(--dur-panel) var(--ease-drawer);
    }
  }
  /* A later message: open at the top, the hairline over the part above's
     bottom edge. */
  .well.grouped {
    padding-block-start: var(--space-2);

    /* Its surface starts on the pixel row the part above leaves for its
       edge, as the hairline does. The two parts are snapped to the pixel
       grid each on its own, and at some offsets the part above stopped a
       row short of this one: the row between was painted by neither, the
       page showed through it at the well's two insets, and the hairline
       stood on the page instead of on the well. */
    &::before {
      inset-block-start: -1px;
      border-block-start-width: 0;
      border-start-start-radius: 0;
      border-start-end-radius: 0;
    }
    &::after {
      opacity: 1;
    }
  }
  .well.lifted {
    padding-block: 0;

    &::before,
    &::after {
      opacity: 0;
    }
  }
  /* Another message follows: no bottom edge or corners. */
  .well.runs-on::before {
    border-block-end-color: transparent;
    border-end-start-radius: 0;
    border-end-end-radius: 0;
  }
  /* A theme switch is one cross-fade of the whole page (theme.svelte.ts):
     the well's edge does not fade on its own under it. The page's rule
     (app.css `theme-flip`) leaves pseudo-elements out for what a universal
     pseudo-element selector costs, so the well's two are named here. */
  :global(:root.theme-flip) .well::before,
  :global(:root.theme-flip) .well::after {
    transition: none !important;
  }
</style>
