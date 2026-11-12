<!--
  A block's picture (tsk-330): a file the agent names, read where the block
  is drawn (block-media.ts): from its session's machine or its project's
  folder in a reply, from beside the page once kept. An animated GIF, WebP
  or PNG plays as it is. Pressed, it opens full size among the block's
  other pictures (`data-block-gallery`), in the Lightbox in a reply and in
  PhotoSwipe on a kept page.

  Sized by its agent it takes that room (block-size.ts); unsized it stands
  at its own size up to the reply's measure, and in a Row it shares the
  row with the pictures beside it, never under `--spacing-c-picture-min` before
  the Row wraps it onto a line of its own. A file it can't name, or one
  that didn't load, says so in one line where it would stand.
-->
<script lang="ts">
  import { transcriptWords } from "@cawco/core/words/transcript";
  import type { Attachment } from "svelte/attachments";
  import { on } from "svelte/events";
  import { blockMediaHere, namedFile } from "./block-media";
  import { BLOCK_ROOM, blockSize, PICTURE_ROOM } from "./block-size";
  import type { OpenUIRenderProps } from "./OpenUiRenderer.svelte";

  let {
    props,
  }: OpenUIRenderProps<{
    file: unknown;
    alt: unknown;
    caption?: unknown;
    size?: unknown;
  }> = $props();

  const media = blockMediaHere();
  const { file, caption, src } = $derived(
    namedFile(media, props.file, props.caption)
  );
  const alt = $derived(String(props.alt ?? "") || file);
  const size = $derived(blockSize(props.size));
  /** The address that didn't load: a new one is tried fresh. */
  let failed = $state<string | null>(null);
  let shown = $state<HTMLImageElement>();
  /** A picture that didn't load says so in words where it stood. */
  const whenFailed: Attachment<HTMLImageElement> = (node) =>
    on(node, "error", () => {
      failed = node.getAttribute("src");
    });

  /** The block's pictures, this one among them, opened full size at this one. */
  function open(): void {
    if (!shown) {
      return;
    }
    const pictures = [
      ...(shown
        .closest("[data-block-gallery]")
        ?.querySelectorAll<HTMLImageElement>("img[data-block-picture]") ?? [
        shown,
      ]),
    ].filter((one) => one.naturalWidth > 0);
    media.open(
      pictures.map((one) => ({
        src: one.currentSrc || one.src,
        alt: one.alt,
        caption: one.dataset.caption,
        width: one.naturalWidth,
        height: one.naturalHeight,
        element: one,
      })),
      Math.max(0, pictures.indexOf(shown))
    );
  }
</script>

<!-- mark-line: the picture stands over its caption, in a column -->
<figure
  class={["m-0 min-w-0 max-w-full", size ? BLOCK_ROOM[size] : PICTURE_ROOM]}
  data-slot="block-picture"
>
  {#if src && failed !== src}
    <button
      aria-haspopup="dialog"
      aria-label={transcriptWords.blockPictureOpen(alt)}
      class="block w-full cursor-zoom-in rounded-sm p-0 focus-inset"
      onclick={open}
      type="button"
    >
      <img
        bind:this={shown}
        {alt}
        class="block h-auto w-full rounded-sm outline-1 -outline-offset-1 outline-image-outline"
        data-block-picture
        data-caption={caption || undefined}
        decoding="async"
        loading="lazy"
        {src}
        {@attach whenFailed}
      />
    </button>
  {:else}
    <p
      class="m-0 type-meta text-ink-muted wrap-anywhere"
      data-slot="media-gone"
    >
      {src
        ? transcriptWords.blockPictureFailed(alt)
        : transcriptWords.blockFileUnshown(file)}
    </p>
  {/if}
  {#if caption}
    <figcaption class="mt-space-2 type-meta text-ink-muted wrap-anywhere">
      {caption}
    </figcaption>
  {/if}
</figure>
