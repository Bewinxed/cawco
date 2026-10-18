<script lang="ts">
  /**
   * The page's key: each mark a plan row can carry, drawn by the same pieces
   * the frames draw, with what it says.
   */
  import SessionMark from "#lib/cawco/SessionMark.svelte";
  import TaskRing from "#lib/cawco/TaskRing.svelte";
  import TreeCount from "#lib/cawco/TreeCount.svelte";
  import { IconChevronRight } from "#lib/icons.js";
  import StepMark from "./StepMark.svelte";
</script>

<section aria-labelledby="key-head" class="key" data-slot="key">
  <h2 id="key-head">What the marks say</h2>
  <dl>
    <div class="item">
      <dt><span class="cell"><TaskRing done={2} total={5} /></span></dt>
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
          ><SessionMark id="key-live" place="/srv/key" status="live" /></span
        >
      </dt>
      <dd>
        A step a delegate carries: its own mark, working (it echoes, then a
        still blue dot)
      </dd>
    </div>
    <div class="item">
      <dt>
        <span class="cell"
          ><SessionMark id="key-attn" place="/srv/key-2" status="attn" /></span
        >
      </dt>
      <dd>The yellow dot on its corner: it waits on you</dd>
    </div>
    <div class="item">
      <dt>
        <span class="cell"
          ><SessionMark id="key-fail" place="/srv/key-3" status="fail" /></span
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
        report, and the way into its session
      </dd>
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
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr));
    gap: var(--space-2) var(--space-5);
    margin: 0;
  }
  .item {
    display: flex;
    align-items: start;
    gap: var(--space-3);
    min-inline-size: 0;
  }
  dt {
    flex: none;
    display: flex;
    justify-content: center;
    inline-size: 44px;
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
  dd {
    margin: 0;
    min-inline-size: 0;
    font: var(--type-meta);
    color: var(--ink-muted);
    text-wrap: pretty;
  }
</style>
