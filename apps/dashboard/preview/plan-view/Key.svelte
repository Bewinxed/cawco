<script lang="ts">
  /**
   * The page's key: each mark and line a plan can carry, drawn by the same
   * pieces and the same delegates' tiles the frames draw, each beside what
   * it says. One grid: the mark in a fixed start column, its words beside
   * it, every row one height.
   */
  import SessionMark from "#lib/cawco/SessionMark.svelte";
  import TaskRing from "#lib/cawco/TaskRing.svelte";
  import TreeCount from "#lib/cawco/TreeCount.svelte";
  import { IconChevronRight, IconExternal, IconMaximize } from "#lib/icons.js";
  import { FABLE, READER, STRIPE } from "./fixtures";
  import StepMark from "./StepMark.svelte";
</script>

<section aria-labelledby="key-head" class="key" data-slot="key">
  <h2 id="key-head">What the marks say</h2>
  <dl>
    <div class="item">
      <dt><span class="cell"><TaskRing done={1} total={5} /></span></dt>
      <dd>How far the plan has got</dd>
    </div>
    <div class="item">
      <dt><span class="cell"><StepMark state="todo" /></span></dt>
      <dd>To do; on a task, press it to tick</dd>
    </div>
    <div class="item">
      <dt><span class="cell"><StepMark state="doing" /></span></dt>
      <dd>Under way, its time counting</dd>
    </div>
    <div class="item">
      <dt><span class="cell"><StepMark state="done" /></span></dt>
      <dd>Done</dd>
    </div>
    <div class="item">
      <dt>
        <span class="cell"
          ><SessionMark
            id={STRIPE.id}
            place={STRIPE.place}
            status="live"
          /></span
        >
      </dt>
      <dd>A delegate's step, working</dd>
    </div>
    <div class="item">
      <dt>
        <span class="cell"
          ><SessionMark id={FABLE.id} place={FABLE.place} status="attn" /></span
        >
      </dt>
      <dd>A delegate waiting on you</dd>
    </div>
    <div class="item">
      <dt>
        <span class="cell"
          ><SessionMark
            id={READER.id}
            place={READER.place}
            status="fail"
          /></span
        >
      </dt>
      <dd>A delegate that failed</dd>
    </div>
    <div class="item">
      <dt>
        <span class="chev" aria-hidden="true"><IconChevronRight /></span
        ><TreeCount
          count={3}
          noun="step"
          ontoggle={() => undefined}
          open={false}
        />
      </dt>
      <dd>What a delegate's step folds open</dd>
    </div>
    <div class="item">
      <dt class="sample link">
        Open session <IconExternal aria-hidden="true" />
      </dt>
      <dd>Into the delegate's own session</dd>
    </div>
    <div class="item">
      <dt class="sample"><span class="link">→ Task</span>&nbsp;· Review</dt>
      <dd>A to-do that became a task</dd>
    </div>
    <div class="item">
      <dt class="sample">Proposed · Agree</dt>
      <dd>A to-do the session offered</dd>
    </div>
    <div class="item">
      <dt class="sample glyph"><IconMaximize aria-hidden="true" /></dt>
      <dd>Expand: the plan takes the whole split</dd>
    </div>
    <div class="item">
      <dt class="sample link">Open in canvas</dt>
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
  /* Columns as wide as fit, each row one height; the mark's column is one
     width in every row, so the words start on one x down a column. */
  dl {
    --mark-col: 104px;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr));
    gap: var(--space-1) var(--space-5);
    margin: 0;
  }
  .item {
    display: grid;
    grid-template-columns: var(--mark-col) minmax(0, 1fr);
    align-items: center;
    column-gap: var(--space-3);
    min-block-size: 28px;
    min-inline-size: 0;
  }
  dt {
    display: flex;
    align-items: center;
    justify-content: start;
    gap: 2px;
    min-inline-size: 0;
    color: var(--ink-muted);
    white-space: nowrap;
  }
  /* Every mark centred in one 18px cell, so a dot, a tick and a tile stand
     on one axis. */
  .cell {
    display: grid;
    place-items: center;
    inline-size: var(--mark-size, 18px);
    block-size: var(--mark-size, 18px);
  }
  .chev {
    display: grid;
    place-items: center;
    color: var(--ink-muted);

    & :global(svg) {
      inline-size: 12px;
      block-size: 12px;
    }
  }
  .sample {
    gap: var(--space-1);
    font: var(--type-meta);

    &.link,
    & .link {
      color: var(--link-ink);
    }
    & :global(svg) {
      inline-size: 12px;
      block-size: 12px;
    }
    &.glyph :global(svg) {
      inline-size: var(--icon-md);
      block-size: var(--icon-md);
    }
  }
  dd {
    margin: 0;
    min-inline-size: 0;
    font: var(--type-meta);
    color: var(--ink-muted);
    overflow-wrap: anywhere;
  }
</style>
