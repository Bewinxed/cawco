<!--
  A picture beside the page: a file the session's work folder or machine
  held when it published, kept in the artifact's folder (hub
  decision-program.ts). It draws at the size of the screen it was taken on:
  its own pixels over the scale its file records (hub page-pictures.ts,
  core picture-scale.ts), so a 780px capture of a 390 phone screen taken at
  a scale of 2 stands 390 CSS px wide, beside a live 390 frame at one size.
  It fits the slot it stands in, its well's width, height following, never
  grown past that size; its edge the house image outline (1px inside it).
  The owner judges designs from these pictures side by side ("ur just
  spamming images here that are too big for me to judge"), so none sets the
  page's or the options' width. Its box stands at its size from the page's
  first paint (its `width` and `height`, which the browser keeps as its
  aspect ratio before it loads), so nothing moves as it loads.

  Pressed, it opens in the house's picture viewer (lightbox/photoswipe.ts)
  over the whole page, at its own size: a screen captured wider than its
  card, or than the page, reads at the size it was taken at, dragged to see
  past the page's edges, from its top-left corner. Its card could never show it
  so: grown in place, its cell stopped at the card's width (a 1920px desktop
  capture stood at the card's 600). The viewer's zoom shows it whole. A
  press on the picture again, on the page around it, or Escape closes it,
  and it zooms back into its place in the card.

  In a Row its well grows by its picture's aspect ratio (`picture-row`,
  design.css), so pictures side by side stand at one height, the narrowest
  never under `--spacing-c-picture-min`: it tells the Row its shape (Row.svelte). One the page
  does not hold, or whose size no reader knew, says so in words where it would stand.
-->
<script lang="ts">
  import { decisionsWords as words } from "@cawco/core/words/decisions";
  import type PhotoSwipe from "photoswipe";
  import { getContext } from "svelte";
  import { loadPhotoSwipe } from "../../lightbox/photoswipe";
  import type { OpenUIRenderProps } from "../../views/openui/OpenUiRenderer.svelte";
  import { PICTURE_RATIOS, type PictureRatios, served } from "./page.svelte.js";
  import Well from "./Well.svelte";

  let {
    props,
  }: OpenUIRenderProps<{ file: unknown; alt: unknown; caption?: unknown }> =
    $props();
  const file = $derived(String(props.file ?? ""));
  const alt = $derived(String(props.alt ?? ""));
  /** Its alt as a phrase inside its press's name: no closing stop. */
  const named = $derived(alt.trim().replace(/\.$/u, ""));
  const src = $derived(served.files[file]);
  /** Its size as the hub read it: its pixels and the scale it was taken at. */
  const size = $derived(src ? served.pictures[src] : undefined);
  let failed = $state(false);
  /** Its width over its height. */
  const ratio = $derived(size ? size.width / size.height : undefined);
  /** The picture in its card, which the viewer zooms out of and back into. */
  let shown = $state<HTMLImageElement>();
  /** The viewer it is open in, while it is. */
  let viewer: PhotoSwipe | undefined;
  /** PhotoSwipe is on its way: a second press waits for the first. */
  let opening = false;

  $effect(() => () => viewer?.destroy());

  /** Opens it over the page at its own size. */
  async function open(): Promise<void> {
    if (viewer || opening || !src || !size) {
      return;
    }
    opening = true;
    const photoSwipe = await loadPhotoSwipe().finally(() => {
      opening = false;
    });
    const opened = photoSwipe({
      dataSource: [
        {
          src,
          msrc: src,
          width: size.width / size.scale,
          height: size.height / size.scale,
          alt,
          element: shown,
        },
      ],
      // Its own size; the zoom shows it whole.
      initialZoomLevel: 1,
      secondaryZoomLevel: "fit",
      // A press on it closes it as one outside it does; a drag pans it.
      imageClickAction: "close",
      tapAction: "close",
    });
    // Where it is wider or taller than the page, it opens at its top-left
    // corner, where a screen is read from, not its middle: PhotoSwipe's
    // `min` pan is its top-left edge (PanBounds: `min` is the padding, `max`
    // the far edge).
    opened.on("initialZoomPan", ({ slide }) => {
      slide.pan.x = slide.bounds.min.x;
      slide.pan.y = slide.bounds.min.y;
    });
    opened.on("destroy", () => {
      viewer = undefined;
    });
    viewer = opened;
    opened.init();
  }
  /** The Row it stands in, which stands its pictures by the narrowest's shape. */
  const row = getContext<PictureRatios | undefined>(PICTURE_RATIOS);
  const key = {};
  $effect(() => {
    row?.(key, ratio ?? null);
    return () => row?.(key, null);
  });
</script>

<!-- mark-line: the picture stands over its caption, in a column; it is no mark beside words -->
<Well caption={props.caption ? String(props.caption) : undefined} {ratio}>
  {#if src && size && !failed}
    <button
      aria-haspopup="dialog"
      aria-label={words.pictureFull(named)}
      class="block min-w-0 max-w-full cursor-zoom-in rounded-xs p-0"
      onclick={open}
      type="button"
    >
      <!-- biome-ignore lint/a11y/noNoninteractiveElementInteractions: a picture that fails to load says so in words. -->
      <img
        bind:this={shown}
        {alt}
        class="block h-auto max-w-full rounded-xs outline-1 -outline-offset-1 outline-image-outline"
        decoding="async"
        height={Math.round(size.height / size.scale)}
        loading="lazy"
        onerror={() => {
          failed = true;
        }}
        {src}
        width={Math.round(size.width / size.scale)}
      />
    </button>
  {:else}
    <!-- One line in its well where the picture would stand, never a slab of its size. -->
    <p
      data-slot="media-gone"
      class="type-meta w-full text-ink-muted wrap-anywhere"
    >
      {src
        ? "The picture this card showed didn't load."
        : "The picture this card showed is gone."}
    </p>
  {/if}
</Well>
