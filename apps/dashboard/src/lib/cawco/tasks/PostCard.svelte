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

<div class="post" class:compact={compact}>
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
  <ol aria-label={parts.length > 1 ? "Thread" : "Post"} class="parts">
    {#each parts as text, index (index)}
      {@const length = postLength(text)}
      <li class="card" data-part={index}>
        <div class="who">
          <span aria-hidden="true" class="mark"
            >{handle.slice(0, 1).toUpperCase()}</span
          >
          <span class="account">{post.account}</span>
          {#if parts.length > 1}
            <span class="part num">{index + 1}/{parts.length}</span>
          {/if}
        </div>
        <p class="text">{text}</p>
        {#if !compact}
          <span
            class="count num"
            title="As X counts it: a link is 23, a line break is one"
            class:over={length > POST_LIMIT}
            >{length}/{POST_LIMIT}</span
          >
        {/if}
      </li>
    {/each}
  </ol>
  {#if !compact && (post.community || post.media)}
    <dl class="about">
      {#if post.community}
        <div class="fact">
          <dt>Community</dt>
          <dd class="name">{post.community}</dd>
        </div>
      {/if}
      {#if media.length > 0}
        <div class="fact">
          <dt>Media</dt>
          <dd class="media">
            {#each media as file (file)}
              {@const kind = deliverableKind(file)}
              {#if kind === "image"}
                <img alt="" src={folderRawHref(projectId, file)}>
              {:else if kind === "video"}
                <!-- svelte-ignore a11y_media_has_caption -->
                <!-- biome-ignore lint/a11y/useMediaCaption: a post's media file carries no caption track -->
                <video
                  controls
                  preload="metadata"
                  src={folderRawHref(projectId, file)}
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
        <div class="fact">
          <dt>Media plan</dt>
          <dd class="sentence">{post.media.plan}</dd>
        </div>
      {/if}
    </dl>
  {/if}
</div>

<style>
  .post {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-inline-size: 0;
  }
  .parts {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .card {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--border-hairline);
    border-radius: var(--radius-md);
    background: var(--surface-raised);
    box-shadow: var(--shadow-tile);
  }
  /* A thread's parts are joined down their marks' axis. */
  .card + .card::before {
    content: "";
    position: absolute;
    inset-block-start: calc(var(--space-2) * -1 - 1px);
    inset-inline-start: calc(var(--space-4) + 11px);
    inline-size: 2px;
    block-size: calc(var(--space-2) + 1px);
    background: var(--border-control);
  }
  .who {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-inline-size: 0;
  }
  .mark {
    display: grid;
    flex: none;
    place-items: center;
    inline-size: 24px;
    block-size: 24px;
    border-radius: 50%;
    background: var(--surface-fill);
    font: var(--type-meta);
    font-weight: var(--weight-strong);
    color: var(--ink-strong);
  }
  .account {
    min-inline-size: 0;
    overflow: hidden;
    font: var(--type-label);
    color: var(--ink-strong);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .part {
    margin-inline-start: auto;
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .text {
    margin: 0;
    font: var(--type-body);
    color: var(--ink-strong);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .count {
    align-self: flex-end;
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .count.over {
    color: var(--status-fail-ink);
  }
  .compact .card {
    padding: var(--space-2) var(--space-3);
    box-shadow: none;
  }
  .compact .text {
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    line-clamp: 3;
  }
  .about {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin: 0;
  }
  .fact {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  dt {
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  /* What the reviewer reads, by its role (The Role, Not Size Rule): the
     community is a name, the media plan a sentence. */
  dd {
    margin: 0;
    font: var(--type-meta);
    color: var(--ink-strong);
  }
  dd.name {
    font: var(--type-label);
  }
  dd.sentence {
    font: var(--type-body);
    text-wrap: pretty;
  }
  .media {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .media img,
  .media video {
    max-inline-size: 100%;
    max-block-size: 16rem;
    border-radius: var(--radius-sm);
  }
</style>
