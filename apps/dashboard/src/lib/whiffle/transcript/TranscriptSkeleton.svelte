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
  import { Skeleton } from "$lib/components/ui/skeleton";

  const ANSWER = [["94%", "81%", "88%"], ["43%"]];
  const TOOLS = ["46%", "31%", "58%"];
  const AFTER = ["72%", "35%"];
</script>

<div aria-busy="true" class="skeleton" role="status">
  <span class="spoken">Reading transcript…</span>

  <!-- The reader's turn: its mark on the pane, one short line in the well. -->
  <div class="block you">
    <div class="who">
      <Skeleton class="mark" /><Skeleton class="name" />
    </div>
    <div class="well">
      <div class="prose"><Skeleton class="ln" style="width: 52%" /></div>
    </div>
  </div>

  <!-- The agent's answer: two paragraphs, ragged the way prose is. -->
  <div class="block">
    <div class="who"><Skeleton class="mark" /><Skeleton class="name" /></div>
    {#each ANSWER as lines, i (i)}
      <div class="prose">
        {#each lines as width (width)}
          <Skeleton class="ln" style="width: {width}" />
        {/each}
      </div>
    {/each}
  </div>

  <!-- Its tool calls, one row each, on the rail. -->
  <div class="tools">
    {#each TOOLS as width (width)}
      <div class="trow">
        <Skeleton class="ic" /><Skeleton class="tk" />
        <Skeleton class="arg" style="width: {width}" />
      </div>
    {/each}
  </div>

  <!-- And what it said about them. -->
  <div class="block">
    <div class="who"><Skeleton class="mark" /><Skeleton class="name" /></div>
    <div class="prose">
      {#each AFTER as width (width)}
        <Skeleton class="ln" style="width: {width}" />
      {/each}
    </div>
  </div>
</div>

<style>
  /* Mirrors `.tr` in Transcript.svelte: the same asymmetric gutters and
     narrow-breakpoint step-down, and the same foot reserve, so the
     placeholder's columns and its bottom edge are the transcript's. */
  .skeleton {
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    flex: 1 1 auto;
    min-block-size: 0;
    overflow: hidden;
    padding-block: 0
      max(calc(var(--space-8) * 3), var(--composer-clearance, 0px));
    padding-inline: var(--line-a) var(--space-6);

    @media (width <= 900px) {
      padding-inline-end: var(--space-5);
    }
  }
  /* A turn's words on line B, as MessageRow sets them. */
  .block {
    margin-block-start: var(--space-4);
    padding-inline-start: var(--line-ab);
  }

  /* The reader's well, exactly as MessageRow draws a run of one: under the
     header, from line A with the words on line B, past their end by
     --well-pad. */
  .well {
    --edge: 1px;
    margin-inline: calc(var(--line-ab) * -1) calc(var(--well-pad) * -1);
    padding-block: var(--space-2);
    padding-inline: calc(var(--line-ab) - var(--edge))
      calc(var(--well-pad) - var(--edge));
    border: var(--edge) solid var(--well-edge);
    border-radius: var(--well-r);
    background: var(--surface-recess-deep);
  }

  /* Who: the mark on line A, filling the mark track, and the speaker's name
     on line B, on the line box Who.svelte's label sets. */
  .who {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-label);
    block-size: max(var(--col-mark), 1lh);
    margin-block-end: var(--space-2);
    margin-inline-start: calc(var(--line-ab) * -1);
  }
  .who :global(.mark) {
    inline-size: var(--col-mark);
    block-size: var(--col-mark);
    flex: 0 0 auto;
    border-radius: var(--radius-xs);
  }
  .who :global(.name) {
    inline-size: 64px;
    block-size: 12px;
    border-radius: var(--radius-xs);
  }
  /* The reader's 17px row mark, on line A, the track's spare pixel after it. */
  .block.you .who :global(.mark) {
    inline-size: var(--row-mark);
    block-size: var(--row-mark);
    margin-inline-end: calc(var(--col-mark) - var(--row-mark));
    border-radius: var(--row-mark-r);
  }

  /* A paragraph as MessageBody sets it: --text-body at --leading-body in a
     74ch measure. Each bar is centred in one line box, so the pitch is the
     prose's pitch. */
  .prose {
    max-inline-size: 74ch;
    font-size: var(--text-body);
    line-height: var(--leading-body);
  }
  .prose + .prose {
    margin-block-start: var(--space-3);
  }
  .prose > :global(.ln) {
    block-size: 0.75em;
    margin-block: calc((1lh - 0.75em) / 2);
    border-radius: var(--radius-xs);
  }

  /* The tool rail, as ToolGroup draws it: the hairline on line A, 26px
     rows, a 16px glyph centred in the mark track, the verb on line B, then
     the mono argument. */
  .tools {
    --glyph: 16px;
    background: var(--rail) left top / 2px 100% no-repeat;
  }
  .trow {
    min-block-size: 26px;
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .trow :global(.ic) {
    inline-size: var(--glyph);
    block-size: var(--glyph);
    margin-inline: calc((var(--col-mark) - var(--glyph)) / 2);
    flex: 0 0 auto;
    border-radius: var(--radius-xs);
  }
  .trow :global(.tk) {
    inline-size: 40px;
    block-size: 11px;
    flex: 0 0 auto;
    border-radius: var(--radius-xs);
  }
  .trow :global(.arg) {
    block-size: 11px;
    border-radius: var(--radius-xs);
  }

  /* Read, never seen: off-screen rather than `display: none`, which assistive
     tech skips entirely. */
  .spoken {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    margin: -1px;
    padding: 0;
    border: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
