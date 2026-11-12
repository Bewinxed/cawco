<script lang="ts">
  /**
   * A file a delegate handed in, read from `src`: a task's output as its
   * attempt handed it in (`outputUrl`, ViewMade) or any file of the
   * project's folder as its bytes (`folderRawHref`: a report's video or
   * audio, the file card's picture). Drawn as what it is (@cawco/core
   * deliverables):
   * - a post (`*.post.json`): the post card (PostCard);
   * - markdown: the file drawn as a turn's words are (MessageBody);
   * - an image: the image, which opens in the house Lightbox;
   * - video or audio: CawCo's one player (MediaPlayer);
   * - anything else: its file row, and Open shows the file itself (the
   *   output's own route, in a tab of its own).
   * Its file row heads it, so every output is one press from the task. A
   * file the hub does not hold yet says so in the hub's words, a picture,
   * video or audio too (its element's error asks the hub why).
   * `compact` draws it small, for the project's Made list. `bare` leaves the
   * file row out where the surface already heads it with the path (the file
   * card, FolderFile); a plain file keeps its row, Open being all it has.
   */
  import {
    deliverableKind,
    type PostFile,
    parsePost,
  } from "@cawco/core/deliverables";
  import { madeWords } from "@cawco/core/words/made";
  import type { Attachment } from "svelte/attachments";
  import { on } from "svelte/events";
  import { reveal, revealOut } from "#lib/cawco/motion/curves.svelte.js";
  import { track } from "#lib/cawco/track.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import { IconArrowUpRight, IconDocument } from "#lib/icons.js";
  import { failureWords } from "../hub-read";
  import { lightbox } from "../lightbox/lightbox-state.svelte";
  import MessageBody from "../MessageBody.svelte";
  import { readOutputText } from "../project-tasks";
  import MediaPlayer from "./MediaPlayer.svelte";
  import { mediaProblem } from "./media-problem";
  import PostCard from "./PostCard.svelte";

  let {
    projectId,
    path,
    src,
    version = 0,
    compact = false,
    bare = false,
  }: {
    projectId: string;
    /** Its path, as the task's `outputs` or the folder names it. */
    path: string;
    /** Where the hub serves its bytes: `outputUrl` or `folderRawHref`. */
    src: string;
    /** Changes when the task was written again: the file is read again. */
    version?: number;
    compact?: boolean;
    /** No file row: the surface it sits in is headed with its path already. */
    bare?: boolean;
  } = $props();

  const kind = $derived(deliverableKind(path));
  /** Read as text here: a post and markdown. */
  const read = $derived(kind === "post" || kind === "markdown");
  const name = $derived(path.split("/").at(-1) ?? path);
  let content = $state<string | null>(null);
  let problem = $state<string | null>(null);
  const post = $derived.by((): PostFile | null => {
    if (kind !== "post" || content === null) {
      return null;
    }
    const parsed = parsePost(content);
    return parsed.ok ? parsed.post : null;
  });
  const postProblem = $derived.by(() => {
    if (kind !== "post" || content === null) {
      return null;
    }
    const parsed = parsePost(content);
    return parsed.ok ? null : madeWords.notPost(name, parsed.problem);
  });

  $effect(() => {
    if (!read) {
      return;
    }
    // Read again whenever the task is written again.
    track(version);
    let gone = false;
    problem = null;
    readOutputText(src)
      .then((text) => {
        if (!gone) {
          content = text;
        }
      })
      .catch((error: unknown) => {
        if (!gone) {
          problem = failureWords(error);
        }
      });
    return () => {
      gone = true;
    };
  });

  /**
   * A picture is drawn by the platform from `src`, and the platform says
   * nothing of why it could not be: on its error the hub is asked why
   * (media-problem.ts). Video and audio say their own (MediaPlayer).
   */
  $effect(() => {
    if (kind !== "image") {
      return;
    }
    // A new file is tried fresh.
    track(src);
    problem = null;
  });

  /** The picture's own error event, held as an attachment: no press on it. */
  const whenFailed: Attachment<HTMLImageElement> = (node) =>
    on(node, "error", async () => {
      const at = src;
      const words = await mediaProblem(at, name);
      if (at === src) {
        problem = words;
      }
    });

  /** The image opens in the Lightbox, out of the thumbnail it was pressed on. */
  let image = $state<HTMLImageElement | null>(null);
  function openImage() {
    if (!image) {
      return;
    }
    lightbox.open({
      kind: "image",
      index: 0,
      shots: [
        {
          alt: name,
          caption: path,
          element: image,
          height: image.naturalHeight,
          path,
          src,
          width: image.naturalWidth,
        },
      ],
    });
  }
