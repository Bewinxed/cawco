<script lang="ts" module>
  import type { Component } from "svelte";
  import {
    IconArtifactCanvas,
    IconArtifactPage,
    IconDecisions,
    IconDocument,
    IconFileMarkdown,
    IconImage,
    IconSend,
    IconVideo,
  } from "#lib/icons.js";
  import type { OutputKind } from "./model";

  export const KIND_GLYPHS: Record<OutputKind, Component> = {
    post: IconSend,
    markdown: IconFileMarkdown,
    picture: IconImage,
    media: IconVideo,
    file: IconDocument,
    preview: IconArtifactPage,
    canvas: IconArtifactCanvas,
    choices: IconDecisions,
  };
</script>

<script lang="ts">
  /**
   * One thing the project made, drawn as what it is (TOM task 9): a post as
   * its words with its alternates and media plan, a document by its first
   * lines, a picture or a clip on its well, a file the hub cannot serve
   * named with why. Its foot is the task that made it and that task's
   * stage, which opens the task; the item itself opens whole.
   */
  import { railOfPlacesWords as w } from "@cawco/core/words/rail-of-places";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import type { Output } from "./model";

  let {
    output,
    stage,
    showTask = true,
    ontask,
  }: {
    output: Output;
    /** The stage's name, where a task made it. */
    stage: string | null;
    /** Its foot names the task (newest first); grouped by task, it does not. */
    showTask?: boolean;
    ontask: (id: string) => void;
  } = $props();

  const Glyph = $derived(KIND_GLYPHS[output.kind]);
  const byTask = $derived(output.task.startsWith("tsk-"));
</script>

<article
  class="flex min-w-0 flex-col overflow-hidden rounded-lg bg-surface-raised shadow-tile"
  aria-label="{w.kinds[output.kind]}: {output.name}"
>
  <button
    type="button"
    class="press-tint focus-inset flex min-w-0 flex-1 flex-col gap-space-2 p-space-3 text-start hover:bg-surface-hover"
    aria-label="{w.openWhole}: {output.name}"
  >
    <span class="mark-line flex min-w-0 items-center gap-space-2">
      <Glyph class="size-icon-md flex-none text-ink-muted" aria-hidden="true" />
      <span class="min-w-0 flex-1 truncate type-label text-ink-row"
        >{output.post ? output.post.account : output.name}</span
      >
      {#if output.isNew}
        <Badge>{w.isNew}</Badge>
      {/if}
      {#if output.promoted}
        <Badge variant="secondary">{w.promoted}</Badge>
      {/if}
    </span>
    {#if output.post}
      <p class="line-clamp-6 type-body whitespace-pre-line text-ink-strong">
        {output.post.text}
      </p>
      <span class="type-meta text-ink-muted">
        {w.alternates(output.post.alternates)}{#if output.post.media}
          · {w.mediaPlan}: {output.post.media}{/if}
      </span>
    {:else if output.kind === "picture" || output.kind === "media"}
      <span
        class="grid aspect-16/10 w-full place-items-center rounded-md bg-surface-fill text-ink-muted"
        aria-hidden="true"
      >
        <Glyph class="size-icon-lg" />
      </span>
      {#if output.size}
        <span class="type-meta num text-ink-muted">{output.size}</span>
      {/if}
    {:else if output.notServed}
      <span class="type-meta num text-ink-muted">{output.size}</span>
      <p class="type-body text-status-fail-ink">
        {w.notServed(output.notServed)}
      </p>
    {:else if output.excerpt}
      <p class="line-clamp-4 type-body text-ink-strong">{output.excerpt}</p>
      {#if output.size}
        <span class="type-meta num text-ink-muted">{output.size}</span>
      {/if}
    {:else}
      <span
        class="grid aspect-16/10 w-full place-items-center rounded-md bg-surface-recess text-ink-muted"
        aria-hidden="true"
      >
        <Glyph class="size-icon-lg" />
      </span>
    {/if}
  </button>
  <footer
    class="mark-line flex min-w-0 items-center gap-space-2 border-t border-border-hairline px-space-3 py-space-2 type-meta text-ink-muted"
  >
    {#if showTask && byTask}
      <button
        type="button"
        class="focus-inset min-w-0 truncate text-start text-link-ink hover:underline"
        onclick={() => ontask(output.task)}>{output.taskTitle}</button
      >
    {:else if showTask}
      <span class="min-w-0 truncate">{output.taskTitle}</span>
    {/if}
    {#if stage && showTask}
      <span aria-hidden="true">·</span><span class="flex-none">{stage}</span>
    {/if}
    <span class="ms-auto flex-none num">{output.when}</span>
  </footer>
</article>
