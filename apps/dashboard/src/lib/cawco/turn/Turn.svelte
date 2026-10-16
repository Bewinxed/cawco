<script lang="ts">
  /**
   * One turn of a conversation, as the transcript draws it (MessageRow) and
   * a pin's thread does (PinCard): its place in the rhythm, a turn
   * --space-4 under the one before, a later turn of the same speaker
   * --space-2 under it, and the reader's later messages abutting their well
   * (Well). What it holds is the caller's: the speaker line (Who), the
   * words, and for the reader the well around them. It imports nothing of
   * the transcript or the fleet, so an artifact's own tab can draw it.
   */
  import type { Snippet } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";

  let {
    you = false,
    grouped = false,
    runsOn = false,
    class: extra,
    children,
    ...rest
  }: HTMLAttributes<HTMLElement> & {
    /** The reader's own turn. */
    you?: boolean;
    /** The same speaker's turn is right above. */
    grouped?: boolean;
    /** The reader's next message is right below, in the same run. */
    runsOn?: boolean;
    children: Snippet;
  } = $props();
</script>

<section
  class={[
    "turn",
    you && "you",
    grouped && "grouped",
    runsOn && "runs-on",
    extra,
  ]}
  {...rest}
>
  {@render children()}
</section>

<style>
  .turn {
    margin-block-start: var(--space-4);

    /* A later turn in the same speaker's group sits closer to the one above,
       and holds its floated clock inside its own box. */
    &.grouped {
      display: flow-root;
      margin-block-start: var(--space-2);
    }
  }
  /* The well's start edge is the reader's mark's edge (--well-x), with no
     bleed into the gutter; the words sit inside at its padding: --space-3,
     or --space-2 at the narrow breakpoint. */
  .turn.you {
    position: relative;
    /* The seam's inset (app.css .kit-seam): one value for both. */
    --pad: var(--seam-inset);

    /* The run's later messages: the row above ends on its own padding and
       the hairline, so there is no gap of the turn's own. */
    &.grouped {
      margin-block-start: 0;
    }
  }
</style>
