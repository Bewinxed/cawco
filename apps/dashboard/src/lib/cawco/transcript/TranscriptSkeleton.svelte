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
  style:--sk-line-my="calc((1lh - var(--c-skeleton-x-height)) / 2)"
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
       so the pitch is the prose's pitch. The well pads by the turn's --pad,
       which steps down at the narrow breakpoint (`turn-pad`). -->
  <div data-you data-slot="block" class="mt-space-4 turn-pad">
    <div
      data-slot="who"
      style:--who-h="max(var(--space-5), 1lh)"
      class="flex items-center gap-space-2 text-size-label h-(--who-h) mb-space-2"
    >
      <Skeleton
        data-transcript-skeleton-mark
        cell="mark"
        class="flex-none"
        radius="text"
      /><Skeleton
        data-transcript-skeleton-name
        height="x-height"
        radius="line"
        type="label"
        width="short"
      />
    </div>
    <div
      data-slot="well"
      style:--well-pad-block="calc(var(--space-2) + 1px)"
      class="ms-(--well-x) py-(--well-pad-block) px-(--pad) inset-ring-1 inset-ring-well-edge rounded-well-r bg-surface-recess-deep"
    >
      <div class="flex flex-col max-w-c-measure text-size-body leading-body">
        <Skeleton
          class="my-(--sk-line-my)"
          height="x-height"
          radius="line"
          style="width: 52%"
        />
      </div>
    </div>
  </div>

  <!-- The agent's answer: two paragraphs, ragged the way prose is. -->
  <div data-slot="block" class="mt-space-4">
    <div
      data-slot="who"
      style:--who-h="max(var(--space-5), 1lh)"
      class="flex items-center gap-space-2 text-size-label h-(--who-h) mb-space-2"
    >
      <Skeleton
        data-transcript-skeleton-mark
        cell="mark"
        class="flex-none"
        radius="text"
      /><Skeleton
        data-transcript-skeleton-name
        height="x-height"
        radius="line"
        type="label"
        width="short"
      />
    </div>
    {#each ANSWER as lines, i (i)}
      <div
        class={[
          "flex flex-col max-w-c-measure text-size-body leading-body",
          i > 0 && "mt-space-3",
        ]}
      >
        {#each lines as width (width)}
          <Skeleton
            class="my-(--sk-line-my)"
            height="x-height"
            radius="line"
            style="width: {width}"
          />
        {/each}
      </div>
    {/each}
  </div>

  <!-- Its tool calls, one row each, on the rail, as ToolGroup draws it
       (app.css `.rail-row`): rows at the transcript's line height, the glyph
       in the rail cell, the verb, then the mono argument. -->
  <div data-slot="tools" data-tx-rail class="rail-row">
    {#each TOOLS as width (width)}
      <div class="min-h-(--tx-line) coarse:min-h-(--tx-line-touch) rail-line">
        <Skeleton data-rail-cell radius="text" cell="rail" data-box /><Skeleton
          class="w-space-8 flex-none"
          height="x-height"
          radius="line"
          data-box
        />
        <Skeleton
          height="x-height"
          radius="line"
          data-box
          style="width: {width}"
        />
      </div>
    {/each}
  </div>

  <!-- And what it said about them. -->
  <div data-slot="block" class="mt-space-4">
    <div
      data-slot="who"
      style:--who-h="max(var(--space-5), 1lh)"
      class="flex items-center gap-space-2 text-size-label h-(--who-h) mb-space-2"
    >
      <Skeleton
        data-transcript-skeleton-mark
        cell="mark"
        class="flex-none"
        radius="text"
      /><Skeleton
        data-transcript-skeleton-name
        height="x-height"
        radius="line"
        type="label"
        width="short"
      />
    </div>
    <div class="flex flex-col max-w-c-measure text-size-body leading-body">
      {#each AFTER as width (width)}
        <Skeleton
          class="my-(--sk-line-my)"
          height="x-height"
          radius="line"
          style="width: {width}"
        />
      {/each}
    </div>
  </div>
</div>
