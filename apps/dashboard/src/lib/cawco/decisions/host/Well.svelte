<!--
  Where every piece of media stands on a decision card, one recipe for all
  of them (Preview, Diagram, Image, Canvas, Dials): no box of its own. The
  piece stands straight on its card's ground, as the card's words do (The
  Frame Recesses Rule: content never recesses, and the card is already the
  floating surface), at its real size, 1 CSS px per px, centred on both axes
  where it is narrower than the card. What marks a piece's edge is its own:
  a framed page or a picture takes the kit's image edge inside its box
  (`outline-image-outline`, Preview.svelte, Canvas.svelte, Image.svelte); a
  drawing stands on the card's ground (host.css, `[data-slot=diagram]`).
  A piece that knows its own width (`picture`: a Preview's design, a
  canvas's drawing, a picture's or a diagram's own) is hugged: this box is
  exactly its width, never wider than what holds it, so no empty room
  stands beside it; it tells the card and the page that width
  (`MEDIA_WIDTHS`), which lay their options and their column out by it. A
  piece that knows its width stands in a sideways scroller from its first
  paint, never only once the box has measured itself, so a piece wider
  than its room (a window narrowed under it) is clipped and scrolls inside
  it in the very frame it is wider, never past its card onto the page; its
  edge fade says what is past its sides, with no scrollbar of its own
  (`no-scrollbar`, as the house's other faded sideways scrollers): drawn,
  Chromium's first measure of the stage (a scroller of contained inline
  size) counted a 10px sideways scrollbar under a piece as wide as it, and
  every card holding one shrank 20px at the next layout; under the house
  edge fade at its full 40px on every width (over words cut mid-word a
  phone's 16px reads as a clip), on the side where more is hidden. Under it
  the caption in meta at the start and the piece's one action at the end;
  an action's refusal stands under them in the error formula's ink. A
  piece's status while it isn't there yet (`status`, a Preview's wait)
  stands over its top, held at the page's top while any of the piece is in
  view. Standing alone in its card on a phone a pictured piece reaches the
  screen's edges as far as it does (`data-bleeds`, design.css
  `well-bleed`), its words kept on the page's text edge. A picture
  (Image.svelte) says no width: it fits its room, and says its shape
  instead (`ratio`), by which a Row grows it beside the others so they
  stand at one height (`picture-row`).
-->
<script lang="ts">
  import { getContext, type Snippet } from "svelte";
  import { MEDIA_WIDTHS, type MediaWidths } from "./page.svelte.js";

  let {
    action,
    caption,
    children,
    fills = false,
    picture,
    ratio,
    said = "",
    status,
  }: {
    action?: Snippet;
    caption?: string;
    children: Snippet;
    /** Its piece takes its card's whole width (a page-sized design that names no width of its own, Preview.svelte): the card stands the column it is in one to a row (`data-fills`, Decision.svelte). */
    fills?: boolean;
    /** Its piece's own width, px, at 1 CSS px per px: the box hugs it, scrolls it sideways where it is narrower, and under the phone's line, alone in its card (`data-bleeds`), reaches the screen's edges as far as it does. */
    picture?: number;
    /** Its picture's width over its height, once known: in a Row it grows by it, so the Row's pictures stand at one height. */
    ratio?: number;
    /** A refusal of the action, in the hub's words. */
    said?: string;
    /** Its piece's status while it isn't there yet (a Preview's wait): over the piece at its top, held at the page's top while any of the piece is in view. */
    status?: Snippet;
  } = $props();

  /** The card's and the page's ear for this piece's width (Decision, Decisions). */
  const tell = getContext<MediaWidths | undefined>(MEDIA_WIDTHS);
  const key = {};
  $effect(() => {
    tell?.(key, picture ?? null);
    return () => tell?.(key, null);
  });
</script>

<figure
  class={[
    "m-0 flex min-w-0 flex-col gap-space-2",
    picture !== undefined && "well-hug max-phone:in-data-bleeds:well-bleed",
    ratio !== undefined && "picture-row",
  ]}
  data-fills={fills || undefined}
  data-picture={picture}
  data-slot="media"
  style:--picture-w={picture === undefined ? undefined : `${picture}px`}
  style:--ratio={ratio}
>
  <!-- The stage and, over it, its piece's status. The status stands outside the stage, which is a sideways scroller for a piece of a known width (and so the box a sticky child would hold to): sticky in the page's scroller, it keeps to the page's top while any of the stage is in view, and never moves with the stage's sideways scroll. -->
  <div class="relative flex min-w-0 flex-1 flex-col" data-slot="media-body">
    <div
      class={[
        "relative flex min-w-0 flex-1 items-center-safe justify-center-safe",
        picture !== undefined &&
          "kit-edge-fade fade-len-c-edge-fade-len no-scrollbar contain-inline-size overflow-x-auto overscroll-x-contain",
      ]}
      data-slot="media-stage"
    >
      {@render children()}
    </div>
    {#if status}
      <div
        class="pointer-events-none absolute inset-0"
        data-slot="media-status"
      >
        <div class="sticky top-0">{@render status()}</div>
      </div>
    {/if}
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
