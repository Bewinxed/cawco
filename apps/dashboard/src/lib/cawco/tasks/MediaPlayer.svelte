<script lang="ts">
  /**
   * A clip or a sound in the platform's own player, read from `src`: a
   * task's output, a report's file (TaskOutput), a block's Video or Audio
   * (BlockVideo, BlockAudio). Its metadata alone loads until it is played.
   * One that can't play says why in the hub's words (media-problem.ts).
   */
  import type { Attachment } from "svelte/attachments";
  import { on } from "svelte/events";
  import { reveal } from "#lib/cawco/motion/curves.svelte.js";
  import { track } from "#lib/cawco/track.js";
  import { cn } from "#lib/utils.js";
  import { mediaProblem } from "./media-problem";

  let {
    src,
    name,
    kind,
    class: className,
  }: {
    src: string;
    /** What it is called where it fails: its file's name. */
    name: string;
    kind: "video" | "audio";
    class?: string;
  } = $props();

  let problem = $state<string | null>(null);
  $effect(() => {
    // A new file is tried fresh.
    track(src);
    problem = null;
  });

  /** The element's own error event, held as an attachment: no press on it. */
  const whenFailed: Attachment<HTMLMediaElement> = (node) =>
    on(node, "error", async () => {
      const at = src;
      const words = await mediaProblem(at, name);
      if (at === src) {
        problem = words;
      }
    });
</script>

{#if problem}
  <p class="m-0 type-meta text-status-fail-ink wrap-anywhere">{problem}</p>
{:else if kind === "video"}
  <!-- svelte-ignore a11y_media_has_caption: a file carries no caption track; the file is what there is -->
  <!-- biome-ignore lint/a11y/useMediaCaption: a file carries no caption track; the file is what there is -->
  <video
    class={cn("block w-full rounded-sm bg-surface-recess", className)}
    controls
    playsinline
    preload="metadata"
    {src}
    {@attach whenFailed}
    in:reveal
  ></video>
{:else}
  <!-- biome-ignore lint/a11y/useMediaCaption: a file carries no caption track; the file is what there is -->
  <audio
    class={cn("block w-full", className)}
    controls
    preload="metadata"
    {src}
    {@attach whenFailed}
    in:reveal
  ></audio>
{/if}
