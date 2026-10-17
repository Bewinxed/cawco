<script lang="ts">
  /**
   * One of a task's outputs, as its attempt handed it in (the hub serves it
   * from where it copied it, `outputUrl`), drawn as what it is (@cawco/core
   * deliverables):
   * - a post (`*.post.json`): the post card (PostCard);
   * - markdown: the file drawn as a turn's words are (MessageBody);
   * - an image: the image, which opens in the house Lightbox;
   * - video or audio: the platform's own player;
   * - anything else: its file row, and Open shows the file itself (the
   *   output's own route, in a tab of its own).
   * Its file row heads it, so every output is one press from the task. A
   * file the hub does not hold yet says so in the hub's words.
   * `compact` draws it small, for the project's Made list.
   */
  import { deliverableKind, type PostFile, parsePost } from "@cawco/core";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import { IconArrowUpRight, IconDocument } from "#lib/icons.js";
  import { failureWords } from "../hub-read";
  import { lightbox } from "../lightbox/lightbox-state.svelte";
  import MessageBody from "../MessageBody.svelte";
  import { outputUrl, readOutputText } from "../project-tasks";
  import PostCard from "./PostCard.svelte";

  let {
    projectId,
    taskId,
    path,
    version = 0,
    compact = false,
  }: {
    projectId: string;
    /** The task that names it in its `outputs`. */
    taskId: string;
    path: string;
    /** Changes when the task was written again: the file is read again. */
    version?: number;
    compact?: boolean;
  } = $props();

  const kind = $derived(deliverableKind(path));
  /** Read as text here: a post and markdown. */
  const read = $derived(kind === "post" || kind === "markdown");
  const raw = $derived(outputUrl(projectId, taskId, path));
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
    return parsed.ok
      ? null
      : `${name} does not read as a post. ${parsed.problem}`;
  });

  $effect(() => {
    if (!read) {
      return;
    }
    // Read again whenever the task is written again.
    // biome-ignore lint/complexity/noVoid: a read-only dependency
    void version;
    let gone = false;
    problem = null;
    readOutputText(projectId, taskId, path)
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
          src: raw,
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
        href={raw}
        rel="noopener"
        target="_blank"
      >
        <span>Open</span>
        <IconArrowUpRight data-task-output-glyph class="size-icon-sm" />
      </a>
    {/if}
  </figcaption>
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
        >
          <Skeleton class="h-space-4 w-full" />
          <Skeleton class="h-space-4 w-11/12" />
          <Skeleton class="h-space-4 w-3/5" />
        </div>
      {:else if post}
        <PostCard {compact} {post} {projectId} />
      {:else if kind === "markdown" && content !== null}
        <!-- literal: 6rem -->
        <div
          data-slot="markdown"
          style:--markdown-max="6rem"
          style:--markdown-fade={"linear-gradient(to bottom, var(--mask-opaque) calc(100% - var(--space-6)), transparent)"}
          class="group-data-compact:max-h-(--markdown-max) group-data-compact:overflow-hidden group-data-compact:mask-(--markdown-fade)"
        >
          <MessageBody source={content} />
        </div>
      {:else if kind === "image"}
        <button
          aria-label="Open {name}"
          class="block p-0 rounded-sm cursor-zoom-in press-tint focus-inset"
          onclick={openImage}
          type="button"
        >
          <!-- literal: 20rem, 6rem -->
          <img
            alt={name}
            class="block max-w-full max-h-(--image-max) group-data-compact:max-h-(--image-max-compact) rounded-sm"
            src={raw}
            style:--image-max="20rem"
            style:--image-max-compact="6rem"
            bind:this={image}
          />
        </button>
      {:else if kind === "video"}
        <!-- svelte-ignore a11y_media_has_caption -->
        <!-- literal: 24rem -->
        <!-- biome-ignore lint/a11y/useMediaCaption: a task's output carries no caption track; its file is what there is -->
        <video
          class="block w-full max-h-(--video-max) rounded-sm bg-surface-recess"
          controls
          preload="metadata"
          src={raw}
          style:--video-max="24rem"
        ></video>
      {:else if kind === "audio"}
        <!-- biome-ignore lint/a11y/useMediaCaption: a task's output carries no caption track; its file is what there is -->
        <audio class="w-full" controls preload="metadata" src={raw}></audio>
      {/if}
    </div>
  {/if}
</figure>
