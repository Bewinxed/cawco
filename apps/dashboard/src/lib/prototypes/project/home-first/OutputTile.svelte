<script lang="ts">
  /**
   * One thing the work produced, drawn as what it is (TOM task 9): a post
   * as its words with its alternates and media plan counted, a picture as
   * the picture, markdown as its opening lines, a preview, canvas or choice
   * set as its kind's glyph on a well, media with its length, a file with
   * its size, and a file the hub cannot serve with why. Under it, its name
   * and the task that made it, which opens that task. `small` for Home's
   * group; `card` on the Outputs page.
   */
  import { homeFirstWords as words } from "@cawco/core/words/proto-home-first";
  import cawFace from "#lib/assets/brand/cawco-icon.png";
  import {
    IconArtifactCanvas,
    IconDecisions,
    IconDocument,
    IconFileMarkdown,
    IconImage,
    IconPlay,
    IconWindow,
  } from "#lib/icons.js";
  import type { Output } from "./model";

  let {
    output,
    size = "small",
    stale = false,
    onopen,
    ontask,
  }: {
    output: Output;
    size?: "small" | "card";
    stale?: boolean;
    onopen?: (output: Output) => void;
    ontask?: (task: string) => void;
  } = $props();

  const GLYPH = {
    post: IconDocument,
    markdown: IconFileMarkdown,
    picture: IconImage,
    media: IconPlay,
    file: IconDocument,
    preview: IconWindow,
    canvas: IconArtifactCanvas,
    choices: IconDecisions,
  } as const;
  const Glyph = $derived(GLYPH[output.kind]);
  const kindWord = $derived(words.outputs.kinds[output.kind]);
</script>

<li
  class={[
    "flex min-w-0 flex-col overflow-clip rounded-md bg-surface-raised shadow-tile",
    stale && "opacity-75",
  ]}
  data-flip
  data-output={output.kind}
>
  <!-- mark-line: a well drawing the thing; its glyph stands over its words, not beside them. -->
  <button
    class={[
      "press-tint relative flex aspect-16/10 w-full flex-col overflow-clip bg-surface-recess text-start",
      size === "card" ? "p-space-4" : "p-space-3",
    ]}
    aria-label={`${kindWord}: ${output.title}`}
    onclick={() => onopen?.(output)}
    type="button"
  >
    {#if output.kind === "post" && output.body}
      <span
        class={[
          "line-clamp-4 text-ink-strong text-pretty",
          size === "card" ? "type-body" : "type-meta",
        ]}>{output.body}</span
      >
      <span class="mt-auto type-meta text-ink-muted">
        {#if output.alternates}{words.outputs.alternates(
            output.alternates
          )}{/if}{#if output.mediaPlan}
          · {words.outputs.mediaPlan}{/if}
      </span>
    {:else if output.kind === "markdown" && output.body}
      <span
        class={[
          "line-clamp-5 text-ink-strong text-pretty",
          size === "card" ? "type-body" : "type-meta",
        ]}>{output.body}</span
      >
    {:else if output.kind === "picture"}
      <img
        alt=""
        class="absolute inset-0 size-full object-cover"
        height="1080"
        src={cawFace}
        width="1080"
      />
    {:else if output.kind === "choices"}
      <Glyph aria-hidden="true" class="size-icon-lg text-ink-muted" />
      <span class="mt-auto type-label text-ink-strong tabular-nums"
        >{output.body}</span
      >
    {:else if output.unservable}
      <Glyph aria-hidden="true" class="size-icon-lg text-ink-muted" />
      <span class="mt-auto type-meta text-ink-strong text-pretty">
        {words.outputs.cannotServe}: {output.unservable}
      </span>
    {:else}
      <!-- mark-line: the glyph stands over its figure. -->
      <span class="m-auto grid place-items-center gap-space-1 text-ink-muted">
        <Glyph aria-hidden="true" class="size-icon-lg" />
        {#if output.meta}
          <span class="type-meta tabular-nums">{output.meta}</span>
        {/if}
      </span>
    {/if}
    {#if output.pins}
      <span
        class="absolute end-space-2 top-space-2 rounded-xs bg-surface-raised px-space-2 type-meta text-ink-muted"
        >{words.outputs.pins(output.pins)}</span
      >
    {/if}
  </button>
  <div class="flex min-w-0 flex-col gap-space-row p-space-3">
    <p class="m-0 flex min-w-0 items-baseline gap-space-2">
      <span class="min-w-0 truncate type-label text-ink-row"
        >{output.title}</span
      >
      <!-- An unread fact in ink-strong (DESIGN.md, The Row Dress Rule). -->
      <span
        class={[
          "ms-auto flex-none type-meta",
          output.isNew ? "font-medium text-ink-strong" : "text-ink-muted",
        ]}>{output.isNew ? words.outputs.isNew : kindWord}</span
      >
    </p>
    <button
      class="m-0 min-w-0 truncate text-start type-meta text-ink-muted underline-offset-2 hover:text-ink-strong hover:underline"
      aria-label={`${words.outputs.openTask}: ${output.task}`}
      onclick={() => ontask?.(output.task)}
      type="button"
    >
      {output.task}{#if size === "card"}
        · {output.stage} · {output.when}{/if}
    </button>
  </div>
</li>
