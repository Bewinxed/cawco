<script lang="ts">
  /**
   * One of a task's outputs, as its attempt left it in the project's folder,
   * drawn as what it is (@cawco/core deliverables):
   * - a post (`*.post.json`): the post card (PostCard);
   * - markdown: the file drawn as a turn's words are (MessageBody);
   * - an image: the image, which opens in the house Lightbox;
   * - video or audio: the platform's own player;
   * - anything else: its file row, and Open shows the file itself (the
   *   folder's raw route, in a tab of its own).
   * Its file row heads it, so every output is one press from the task. A
   * file the folder does not hold yet says so in the hub's words.
   * `compact` draws it small, for the project's Made list.
   */
  import { deliverableKind, type PostFile, parsePost } from "@cawco/core";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import { IconArrowUpRight, IconDocument } from "#lib/icons.js";
  import { failureWords } from "../hub-read";
  import { lightbox } from "../lightbox/lightbox-state.svelte";
  import MessageBody from "../MessageBody.svelte";
  import { folderRawHref, readFolderFile } from "../project-tasks";
  import PostCard from "./PostCard.svelte";

  let {
    projectId,
    path,
    version = 0,
    compact = false,
  }: {
    projectId: string;
    path: string;
    /** Changes when the task was written again: the file is read again. */
    version?: number;
    compact?: boolean;
  } = $props();

  const kind = $derived(deliverableKind(path));
  /** Read as text here: a post and markdown. */
  const read = $derived(kind === "post" || kind === "markdown");
  const raw = $derived(folderRawHref(projectId, path));
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
    readFolderFile(projectId, path)
      .then(({ content: text }) => {
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

<figure class="output" data-kind={kind} class:compact={compact}>
  <figcaption class="row">
    <IconDocument class="icon" />
    <bdi class="path" title={path}>{compact ? name : path}</bdi>
    {#if kind === "file"}
      <a
        class="open press-tint focus-inset"
        href={raw}
        rel="noopener"
        target="_blank"
      >
        Open
        <IconArrowUpRight class="glyph" />
      </a>
    {/if}
  </figcaption>
  {#if kind !== "file"}
    <div class="body">
      {#if problem || postProblem}
        <p class="problem">{problem ?? postProblem}</p>
      {:else if read && content === null}
        <div aria-hidden="true" class="skeleton">
          <Skeleton class="h-3.5 w-full" />
          <Skeleton class="h-3.5 w-11/12" />
          <Skeleton class="h-3.5 w-3/5" />
        </div>
      {:else if post}
        <PostCard {compact} {post} {projectId} />
      {:else if kind === "markdown" && content !== null}
        <div class="markdown">
          <MessageBody source={content} />
        </div>
      {:else if kind === "image"}
        <button
          aria-label="Open {name}"
          class="image press-tint focus-inset"
          onclick={openImage}
          type="button"
        >
          <img alt={name} src={raw} bind:this={image}>
        </button>
      {:else if kind === "video"}
        <!-- svelte-ignore a11y_media_has_caption -->
        <!-- biome-ignore lint/a11y/useMediaCaption: a task's output carries no caption track; its file is what there is -->
        <video controls preload="metadata" src={raw}></video>
      {:else if kind === "audio"}
        <!-- biome-ignore lint/a11y/useMediaCaption: a task's output carries no caption track; its file is what there is -->
        <audio controls preload="metadata" src={raw}></audio>
      {/if}
    </div>
  {/if}
</figure>

<style>
  .output {
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
    margin: 0;
    border: 1px solid var(--border-well);
    border-radius: var(--radius-sm);
    background: var(--surface-well);
    overflow: hidden;
  }
  .row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-block-size: var(--c-btn-h-sm);
    padding-inline: var(--space-3) var(--space-1);
    color: var(--ink-muted);
  }
  .output:has(.body) .row {
    border-block-end: 1px solid var(--border-well);
  }
  .row :global(.icon) {
    flex: none;
    inline-size: var(--icon-md);
    block-size: var(--icon-md);
  }
  .path {
    flex: 1 1 auto;
    min-inline-size: 0;
    overflow: hidden;
    font: var(--type-meta);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .open {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: var(--space-1);
    block-size: var(--c-btn-h-xs);
    padding-inline: var(--space-2);
    border-radius: var(--radius-sm);
    font: var(--type-label);
    color: var(--ink-strong);
    text-decoration: none;
  }
  .open :global(.glyph) {
    inline-size: var(--icon-sm);
    block-size: var(--icon-sm);
  }
  @media (hover: hover) and (pointer: fine) {
    .open:hover {
      background: var(--surface-hover);
    }
  }
  .body {
    padding: var(--space-3);
  }
  .output.compact .body {
    padding: var(--space-2);
  }
  .output[data-kind="markdown"]:not(.compact) .body {
    padding: var(--space-3) var(--space-4) var(--space-4);
  }
  .compact .markdown {
    max-block-size: 6rem;
    overflow: hidden;
    mask-image: linear-gradient(
      to bottom,
      black calc(100% - var(--space-6)),
      transparent
    );
  }
  .image {
    display: block;
    padding: 0;
    border-radius: var(--radius-sm);
    cursor: zoom-in;
  }
  .image img {
    display: block;
    max-inline-size: 100%;
    max-block-size: 20rem;
    border-radius: var(--radius-sm);
  }
  .compact .image img {
    max-block-size: 6rem;
  }
  video {
    display: block;
    inline-size: 100%;
    max-block-size: 24rem;
    border-radius: var(--radius-sm);
    background: var(--surface-recess);
  }
  audio {
    inline-size: 100%;
  }
  .skeleton {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .problem {
    margin: 0;
    font: var(--type-meta);
    color: var(--status-fail-ink);
  }
</style>
