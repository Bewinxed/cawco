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

  Pressed, it stands at its full size in place: its option's cell, or its
  cell in the card's media, spans the card's width (`has-data-full`,
  Decision.svelte, Option.svelte), and the picture fills it up to its own
  size, with no overlay over the page. Pressed again, or Escape, it fits its
  slot again. The press turns `data-state`, which the card's height tween
  hears (motion/morph), so the card grows and settles on the kit's clock.

  In a Row its well grows by its picture's aspect ratio (`picture-row`,
  design.css), so pictures side by side stand at one height, the narrowest
  never under `--c-picture-min`: it tells the Row its shape (Row.svelte). One the page
  does not hold, or whose size no reader knew, says so in words where it would stand.
-->
<script lang="ts">
  import { decisionsWords as words } from "@cawco/core/words/decisions";
  import { getContext } from "svelte";
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
  /** It stands at its full size, its cell across the card. */
  let full = $state(false);
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
      aria-label={full ? words.pictureFit : words.pictureFull(named)}
      class={[
        "block min-w-0 max-w-full rounded-xs p-0",
        full ? "cursor-zoom-out" : "cursor-zoom-in",
      ]}
      data-full={full || undefined}
      data-state={full ? "full" : "fit"}
      onclick={() => {
        full = !full;
      }}
      onkeydown={(event) => {
        if (event.key === "Escape" && full) {
          event.stopPropagation();
          full = false;
        }
      }}
      type="button"
    >
      <!-- biome-ignore lint/a11y/noNoninteractiveElementInteractions: a picture that fails to load says so in words. -->
      <img
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
