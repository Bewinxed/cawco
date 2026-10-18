<script lang="ts">
  /**
   * The page's key: each mark and line a plan can carry, drawn by the same
   * pieces and the same delegates' tiles the frames draw, with what it says.
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
      <dd>How far the plan has got, beside the title, with its figure</dd>
    </div>
    <div class="item">
      <dt><span class="cell"><StepMark state="todo" /></span></dt>
      <dd>A step to do; on a task, pressing it ticks the to-do</dd>
    </div>
    <div class="item">
      <dt><span class="cell"><StepMark state="doing" /></span></dt>
      <dd>The step under way, breathing while it runs, its time counting</dd>
    </div>
    <div class="item">
      <dt><span class="cell"><StepMark state="done" /></span></dt>
      <dd>Done, the tick drawn as it lands</dd>
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
      <dd>
        A step a delegate carries, under the to-do it carries: its own tile,
        working (it echoes, then a still blue dot)
      </dd>
    </div>
    <div class="item">
      <dt>
        <span class="cell"
          ><SessionMark id={FABLE.id} place={FABLE.place} status="attn" /></span
        >
      </dt>
      <dd>The yellow dot on its corner: it waits on you</dd>
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
      <dd>The red dot: it failed</dd>
    </div>
    <div class="item">
      <dt>
        <span class="fold"
          ><span class="chev" aria-hidden="true"><IconChevronRight /></span
          ><TreeCount
            count={3}
            noun="step"
            ontoggle={() => undefined}
            open={false}
          /></span
        >
      </dt>
      <dd>
        Beside a delegate's step: what it folds open, its own steps or its
        report
      </dd>
    </div>
    <div class="item">
      <dt>
        <span class="sample link glyph-sm"
          >Open its session <IconExternal aria-hidden="true" /></span
        >
      </dt>
      <dd>Under an open delegate's step: the way into its own session</dd>
    </div>
    <div class="item">
      <dt>
        <span class="sample"
          ><span class="link">→ Booking confirmation email</span> · Review</span
        >
      </dt>
      <dd>Under a to-do that grew into a task: that task, and its stage</dd>
    </div>
    <div class="item">
      <dt><span class="sample">Proposed by the session · Agree</span></dt>
      <dd>A to-do the session offered; Agree makes it the task's</dd>
    </div>
    <div class="item">
      <dt>
        <span class="sample glyph"
          ><IconMaximize aria-hidden="true" /> Expand</span
        >
      </dt>
      <dd>In the card's head: the plan takes the whole split</dd>
    </div>
    <div class="item">
      <dt><span class="sample link">Open in canvas</span></dt>
      <dd>At a task's foot: the task on the project's canvas</dd>
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
  dl {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 340px), 1fr));
    gap: var(--space-2) var(--space-5);
    margin: 0;
  }
  .item {
    display: grid;
    grid-template-columns: 172px minmax(0, 1fr);
    align-items: start;
    gap: var(--space-3);
    min-inline-size: 0;
  }
  dt {
    display: flex;
    justify-content: end;
    min-inline-size: 0;
  }
  .cell {
    display: grid;
    place-items: center;
    inline-size: var(--mark-size, 18px);
    block-size: calc(var(--text-meta) * 1.35);
    color: var(--ink-muted);
  }
  .fold {
    display: flex;
    align-items: center;
    gap: 2px;
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
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    font: var(--type-meta);
    color: var(--ink-muted);
    text-align: end;

    &.link,
    & .link {
      color: var(--link-ink);
    }
    &.glyph-sm :global(svg) {
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
    text-wrap: pretty;
  }
</style>
