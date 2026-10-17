<!--
  What the transcript looks like before it has arrived.

  Drawn in the transcript's own geometry, so the real rows land into the same
  shape and the hand-over moves nothing: the ledger's 25/21 gutters, rows 14px
  apart, the speaker line at the label's line box with the 18px mark, prose on
  the body's line pitch inside its 74ch measure with 11px between paragraphs,
  the reader's sunken well, and tool calls as 26px rows on the rail with no gap
  between them. Like the transcript it stands on its bottom edge, the foot
  clearing the composer by the same reserve, so its last row is where the
  transcript's last row will be. Every block is the kit Skeleton; this file
  only places them.
-->
<script lang="ts">
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";

  const ANSWER = [["94%", "81%", "88%"], ["43%"]];
  const TOOLS = ["46%", "31%", "58%"];
  const AFTER = ["72%", "35%"];
</script>

<!-- Mirrors the transcript's list in Transcript.svelte: the same asymmetric
     gutters and narrow-breakpoint step-down, and the same foot reserve, so
     the placeholder's columns and its bottom edge are the transcript's. -->
<div
  data-slot="tx-columns"
  data-skeleton
  aria-busy="true"
  style:--sk-foot="max(calc(var(--space-8) * 3), var(--composer-clearance, 0px))"
  class="relative flex flex-col justify-end flex-auto min-h-0 overflow-hidden pb-(--sk-foot) ps-space-7 pe-space-6 max-desk:ps-space-5 max-desk:pe-space-5 tx-columns"
  role="status"
>
  <!-- Read, never seen: off-screen rather than `display: none`, which
       assistive tech skips entirely. -->
  <span class="sr-only border-none border-current">Reading transcript…</span>

  <!-- The reader's turn: its mark on the pane, one short line in the well,
       exactly as MessageRow draws a run of one: under the header, its start
       edge on the reader's mark, the words inside at its padding. Who: the
       18px mark at --radius-xs and the speaker's name, on the line box
       Who.svelte's label sets. A paragraph as MessageBody sets it: --text-body
       at --leading-body in a 74ch measure, each bar centred in one line box,
       so the pitch is the prose's pitch. -->
  <!-- literal: 64px, 74ch, 0.75em -->
  <div data-you data-slot="block" class="mt-space-4">
    <div
      data-slot="who"
      style:--who-h="max(var(--space-5), 1lh)"
      class="flex items-center gap-space-2 text-size-label h-(--who-h) mb-space-2"
    >
      <Skeleton
        data-transcript-skeleton-mark
        class="size-space-5 flex-none rounded-xs"
      /><Skeleton
        data-transcript-skeleton-name
        class="w-(--name-w) h-icon-sm rounded-xs"
        style="--name-w: 64px"
      />
    </div>
    <div
      data-slot="well"
      style:--well-pad-x="calc(var(--pad) - 1px)"
      class="ms-(--well-x) py-space-2 px-(--well-pad-x) border border-well-edge rounded-well-r bg-surface-recess-deep"
    >
      <div
        style:--measure="74ch"
        style:--ln-h="0.75em"
        style:--ln-my="calc((1lh - 0.75em) / 2)"
        class="prose max-w-(--measure) text-size-body leading-body [.prose+&]:mt-space-3"
      >
        <Skeleton
          class="w-(--ln-w) h-(--ln-h) my-(--ln-my) rounded-xs"
          style="--ln-w: 52%"
        />
      </div>
    </div>
  </div>

  <!-- The agent's answer: two paragraphs, ragged the way prose is. -->
  <!-- literal: 64px, 74ch, 0.75em -->
  <div data-slot="block" class="mt-space-4">
    <div
      data-slot="who"
      style:--who-h="max(var(--space-5), 1lh)"
      class="flex items-center gap-space-2 text-size-label h-(--who-h) mb-space-2"
    >
      <Skeleton
        data-transcript-skeleton-mark
        class="size-space-5 flex-none rounded-xs"
      /><Skeleton
        data-transcript-skeleton-name
        class="w-(--name-w) h-icon-sm rounded-xs"
        style="--name-w: 64px"
      />
    </div>
    {#each ANSWER as lines, i (i)}
      <div
        style:--measure="74ch"
        style:--ln-h="0.75em"
        style:--ln-my="calc((1lh - 0.75em) / 2)"
        class="prose max-w-(--measure) text-size-body leading-body [.prose+&]:mt-space-3"
      >
        {#each lines as width (width)}
          <Skeleton
            class="w-(--ln-w) h-(--ln-h) my-(--ln-my) rounded-xs"
            style="--ln-w: {width}"
          />
        {/each}
      </div>
    {/each}
  </div>

  <!-- Its tool calls, one row each, on the rail, as ToolGroup draws it
       (app.css `.rail-row`): 26px rows, the glyph in the rail cell, the
       verb, then the mono argument. -->
  <!-- literal: 26px, 40px -->
  <div data-slot="tools" data-transcript-skeleton-rail-row class="rail-row">
    {#each TOOLS as width (width)}
      <div style:--trow-h="26px" class="min-h-(--trow-h) rail-line">
        <Skeleton data-rail-cell class="rounded-xs rail-cell" /><Skeleton
          class="w-(--tk-w) h-space-3 flex-none rounded-xs"
          data-box
          style="--tk-w: 40px"
        />
        <Skeleton
          class="w-(--arg-w) h-space-3 rounded-xs"
          data-box
          style="--arg-w: {width}"
        />
      </div>
    {/each}
  </div>

  <!-- And what it said about them. -->
  <!-- literal: 64px, 74ch, 0.75em -->
  <div data-slot="block" class="mt-space-4">
    <div
      data-slot="who"
      style:--who-h="max(var(--space-5), 1lh)"
      class="flex items-center gap-space-2 text-size-label h-(--who-h) mb-space-2"
    >
      <Skeleton
        data-transcript-skeleton-mark
        class="size-space-5 flex-none rounded-xs"
      /><Skeleton
        data-transcript-skeleton-name
        class="w-(--name-w) h-icon-sm rounded-xs"
        style="--name-w: 64px"
      />
    </div>
    <div
      style:--measure="74ch"
      style:--ln-h="0.75em"
      style:--ln-my="calc((1lh - 0.75em) / 2)"
      class="prose max-w-(--measure) text-size-body leading-body [.prose+&]:mt-space-3"
    >
      {#each AFTER as width (width)}
        <Skeleton
          class="w-(--ln-w) h-(--ln-h) my-(--ln-my) rounded-xs"
          style="--ln-w: {width}"
        />
      {/each}
    </div>
  </div>
</div>

<style>
  /* residual: unmapped: the reader's well pads by the turn's --pad, which
     steps down at the narrow breakpoint (a custom property under a media
     query has no utility). */
  [data-you] {
    --pad: var(--space-3);

    @media (width <= 900px) {
      --pad: var(--space-2);
    }
  }
</style>
