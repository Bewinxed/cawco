<script lang="ts">
  /**
   * The page's key: each mark and line a plan can carry, drawn by the same
   * pieces and the same delegates' tiles the frames draw, each beside what
   * it says. One grid, three columns in every row: an 18px cell a mark
   * stands centred in, a column for a sample wider than a mark, then the
   * words, so the words start on one x down a column and every row is one
   * height.
   */
  import SessionMark from "#lib/cawco/SessionMark.svelte";
  import TaskRing from "#lib/cawco/TaskRing.svelte";
  import TreeCount from "#lib/cawco/TreeCount.svelte";
  import { IconChevronRight, IconExternal, IconMaximize } from "#lib/icons.js";
  import { FABLE, IPHONE, READER, STRIPE } from "./fixtures";
  import StepMark from "./StepMark.svelte";
</script>

<section aria-labelledby="key-head" class="key" data-slot="key">
  <h2 id="key-head">What the marks say</h2>
  <dl>
    <div class="item">
      <dt>
        <span class="cell" data-slot="key-cell"
          ><TaskRing done={1} total={5} /></span
        ><span class="sample"></span>
      </dt>
      <dd>How far the plan has got</dd>
    </div>
    <div class="item">
      <dt>
        <span class="cell" data-slot="key-cell"><StepMark state="todo" /></span
        ><span class="sample"></span>
      </dt>
      <dd>To do; on a task, press it to tick</dd>
    </div>
    <div class="item">
      <dt>
        <span class="cell" data-slot="key-cell"><StepMark state="doing" /></span
        ><span class="sample"></span>
      </dt>
      <dd>Under way, its time counting</dd>
    </div>
    <div class="item">
      <dt>
        <span class="cell" data-slot="key-cell"><StepMark state="done" /></span
        ><span class="sample"></span>
      </dt>
      <dd>Done</dd>
    </div>
    <div class="item">
      <dt>
        <span class="cell" data-slot="key-cell"
          ><SessionMark
            id={STRIPE.id}
            place={STRIPE.place}
            status="live"
          /></span
        ><span class="sample"></span>
      </dt>
      <dd>A delegate's step, working</dd>
    </div>
    <div class="item">
      <dt>
        <span class="cell" data-slot="key-cell"
          ><SessionMark id={FABLE.id} place={FABLE.place} status="attn" /></span
        ><span class="sample"></span>
      </dt>
      <dd>A delegate waiting on you</dd>
    </div>
    <div class="item">
      <dt>
        <span class="cell" data-slot="key-cell"
          ><SessionMark
            id={IPHONE.id}
            place={IPHONE.place}
            status="idle"
          /></span
        ><span class="sample"></span>
      </dt>
      <dd>A delegate queued, no dot until it starts</dd>
    </div>
    <div class="item">
      <dt>
        <span class="cell" data-slot="key-cell"
          ><SessionMark
            id={READER.id}
            place={READER.place}
            status="fail"
          /></span
        ><span class="sample"></span>
      </dt>
      <dd>A delegate that failed</dd>
    </div>
    <div class="item">
      <dt>
        <span class="cell" data-slot="key-cell"
          ><IconMaximize aria-hidden="true" class="key-glyph" /></span
        ><span class="sample"></span>
      </dt>
      <dd>Expand: the plan takes the whole split</dd>
    </div>
    <div class="item">
      <dt>
        <span class="cell"></span><span class="sample" data-slot="key-sample"
          ><span class="chev" aria-hidden="true"><IconChevronRight /></span
          ><TreeCount
            count={3}
            noun="step"
            ontoggle={() => undefined}
            open={false}
          /></span
        >
      </dt>
      <dd>What a delegate's step folds open</dd>
    </div>
    <div class="item">
      <dt>
        <span class="cell"></span><span
          class="sample link"
          data-slot="key-sample"
          >Open session <IconExternal aria-hidden="true" /></span
        >
      </dt>
      <dd>Into the delegate's own session</dd>
    </div>
    <div class="item">
      <dt>
        <span class="cell"></span><span class="sample" data-slot="key-sample"
          ><span class="link">→ Task</span>&nbsp;· Review</span
        >
      </dt>
      <dd>A to-do that became a task</dd>
    </div>
    <div class="item">
      <dt>
        <span class="cell"></span><span class="sample" data-slot="key-sample"
          >Proposed · Agree</span
        >
      </dt>
      <dd>A to-do the session offered</dd>
    </div>
    <div class="item">
      <dt>
        <span class="cell"></span><span
          class="sample link"
          data-slot="key-sample">Open in canvas</span
        >
      </dt>
      <dd>The task on the project's canvas</dd>
    </div>
  </dl>
</section>

<style>
  .key {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);

    & h2 {
      margin: 0;
      font: var(--type-label);
      color: var(--ink-strong);
    }
  }
  /* As many columns as fit, each row one height. */
  dl {
    --sample-w: 104px;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr));
    gap: var(--space-1) var(--space-5);
    margin: 0;
  }
  .item {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    column-gap: var(--space-3);
    min-block-size: 28px;
    min-inline-size: 0;
  }
  /* The mark's cell, then the sample's column: one width each in every
     row, so a sample never pushes a mark off its cell's centre. */
  dt {
    display: grid;
    grid-template-columns: var(--mark-size, 18px) var(--sample-w);
    align-items: center;
    column-gap: var(--space-2);
    color: var(--ink-muted);
  }
  .cell {
    display: grid;
    place-items: center;
    inline-size: var(--mark-size, 18px);
    block-size: var(--mark-size, 18px);

    & :global(.key-glyph) {
      inline-size: var(--icon-md);
      block-size: var(--icon-md);
    }
  }
  .sample {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    min-inline-size: 0;
    font: var(--type-meta);
    white-space: nowrap;

    &.link,
    & .link {
      color: var(--link-ink);
    }
    & :global(svg) {
      inline-size: 12px;
      block-size: 12px;
    }
  }
  .chev {
    display: grid;
    place-items: center;
    color: var(--ink-muted);
  }
  dd {
    margin: 0;
    min-inline-size: 0;
    font: var(--type-meta);
    color: var(--ink-muted);
    overflow-wrap: anywhere;
  }
</style>
