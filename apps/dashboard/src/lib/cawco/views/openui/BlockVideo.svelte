<!--
  A block's clip (tsk-330): a file the agent names, read where the block is
  drawn (block-media.ts), in CawCo's player (MediaPlayer), its
  metadata alone loaded until it is played. Sized by its agent it takes
  that room, unsized the reply's measure (block-size.ts).

  The frame it last showed (its first, then each it was paused or sought
  at) is kept as a picture (`clipStills`). Replaced, its block holds no
  player: it stands as that picture, or where none was taken a box of a
  clip's shape saying it was a video, its caption under it. Its block
  going from latest to replaced takes its player down, so a clip playing
  stops.
-->
<script lang="ts">
  import { transcriptWords } from "@cawco/core/words/transcript";
  import { IconVideo } from "#lib/icons.js";
  import MediaPlayer from "../../tasks/MediaPlayer.svelte";
  import { blockMediaHere, clipStills, namedFile } from "./block-media";
  import { BLOCK_ROOM, blockSize } from "./block-size";
  import type { OpenUIRenderProps } from "./OpenUiRenderer.svelte";

  let {
    props,
  }: OpenUIRenderProps<{
    file: unknown;
    caption?: unknown;
    size?: unknown;
  }> = $props();

  const media = blockMediaHere();
  const { file, name, caption, source } = $derived(
    namedFile(media, props.file, props.caption)
  );
  const size = $derived(blockSize(props.size) ?? "medium");
  const still = $derived(source ? clipStills.get(source.href) : undefined);

  /** Keeps the frame its player shows as a picture, for its still once replaced. */
  const keepsStills = (box: HTMLElement) => {
    const take = (event: Event) => {
      const clip = event.target;
      if (
        !(clip instanceof HTMLVideoElement) ||
        clip.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
        clip.videoWidth === 0
      ) {
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = clip.videoWidth;
      canvas.height = clip.videoHeight;
      try {
        canvas.getContext("2d")?.drawImage(clip, 0, 0);
        clipStills.set(
          clip.currentSrc || clip.src,
          canvas.toDataURL("image/jpeg", 0.8)
        );
      } catch (error) {
        // A frame the page may not read (another origin's, so the canvas is
        // tainted) leaves the box of a clip's shape; anything else is a fault.
        if (!(
          error instanceof DOMException && error.name === "SecurityError"
        )) {
          throw error;
        }
      }
    };
    // A media element's events don't bubble: heard on their way down.
    for (const type of ["loadeddata", "pause", "seeked"]) {
      box.addEventListener(type, take, true);
    }
    return () => {
      for (const type of ["loadeddata", "pause", "seeked"]) {
        box.removeEventListener(type, take, true);
      }
    };
  };
</script>

<!-- mark-line: the clip stands over its caption, in a column -->
<figure
  class={["m-0 min-w-0 max-w-full", BLOCK_ROOM[size]]}
  data-slot="block-video"
>
  {#if !source}
    <p
      class="m-0 type-meta text-ink-muted wrap-anywhere"
      data-slot="media-gone"
    >
      {transcriptWords.blockFileUnshown(file)}
    </p>
  {:else if media.still}
    {#if still}
      <img
        alt={caption || name}
        class="block h-auto max-w-full rounded-sm outline-1 -outline-offset-1 outline-image-outline"
        data-slot="clip-still"
        src={still}
      />
    {:else}
      <!-- mark-line: the glyph stands above its word -->
      <div
        class="grid aspect-16/9 w-full place-items-center content-center gap-space-1 rounded-sm bg-surface-recess text-ink-muted"
        data-slot="clip-still"
      >
        <IconVideo class="size-icon-md" />
        <span class="type-meta">{transcriptWords.blockVideoStill}</span>
      </div>
    {/if}
  {:else}
    <div {@attach keepsStills}>
      <MediaPlayer kind="video" {name} {source} />
    </div>
  {/if}
  {#if caption}
    <figcaption class="mt-space-2 type-meta text-ink-muted wrap-anywhere">
      {caption}
    </figcaption>
  {/if}
</figure>
