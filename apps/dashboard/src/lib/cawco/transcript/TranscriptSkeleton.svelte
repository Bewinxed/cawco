<!--
  What the transcript looks like before it has arrived, standing in the
  transcript's own box (`.tr`'s padding and its foot's reserve) so its bars
  fall where the lines will.

  Where this conversation's transcript was drawn before in this tab and kept
  as the page went (kept-view.ts, Transcript `keepShown`), and the box is the
  size it was kept at, each kept run of words is a bar where it stood and each
  mark is a tile where it stood: the reload lands on the place it was kept
  at, so the lines land on their bars.

  Where nothing was kept, the transcript's own recipe lays the bars out: the
  turn's gap, the speaker's line on the mark (the transcript's mark-line, its
  tile at --row-mark-box), the reader's words at the well's inset, the prose
  at --text-body on --leading-body with --space-3 between paragraphs, and the
  tool calls as rail lines --tx-line tall on the rail. Every bar is one em of
  the type it stands for, from the top of that type's words in its line (the
  `text-top` of its line), so its pitch is the lines' pitch and its top is
  where a line's words begin. Every piece is the kit Skeleton, the rail
  included, so inside the grace nothing but the transcript's surface shows
  (The Real Wait Rule); this file only places them.
-->
<script lang="ts">
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import { type KeptView, keptView } from "./kept-view";

  let {
    session,
  }: {
    /** The conversation it stands in for: its kept view, if this tab kept one. */
    session?: string;
  } = $props();

  const ANSWER = [["94%", "81%", "88%"], ["43%"]];
  const TOOLS = ["46%", "31%", "58%"];
  const AFTER = ["72%", "35%"];

  /** Read after the first render: the server has no storage, and the first render must be its. */
  let kept = $state<KeptView | null>(null);
  $effect(() => {
    kept = session ? keptView(session) : null;
  });
  let width = $state(0);
  let height = $state(0);
  /** The kept view, in a box the size it was kept at. */
  const view = $derived(
    kept &&
      Math.abs(kept.width - width) < 1 &&
      Math.abs(kept.height - height) < 1
      ? kept
      : null
  );
  const at = ([x, y, w, h]: [number, number, number, number]) =>
    `inset-inline-start: ${x}px; inset-block-start: ${y}px; inline-size: ${w}px; block-size: ${h}px`;
</script>

<div
  data-slot="tx-columns"
  data-skeleton
  data-kept={view ? "" : undefined}
  aria-busy="true"
  class="skeleton tx-columns"
  role="status"
  bind:clientHeight={height}
  bind:clientWidth={width}
