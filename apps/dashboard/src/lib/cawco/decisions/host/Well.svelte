<!--
  The well every piece of media stands in, one recipe for all four (Preview,
  Diagram, Image, Canvas): the content well inside a raised card (DESIGN.md,
  Surfaces: `surface-well` with `border-well`), the token radius `well`, 11px
  in. Its piece is centred on both axes at its own size (LIBRARY.md: "each at
  its own size and centred"); a piece wider than the well at its smallest
  scrolls sideways under the house edge fade (`wide`). Under it the caption
  in meta at the start and the piece's one action at the end; an action's
  refusal stands under them in the error formula's ink. A picture drawn at
  its story's own width (`picture`, a Preview that says it) has its well
  hug it: the story at 1:1 and the well's insets, never wider than what
  holds it, so no empty well stands beside it. Standing alone in its card
  on a phone it reaches the screen's edges as far as its story does, with no
  side, edge or corner of its own, its words kept on the page's text edge.
-->
<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    action,
    caption,
    children,
    picture,
    said = "",
    stage = $bindable(),
    wide = false,
  }: {
    action?: Snippet;
    caption?: string;
    children: Snippet;
    /** Its picture's own width, px: the well hugs it, and under the phone's line, alone in its card (`data-bleeds`), reaches the screen's edges as far as it does. */
    picture?: number;
    /** A refusal of the action, in the hub's words. */
    said?: string;
    /** The box the piece is centred in, for a piece that measures its room. */
    stage?: HTMLDivElement;
    /** The piece is wider than the well and scrolls sideways. */
    wide?: boolean;
  } = $props();
</script>

<figure
  class={[
    "m-0 flex min-w-0 flex-col gap-space-2 rounded-well border border-border-well bg-surface-well p-space-3",
    picture !== undefined && "well-hug max-phone:in-data-bleeds:well-bleed",
  ]}
  data-picture={picture}
  data-slot="media"
  style:--picture-w={picture === undefined ? undefined : `${picture}px`}
>
  <div
    bind:this={stage}
    class={[
      "relative flex min-w-0 flex-1 items-center-safe justify-center-safe",
      wide && "kit-edge-fade overflow-x-auto overscroll-x-contain",
    ]}
    data-slot="media-stage"
  >
    {@render children()}
  </div>
  {#if caption || action}
    <figcaption
      class={[
        "flex flex-wrap items-center justify-between gap-space-2",
        picture !== undefined && "max-phone:in-data-bleeds:well-bleed-words",
      ]}
      data-slot="media-foot"
    >
      <span
        class="type-meta min-w-0 text-ink-muted wrap-anywhere"
        data-slot="media-caption">{caption ?? ""}</span
      >{@render action?.()}
    </figcaption>
  {/if}
  {#if said}
    <p
      class={[
        "type-meta text-status-fail-ink wrap-anywhere",
        picture !== undefined && "max-phone:in-data-bleeds:well-bleed-words",
      ]}
      role="status"
    >
      {said}
    </p>
  {/if}
</figure>