</script>

<figure
  class="group flex flex-col min-w-0 m-0 border border-border-well rounded-sm bg-surface-well overflow-hidden"
  data-kind={kind}
  data-compact={compact || undefined}
>
  {#if !bare || kind === "file"}
    <figcaption
      data-slot="row"
      data-with-body={kind !== "file" || undefined}
      class="flex items-center gap-space-2 min-h-c-btn-h-sm ps-space-3 pe-space-1 text-ink-muted data-with-body:border-b data-with-body:border-b-border-well mark-line"
    >
      <IconDocument class="flex-none size-icon-md" />
      <bdi
        data-slot="path"
        class="flex-auto min-w-0 overflow-clip type-meta text-ellipsis whitespace-nowrap"
        title={path}>{compact ? name : path}</bdi
      >
      {#if kind === "file"}
        <a
          class="inline-flex flex-none items-center gap-space-1 h-c-btn-h-xs px-space-2 rounded-sm type-label text-ink-strong no-underline hover:bg-surface-hover mark-line press-tint focus-inset"
          data-box
          href={src}
          rel="noopener"
          target="_blank"
        >
          <span>{madeWords.open}</span>
          <IconArrowUpRight data-task-output-glyph class="size-icon-sm" />
        </a>
      {/if}
    </figcaption>
  {/if}
  {#if kind !== "file"}
    <!-- mark-line: the body stacks the output itself; no mark sits beside words in it -->
    <div
      data-slot="body"
      data-roomy={(kind === "markdown" && !compact) || undefined}
      class="p-space-3 not-data-roomy:group-data-compact:p-space-2 data-roomy:px-space-4 data-roomy:pb-space-4"
    >
      {#if problem || postProblem}
        <p class="m-0 type-meta text-status-fail-ink">
          {problem ?? postProblem}
        </p>
      {:else if read && content === null}
        <div
          data-slot="task-output-skeleton"
          aria-hidden="true"
          class="flex flex-col gap-space-2"
          out:revealOut
        >
          <Skeleton class="w-full" line="body" />
          <Skeleton class="w-11/12" line="body" />
          <Skeleton class="w-3/5" line="body" />
        </div>
      {:else if post}
        <div in:reveal>
          <PostCard {compact} {post} {projectId} />
        </div>
      {:else if kind === "markdown" && content !== null}
        <div
          data-slot="markdown"
          in:reveal
          style:--markdown-fade={"linear-gradient(to bottom, var(--mask-opaque) calc(100% - var(--space-6)), transparent)"}
          class="group-data-compact:max-h-c-task-output-compact-h group-data-compact:overflow-hidden group-data-compact:mask-(--markdown-fade)"
        >
          <MessageBody source={content} />
        </div>
      {:else if kind === "image"}
        <button
          aria-label={madeWords.openFile(name)}
          class="select-none block p-0 rounded-sm cursor-zoom-in press-tint focus-inset"
          onclick={openImage}
          type="button"
          in:reveal
        >
          <img
            alt={name}
            class="block max-w-full max-h-c-task-output-image-h group-data-compact:max-h-c-task-output-compact-h rounded-sm"
            {src}
            bind:this={image}
            {@attach whenFailed}
          />
        </button>
      {:else if kind === "video" || kind === "audio"}
        <MediaPlayer
          class="group-data-[kind=video]:max-h-c-task-output-video-h"
          {kind}
          {name}
          {src}
        />
      {/if}
    </div>
  {/if}
</figure>
