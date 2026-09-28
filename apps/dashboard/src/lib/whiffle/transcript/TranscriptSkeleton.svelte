<!--
  What the transcript looks like before it has arrived.

  Drawn in the transcript's own geometry — the ledger's 25/21 gutters, the
  reader's sunken well bleeding out by its --space-4, the 18px role mark,
  the tool rail's 2px hairline and 26px rows — so the real rows land into
  the same shape and the swap moves nothing. Every block is the kit
  Skeleton; this file only places them.
-->
<script lang="ts">
  import { Skeleton } from "$lib/components/ui/skeleton";

  const PROSE = ["94%", "81%", "88%", "43%"];
  const TOOLS = ["46%", "31%", "58%"];
  const AFTER = ["72%", "35%"];
</script>

<div aria-busy="true" class="skeleton" role="status">
  <span class="spoken">Reading transcript…</span>

  <!-- The reader's turn: the sunken well, its mark, one short line. -->
  <div class="block you">
    <div class="who">
      <Skeleton class="mark" /><Skeleton class="name" />
    </div>
    <Skeleton class="ln" style="width: 52%" />
  </div>

  <!-- The agent's answer: four lines of prose, ragged the way prose is. -->
  <div class="block">
    <div class="who"><Skeleton class="mark" /><Skeleton class="name" /></div>
    {#each PROSE as width (width)}
      <Skeleton class="ln" style="width: {width}" />
    {/each}
  </div>

  <!-- Its tool calls, on the rail. -->
  <div class="block tools">
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
    {#each AFTER as width (width)}
      <Skeleton class="ln" style="width: {width}" />
    {/each}
  </div>
</div>

<style>
  /* Mirrors `.tr` in Transcript.svelte: the same asymmetric gutters, the same
     narrow-breakpoint step-down, so the placeholder columns are the
     transcript's columns. */
  .skeleton {
    position: relative;
    flex: 1 1 auto;
    min-block-size: 0;
    padding-block: 0 var(--space-8);
    padding-inline: var(--space-7) var(--space-6);

    /* The placeholder enters as one thing: DESIGN.md rules out staggered
       page-load fades, so the blocks sit still inside a single fade. */
    @media (prefers-reduced-motion: no-preference) {
      animation: sk-in var(--dur-panel) var(--ease-out) both;
    }
  }
  .block {
    margin-block-start: var(--space-4);
  }
  @keyframes sk-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  /* The reader's well, exactly as MessageRow draws it: bleeding back out by
     its own padding so the words sit on the ledger column. */
  .block.you {
    margin-inline: calc(var(--space-4) * -1);
    padding: var(--space-3) var(--space-4);
    background: var(--surface-recess);
    border-radius: var(--radius-sm);
  }
  @media (width <= 900px) {
    .skeleton {
      padding-inline: var(--space-5);
    }
    .block.you {
      margin-inline: calc(var(--space-3) * -1);
      padding-inline: var(--space-3);
    }
  }

  /* Who: the 18px mark at --radius-xs and the speaker's name at its step,
     spaced as Who.svelte spaces them. */
  .who {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    block-size: 18px;
    margin-block-end: var(--space-2);
  }
  .who :global(.mark) {
    inline-size: 18px;
    block-size: 18px;
    flex: 0 0 auto;
    border-radius: var(--radius-xs);
  }
  .who :global(.name) {
    inline-size: 64px;
    block-size: 12px;
    border-radius: var(--radius-xs);
  }

  /* A line of body copy: --text-body at --leading-body is a 21px line box, so
     an 11px bar with 5px above and below keeps the prose pitch exactly. */
  .block > :global(.ln) {
    block-size: 11px;
    margin-block: 5px;
    border-radius: var(--radius-xs);
  }

  /* The tool rail, as ToolGroup draws it: the rail's indent and hairline,
     26px rows, a 16px glyph, the verb, then the mono argument. */
  .block.tools {
    margin-inline-start: var(--space-2);
    padding-inline-start: var(--space-3);
    background: var(--rail) left top / 2px 100% no-repeat;
  }
  .trow {
    min-block-size: 26px;
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .trow :global(.ic) {
    inline-size: 16px;
    block-size: 16px;
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
