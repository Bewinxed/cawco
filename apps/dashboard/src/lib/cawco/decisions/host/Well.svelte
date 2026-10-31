<!--
  The well every piece of media stands in, one recipe for all of them
  (Preview, Diagram, Image, Canvas, Dials): the content well inside a raised
  card (DESIGN.md, Surfaces: `surface-well` with `border-well`), the token
  radius `well`, 11px in. Its piece stands at its real size, 1 CSS px per
  px, centred on both axes where it is narrower than the well.
  A piece that knows its own width (`picture`: a Preview's design, a
  canvas's drawing, a picture's or a diagram's own) has its well hug it: the
  piece and the well's insets, never wider than what holds it, so no empty
  well stands beside it; the well tells the card and the page that width
  (`MEDIA_WIDTHS`), which lay their options and their column out by it. A
  piece wider than the well scrolls sideways inside it under the house edge
  fade at its full 40px on every width (over words cut mid-word a phone's
  16px reads as a clip), on the side where more is hidden. Under it the
  caption in meta at the start and the piece's one action at the end; an
  action's refusal stands under them in the error formula's ink. Standing
  alone in its card on a phone a pictured well reaches the screen's edges as
  far as its piece does, with no side, edge or corner of its own, its words
  kept on the page's text edge. A picture (Image.svelte) says no width: it
  fits its well, and says its shape instead (`ratio`), by which a Row grows
  its well beside the others so they stand at one height (`picture-row`).
-->
<script lang="ts">
  import { getContext, type Snippet } from "svelte";
  import { frameObserver } from "../../frame-observer.js";
  import { MEDIA_WIDTHS, type MediaWidths } from "./page.svelte.js";

  let {
    action,
    caption,
    children,
    fills = false,
    picture,
    ratio,
    said = "",
  }: {
    action?: Snippet;
    caption?: string;
    children: Snippet;
    /** Its piece takes its card's whole width (a page-sized design that names no width of its own, Preview.svelte): the card stands the column it is in one to a row (`data-fills`, Decision.svelte). */
    fills?: boolean;
    /** Its piece's own width, px, at 1 CSS px per px: the well hugs it, scrolls it sideways where it is narrower, and under the phone's line, alone in its card (`data-bleeds`), reaches the screen's edges as far as it does. */
    picture?: number;
    /** Its picture's width over its height, once known: in a Row its well grows by it, so the Row's pictures stand at one height. */
    ratio?: number;
    /** A refusal of the action, in the hub's words. */
    said?: string;
  } = $props();

  /** The box the piece stands in. */
  let stage = $state<HTMLDivElement>();

  /** The card's and the page's ear for this well's width (Decision, Decisions). */
  const tell = getContext<MediaWidths | undefined>(MEDIA_WIDTHS);
  const key = {};
  $effect(() => {
    tell?.(key, picture ?? null);
    return () => tell?.(key, null);
  });

  /**
   * The stage's own width, px, as layout has it (fractional: a well hugging
   * a 471.875px drawing is 471.875px wide, where `clientWidth` rounds to
   * 471 and called the drawing wider than its own well; its computed width,
   * which no transform round it scales): a piece wider than it scrolls
   * sideways. The stage draws no border or padding of its own.
   */
  let room = $state(0);
  $effect(() => {
    const box = stage;
    if (!box) {
      return;
    }
    const read = () => {
      room = Number.parseFloat(getComputedStyle(box).width) || 0;
    };
    read();
    const sizes = frameObserver(read);
    sizes.observe(box);
    return () => sizes.disconnect();
  });
  const wide = $derived(
    picture !== undefined && room > 0 && picture > room + 0.5
  );
</script>

<figure
  class={[
    "m-0 flex min-w-0 flex-col gap-space-2 rounded-well border border-border-well bg-surface-well p-space-3",
    picture !== undefined && "well-hug max-phone:in-data-bleeds:well-bleed",
    ratio !== undefined && "picture-row",
  ]}
  data-fills={fills || undefined}
  data-picture={picture}
  data-slot="media"
  style:--picture-w={picture === undefined ? undefined : `${picture}px`}
  style:--ratio={ratio}
>
  <div
    bind:this={stage}
    class={[
      "relative flex min-w-0 flex-1 items-center-safe justify-center-safe",
      picture !== undefined && "contain-inline-size",
      wide &&
        "kit-edge-fade fade-len-c-edge-fade-len overflow-x-auto overscroll-x-contain",
    ]}
    data-slot="media-stage"
    data-wide={wide || undefined}
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