>
  <span class="spoken">Reading transcript…</span>

  {#if view}
    {#each view.marks as mark, i (i)}
      <Skeleton
        data-transcript-skeleton-mark
        class="kept"
        data-box
        style={at(mark)}
      />
    {/each}
    {#each view.lines as line, i (i)}
      <Skeleton
        data-transcript-skeleton-line
        class="kept line"
        data-box
        style={at(line)}
      />
    {/each}
  {:else}
    <!-- The reader's turn: their mark on the pane, one line in the well. -->
    <div data-slot="turn" class="turn you">
      <div data-slot="who" class="who mark-line">
        <Skeleton data-transcript-skeleton-mark class="dot u" data-box />
        <span class="role"
          ><Skeleton
            data-transcript-skeleton-line
            class="bar"
            data-box
            style="inline-size: 3ch"
          /></span
        >
      </div>
      <div data-slot="well" class="well">
        <div class="msg">
          <p class="ln">
            <Skeleton
              data-transcript-skeleton-line
              class="bar"
              data-box
              style="inline-size: 52%"
            />
          </p>
        </div>
      </div>
    </div>

    <!-- The agent's answer: two paragraphs, ragged the way prose is. -->
    <div data-slot="turn" class="turn">
      <div data-slot="who" class="who mark-line">
        <Skeleton data-transcript-skeleton-mark class="dot" data-box />
        <span class="role"
          ><Skeleton
            data-transcript-skeleton-line
            class="bar"
            data-box
            style="inline-size: 9ch"
          /></span
        >
      </div>
      <div class="msg">
        {#each ANSWER as lines, i (i)}
          <p>
            {#each lines as share (share)}
              <span class="ln"
                ><Skeleton
                  data-transcript-skeleton-line
                  class="bar"
                  data-box
                  style="inline-size: {share}"
                /></span
              >
            {/each}
          </p>
        {/each}
      </div>
    </div>

    <!-- Its tool calls, one rail line each, on the rail. -->
    <div data-slot="tools" data-transcript-skeleton-rail-row class="rail-row">
      <Skeleton class="rail" data-box />
      {#each TOOLS as share (share)}
        <div class="trow rail-line">
          <Skeleton data-rail-cell class="rail-cell" />
          <span class="tk"
            ><Skeleton
              data-transcript-skeleton-line
              class="bar"
              data-box
              style="inline-size: 4ch"
            /></span
          >
          <span class="arg"
            ><Skeleton
              data-transcript-skeleton-line
              class="bar"
              data-box
              style="inline-size: {share}"
            /></span
          >
        </div>
      {/each}
    </div>

    <!-- And what it said about them. -->
    <div data-slot="turn" class="turn">
      <div data-slot="who" class="who mark-line">
        <Skeleton data-transcript-skeleton-mark class="dot" data-box />
        <span class="role"
          ><Skeleton
            data-transcript-skeleton-line
            class="bar"
            data-box
            style="inline-size: 9ch"
          /></span
        >
      </div>
      <div class="msg">
        <p>
          {#each AFTER as share (share)}
            <span class="ln"
              ><Skeleton
                data-transcript-skeleton-line
                class="bar"
                data-box
                style="inline-size: {share}"
              /></span
            >
          {/each}
        </p>
      </div>
    </div>
  {/if}
</div>

<style>
  /* Mirrors `.tr` in Transcript.svelte: the same asymmetric gutters and
     narrow-breakpoint step-down, and its foot's reserve (`--foot-room`), so
     the skeleton's columns and its bottom edge are the transcript's. Like
     the transcript it stands on its bottom edge. */
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
    padding-inline: var(--space-7) var(--space-6);

    @media (width < 900px) {
      padding-inline: var(--space-5);
    }
  }

  /* A kept view: each box where its line or mark stood, from the
     transcript's own box. A line's bar is one em of its type. */
  .skeleton > :global(.kept) {
    position: absolute;
    border-radius: var(--radius-xs);
  }

  /* A turn, as Turn draws it: its gap above, and the reader's well's inset
     (--pad) at the seam's. */
  .turn {
    margin-block-start: var(--space-4);
  }
  .turn.you {
    --pad: var(--seam-inset);
  }

  /* The speaker's line, as Who draws it: the mark, then the name on the
     mark's middle (app.css `.mark-line`). */
  .who {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-label);
    font-weight: var(--weight-strong);
    margin-block-end: var(--space-2);
  }
  .who > :global(.dot) {
    inline-size: var(--row-mark-box);
    block-size: var(--row-mark-box);
    flex: 0 0 auto;
    border-radius: var(--radius-xs);
  }
  .who > :global(.dot.u) {
    inline-size: var(--row-mark);
    block-size: var(--row-mark);
    margin-inline: var(--well-x);
    border-radius: var(--row-mark-r);
  }
  .role {
    font-size: var(--text-label);
  }

  /* The reader's well's box, as Well draws it, without its surface: the
     surface is the read's to bring, and inside the grace nothing but the
     transcript's own surface shows. */
  .well {
    margin-inline-start: var(--well-x);
    padding-block: calc(var(--space-2) + 1px);
    padding-inline: var(--pad);

    & .msg {
      max-inline-size: none;
    }
  }

  /* The words, as MessageBody sets them: --text-body on --leading-body in a
     74ch measure, --space-3 between paragraphs. One line box each. */
  .msg {
    font-size: var(--text-body);
    line-height: var(--leading-body);
    max-inline-size: 74ch;

    & p {
      margin: 0;
    }
    & p + p {
      margin-block-start: var(--space-3);
    }
  }
  .ln {
    display: block;
  }

  /* A bar is one em of the type it stands for, set at the top of that
     type's words in its line (`text-top`), inside its line box, so the
     line's height is the type's own and the bar's top is where the words'
     begins. */
  :is(.role, .ln, .tk, .arg) > :global(.bar) {
    display: inline-block;
    vertical-align: text-top;
    block-size: 1em;
    border-radius: var(--radius-xs);
  }

  /* The tool rail, as ToolGroup draws it (app.css `.rail-row`): rail lines
     --tx-line tall, the glyph in the rail cell, the verb, then the mono
     argument. The rail is a bar itself, where the rail's 2px stands. */
  .rail-row {
    position: relative;
    background: none;

    & > :global(.rail) {
      position: absolute;
      inset-block: 0;
      inset-inline-start: 0;
      inline-size: 2px;
      border-radius: 0;
    }
  }
  .trow {
    min-block-size: var(--tx-line);
    font-size: var(--text-label);
    font-weight: var(--weight-strong);

    @media (pointer: coarse) {
      min-block-size: var(--tx-line-touch);
    }

    & :global(.rail-cell) {
      border-radius: var(--radius-xs);
    }
  }
  .tk {
    flex: 0 0 auto;
  }
  .arg {
    flex: 1 1 auto;
    min-inline-size: 0;
    font-family: var(--font-mono);
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
