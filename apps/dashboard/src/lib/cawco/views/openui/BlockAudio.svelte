<!--
  A block's sound (tsk-330): a file the agent names (narration a
  text-to-speech tool made, a recording), read where the block is drawn
  (block-media.ts), in CawCo's player (MediaPlayer), its metadata
  alone loaded until it is played; the reply's measure wide, its caption
  under it. Replaced, its block holds no player: it stands as one still
  row, the sound's mark and its caption (its file's name where it has
  none). Its block going from latest to replaced takes its player down, so
  a sound playing stops.
-->
<script lang="ts">
  import { transcriptWords } from "@cawco/core/words/transcript";
  import { IconAudio } from "#lib/icons.js";
  import MediaPlayer from "../../tasks/MediaPlayer.svelte";
  import { blockMediaHere, namedFile } from "./block-media";
  import { MEASURE_ROOM } from "./block-size";
  import type { OpenUIRenderProps } from "./OpenUiRenderer.svelte";

  let { props }: OpenUIRenderProps<{ file: unknown; caption?: unknown }> =
    $props();

  const media = blockMediaHere();
  const { file, name, caption, source } = $derived(
    namedFile(media, props.file, props.caption)
  );
</script>

<figure class={["m-0 min-w-0", MEASURE_ROOM]} data-slot="block-audio">
  {#if !source}
    <p
      class="m-0 type-meta text-ink-muted wrap-anywhere"
      data-slot="media-gone"
    >
      {transcriptWords.blockFileUnshown(file)}
    </p>
  {:else if media.still}
    <p
      class="mark-line m-0 flex min-h-c-btn-h items-center gap-space-2 rounded-pill bg-surface-recess px-space-3 text-ink-muted"
      data-slot="sound-still"
    >
      <IconAudio class="size-icon-md flex-none" />
      <span class="min-w-0 type-meta wrap-anywhere">
        {caption || name}
        <span class="sr-only">({transcriptWords.blockAudioStill})</span>
      </span>
    </p>
  {:else}
    <MediaPlayer kind="audio" {name} {source} />
    {#if caption}
      <figcaption class="mt-space-2 type-meta text-ink-muted wrap-anywhere">
        {caption}
      </figcaption>
    {/if}
  {/if}
</figure>
