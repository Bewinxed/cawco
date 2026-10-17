<script lang="ts">
  /**
   * A post deliverable (`*.post.json`, @cawco/core deliverables) drawn as the
   * post it will be: a neutral card in the house's own surfaces, no service's
   * trade dress. The account, then the words with their line breaks as they
   * go out, then the length as X counts it (a link is 23, a line break one)
   * against the limit. A thread is one card per part, joined down their
   * leading edge. Alternates are a switch over the first card that swaps its
   * first paragraph in place, and its count with it. Under the cards, quietly:
   * the community it goes to, then the media, as files once they exist,
   * else the plan in words.
   */
  import {
    deliverableKind,
    POST_LIMIT,
    type PostFile,
    postLength,
    withFirstParagraph,
  } from "@cawco/core";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
  import { folderRawHref } from "../project-tasks";

  let {
    post,
    projectId,
    compact = false,
  }: {
    post: PostFile;
    projectId: string;
    /** Drawn small (the project's Made list): the first part's words only. */
    compact?: boolean;
  } = $props();

  /** "0" as written; "1", "2": an alternate's index plus one. */
  let choice = $state("0");
  const first = $derived(
    choice === "0"
      ? post.text
      : withFirstParagraph(
          post.text,
          post.alternates?.[Number(choice) - 1] ?? ""
        )
  );
  const parts = $derived(compact ? [first] : [first, ...(post.thread ?? [])]);
  const handle = $derived(post.account.replace(/^@/, ""));
  const media = $derived(post.media?.files ?? []);
</script>

<div
  class="group flex min-w-0 flex-col gap-space-2"
  data-compact={compact || undefined}
>
  {#if !compact && (post.alternates?.length ?? 0) > 0}
    <Tabs
      onValueChange={(next) => {
        choice = next;
      }}
      size="compact"
      value={choice}
    >
      <TabsList aria-label="First paragraph">
        <TabItem label="As written" value="0" />
        {#each post.alternates ?? [] as _, index (index)}
          <TabItem label="Alternate {index + 1}" value={String(index + 1)} />
        {/each}
      </TabsList>
    </Tabs>
  {/if}
  <ol
    aria-label={parts.length > 1 ? "Thread" : "Post"}
    class="m-0 flex list-none flex-col gap-space-2 p-0"
  >
    {#each parts as text, index (index)}
      {@const length = postLength(text)}
      <li
        data-slot="post-card-card"
        class="relative flex flex-col gap-space-2 rounded-md border border-border-hairline bg-surface-raised px-space-4 py-space-3 shadow-tile group-data-compact:px-space-3 group-data-compact:py-space-2 group-data-compact:shadow-none"
        data-part={index}
      >
        <div
          data-slot="who"
          class="mark-line flex min-w-0 items-center gap-space-2"
        >
          <!-- literal: 24px, 50% -->
          <span
            data-slot="mark"
            aria-hidden="true"
            class="grid size-(--mark) flex-none place-items-center rounded-(--mark-r) bg-surface-fill text-meta font-medium text-ink-strong"
            data-box
            style:--mark="24px"
            style:--mark-r="50%"
            >{handle.slice(0, 1).toUpperCase()}</span
          >
          <span
            class="min-w-0 overflow-clip type-label text-ellipsis whitespace-nowrap text-ink-strong"
            >{post.account}</span
          >
          {#if parts.length > 1}
            <span
              data-slot="num"
              class="num ms-auto type-meta text-ink-muted"
              >{index + 1}/{parts.length}</span
            >
          {/if}
        </div>
        <p
          data-slot="text"
          class="m-0 type-body wrap-anywhere whitespace-pre-wrap text-ink-strong group-data-compact:line-clamp-3"
          >{text}</p
        >
        {#if !compact}
          <span
            data-num
            data-slot="count"
            class="num self-end type-meta text-ink-muted data-over:text-status-fail-ink"
            title="As X counts it: a link is 23, a line break is one"
            data-over={length > POST_LIMIT || undefined}
            >{length}/{POST_LIMIT}</span
          >
        {/if}
      </li>
    {/each}
  </ol>
  {#if !compact && (post.community || post.media)}
    <dl class="m-0 flex flex-col gap-space-1">
      {#if post.community}
        <div class="flex flex-col gap-space-row">
          <dt class="type-meta text-ink-muted">Community</dt>
          <dd data-slot="name" class="m-0 type-label text-ink-strong">
            {post.community}
          </dd>
        </div>
      {/if}
      {#if media.length > 0}
        <div class="flex flex-col gap-space-row">
          <dt class="type-meta text-ink-muted">Media</dt>
          <!-- mark-line: each media file stands on its own, a picture or a player, beside no words -->
          <dd
            class="m-0 flex flex-wrap gap-space-2 type-meta text-ink-strong"
          >
            {#each media as file (file)}
              {@const kind = deliverableKind(file)}
              {#if kind === "image"}
                <!-- literal: 16rem -->
                <img
                  alt=""
                  class="max-h-(--max-h) max-w-full rounded-sm"
                  src={folderRawHref(projectId, file)}
                  style:--max-h="16rem"
                />
              {:else if kind === "video"}
                <!-- svelte-ignore a11y_media_has_caption -->
                <!-- literal: 16rem -->
                <!-- biome-ignore lint/a11y/useMediaCaption: a post's media file carries no caption track -->
                <video
                  class="max-h-(--max-h) max-w-full rounded-sm"
                  controls
                  preload="metadata"
                  src={folderRawHref(projectId, file)}
                  style:--max-h="16rem"
                ></video>
              {:else}
                <a href={folderRawHref(projectId, file)} target="_blank"
                  >{file}</a
                >
              {/if}
            {/each}
          </dd>
        </div>
      {:else if post.media}
        <div class="flex flex-col gap-space-row">
          <dt class="type-meta text-ink-muted">Media plan</dt>
          <dd
            data-slot="sentence"
            class="m-0 type-body text-pretty text-ink-strong"
          >
            {post.media.plan}
          </dd>
        </div>
      {/if}
    </dl>
  {/if}
</div>

<style>
  /* residual: pseudo — a thread's parts are joined down their marks' axis. */
  [data-slot="post-card-card"] + [data-slot="post-card-card"]::before {
    content: "";
    position: absolute;
    inset-block-start: calc(var(--space-2) * -1 - 1px);
    inset-inline-start: calc(var(--space-4) + var(--space-3));
    inline-size: 2px;
    block-size: calc(var(--space-2) + 1px);
    background: var(--border-control);
  }
</style>
