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
  data-lifted={lifted || undefined}
  class={[
    "relative isolate flow-root ms-(--well-x) py-(--well-pad-block) px-(--pad) motion-safe:transition-[padding-block] motion-safe:dur-panel motion-safe:ease-drawer data-grouped:pbs-space-2 data-lifted:py-0 data-lifted:pbs-0",
    extra,
  ]}
  style:--well-pad-block="calc(var(--space-2) + 1px)"
  {...rest}
>
  {@render children()}
</div>

<style>
  /* The surface and its edge are painted by ::before, under the words, so a
     part can open without clipping the words landing in it; ::after is the
     hairline from the message above. The box is the same for every part, so
     a part becoming the last, or no longer the last, repaints and never
     reflows. */
  /* residual: pseudo */
  [data-slot="well"]::before {
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
     row the part above leaves for its edge. Painted by the row below, it is
     painted last. */
  [data-slot="well"]::after {
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
  /* A later message: open at the top, the hairline over the part above's
     bottom edge. Its surface starts on the pixel row the part above leaves
     for its edge, as the hairline does. */
  [data-slot="well"][data-grouped]::before {
    inset-block-start: -1px;
    border-block-start-width: 0;
    border-start-start-radius: 0;
    border-start-end-radius: 0;
  }
  [data-slot="well"][data-grouped]::after {
    opacity: 1;
  }
  /* Its words lifted into the composer, the well folds away with them. */
  [data-slot="well"][data-lifted]::before,
  [data-slot="well"][data-lifted]::after {
    opacity: 0;
  }
  /* Another message follows: no bottom edge or corners. */
  [data-slot="well"][data-runs-on]::before {
    border-block-end-color: transparent;
    border-end-start-radius: 0;
    border-end-end-radius: 0;
  }
  /* A theme switch is one cross-fade of the whole page (theme.svelte.ts):
     the well's edge does not fade on its own under it. */
  :global(:root.theme-flip) [data-slot="well"]::before,
  :global(:root.theme-flip) [data-slot="well"]::after {
    transition: none !important;
  }

  /* residual: foreign-dom */
  /* The words run to the well's edge, not the prose measure. */
  [data-slot="well"] :global(.msg) {
    max-inline-size: none;
  }
  /* The well is the deepest step, so a code span lifts to the raised
     surface instead of vanishing into it. */
  [data-slot="well"] :global(.msg code) {
    background: var(--surface-raised);
  }
</style>
