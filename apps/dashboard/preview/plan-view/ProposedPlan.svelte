<script lang="ts">
  /**
   * THE PROPOSAL: the plan's body as the advisor's model draws it, one list
   * of steps where each says its state, who is on it, what it is tied to and
   * what it waits on. The row is RunSteps' recipe (mark at the row's edge,
   * the words, then at the trailing edge the time and the fold's count, each
   * in a column of its own so they line up down the list) on the app's
   * nesting rails (`.kit-nest`, `nestFrom`), arriving and moving on the house
   * reflow. Page-local: nothing in the product draws this yet. It mounts the
   * real pieces it is made of: a carried step's mark is SessionMark (the tree
   * mark with its status dot), its fold is TreeCount, the spec is
   * MessageBody, the time is tickingClock through the run's own `duration`.
   */
  import { SvelteSet } from "svelte/reactivity";
  import MessageBody from "#lib/cawco/MessageBody.svelte";
  import { branch, nestFrom } from "#lib/cawco/motion/branch.svelte.js";
  import { tickingClock } from "#lib/cawco/motion/clock.svelte.js";
  import { reflow } from "#lib/cawco/motion/rows.svelte.js";
  import SessionMark from "#lib/cawco/SessionMark.svelte";
  import TreeCount from "#lib/cawco/TreeCount.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import {
    IconChevronDown,
    IconChevronRight,
    IconExternal,
    IconPlus,
  } from "#lib/icons.js";
  import { clockWords, type PlanFixture, type Step } from "./fixtures";
  import StepMark from "./StepMark.svelte";

  let {
    plan,
    loaded,
  }: {
    plan: PlanFixture;
    /** When the page loaded: every running step's start counts from it. */
    loaded: number;
  } = $props();

  /** Folds the person turned the other way from how the frame froze them. */
  const turned = new SvelteSet<string>();
  const isOpen = (step: Step): boolean =>
    (step.fold?.open ?? false) !== turned.has(step.id);
  const turn = (id: string) => {
    if (turned.has(id)) {
      turned.delete(id);
    } else {
      turned.add(id);
    }
  };

  /** To-dos the person ticked or unticked from the plan. */
  const ticked = new SvelteSet<string>();
  const stateOf = (step: Step): Step["state"] => {
    if (!(step.todo && ticked.has(step.id))) {
      return step.state;
    }
    return step.state === "done" ? "todo" : "done";
  };
  /** Proposed to-dos the person agreed to. */
  const agreed = new SvelteSet<string>();

  let specOpen = $state(false);
  $effect.pre(() => {
    specOpen = plan.spec?.open ?? false;
  });

  const running = (steps: Step[]): boolean =>
    steps.some(
      (step) =>
        step.state === "doing" ||
        step.state === "waiting" ||
        running(step.children ?? [])
    );
  const clock = tickingClock(() => running(plan.steps));

  const timeOf = (step: Step): string | null => {
    const state = stateOf(step);
    if (state === "done" || state === "failed") {
      return step.took ?? null;
    }
    if ((state === "doing" || state === "waiting") && step.startedAgo) {
      return clockWords(clock.now - (loaded - step.startedAgo));
    }
    return null;
  };

  /** The session's own mark for a state: waiting and queued read as under way. */
  const ownMark = (state: Step["state"]): "todo" | "doing" | "done" => {
    if (state === "done") {
      return "done";
    }
    return state === "todo" ? "todo" : "doing";
  };

  /** The mark's place, which the rails hang from. */
  const MARK = ".pv-mark";
  /**
   * What is drawn in it, which each arm ends on: the dot, the tick or the
   * delegate's tile, so no arm stops short of a 6px dot in its 18px cell.
   */
  const DRAWN = ".pv-mark :is(.dot, .step-tick, .tree-mark)";
</script>

{#snippet row(step: Step)}
  {@const state = stateOf(step)}
  {@const time = timeOf(step)}
  {@const open = isOpen(step)}
  <div
    data-slot="plan-row"
    class="row"
    data-state={state}
    data-carried={step.carrier ? "" : undefined}
  >
    <span class="pv-mark" data-box>
      {#if step.carrier}
        <SessionMark
          id={step.carrier.id}
          place={step.carrier.place}
          status={step.carrier.status}
        />
      {:else if step.todo}
        <!-- biome-ignore lint/a11y/useSemanticElements: the to-do's mark is its checkbox, drawn as the plan's three marks, not the kit's box. -->
        <button
          aria-checked={state === "done"}
          aria-label={step.words}
          class="tick-target touch-hit"
          onclick={() => {
            if (ticked.has(step.id)) {
              ticked.delete(step.id);
            } else {
              ticked.add(step.id);
            }
          }}
          role="checkbox"
          type="button"
        >
          <StepMark state={ownMark(state)} />
        </button>
      {:else}
        <StepMark state={ownMark(state)} />
      {/if}
    </span>
    <span data-slot="words" class="words">{step.words}</span>
    <!-- The trailing edge: the time in one fixed track on every row, so
         every time ends on one x and a row's words wrap the same whether it
         is timed or not; a fold's count stands before it, on the rows that
         fold something. -->
    <span class="trail">
      {#if step.fold}
        <span data-slot="fold" class="fold">
          <span class="chev" aria-hidden="true" data-open={open || undefined}
            ><IconChevronRight /></span
          >
          <TreeCount
            count={step.fold.count}
            noun={step.fold.noun}
            ontoggle={() => turn(step.id)}
            {open}
          />
        </span>
      {/if}
      <span data-slot="time" data-num class="num time">{time ?? ""}</span>
    </span>
    {#if step.promoted}
      <span class="under">
        <button class="link touch-hit" type="button">
          <span aria-hidden="true">→</span>
          <span class="link-words">{step.promoted.title}</span>
          <span class="stage">· {step.promoted.stage}</span>
        </button>
      </span>
    {:else if step.proposed && !agreed.has(step.id)}
      <span class="under">
        <span class="tag">Proposed by the session</span>
        <Button
          class="agree"
          onclick={() => agreed.add(step.id)}
          size="xs"
          variant="outline">Agree</Button
        >
      </span>
    {:else if step.wait}
      <span data-slot="wait" class="under wait" data-kind={step.wait.kind}
        >{step.wait.words}</span
      >
    {/if}
  </div>
{/snippet}

{#snippet tree(steps: Step[], nested: boolean)}
  <ul
    class={nested ? "kit-nest rows nested" : "rows"}
    in:branch={{ glyph: MARK }}
    out:branch={{ glyph: MARK }}
    {@attach reflow()}
    {@attach nested ? nestFrom(MARK, DRAWN) : clock.watch}
  >
    {#each steps as step (step.id)}
      {@const shows = step.carrier ? isOpen(step) : true}
      <li data-flip="box">
        {@render row(step)}
        {#if shows && (step.children?.length ?? 0) > 0}
          {@render tree(step.children ?? [], true)}
        {/if}
        {#if step.carrier && isOpen(step) && step.fold?.report}
          <p class="report">{step.fold.report}</p>
        {/if}
        {#if step.carrier && isOpen(step)}
          <button class="open" type="button">
            <span>Open its session</span>
            <IconExternal aria-hidden="true" />
          </button>
        {/if}
      </li>
    {/each}
  </ul>
{/snippet}

<div data-slot="plan" class="plan">
  {@render tree(plan.steps, false)}
  {#if plan.task}
    <div class="foot">
      <button class="add touch-hit" type="button">
        <IconPlus aria-hidden="true" />
        <span>Add a to-do</span>
      </button>
      <Button class="canvas" label="Open in canvas" size="sm" variant="link" />
    </div>
  {/if}
  {#if plan.spec}
    <section class="spec" data-open={specOpen || undefined}>
      <button
        aria-expanded={specOpen}
        class="spec-head touch-hit"
        onclick={() => {
          specOpen = !specOpen;
        }}
        type="button"
      >
        <span class="spec-name">Spec</span>
        <span class="spec-at">· written {plan.spec.ago}</span>
        <IconChevronDown aria-hidden="true" class="spec-chev" />
      </button>
      {#if specOpen}
        <div class="spec-body">
          <MessageBody source={plan.spec.markdown} />
        </div>
      {/if}
    </section>
  {/if}
</div>

<style>
  /* One ring for every control here, on keyboard focus only (DESIGN.md,
     The One Ring Rule); a full-width row takes it inset. */
  :is(.tick-target, .link, .open, .add):focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }
  .spec-head:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: -2px;
    border-radius: var(--radius-xs);
  }
  .plan {
    /* The tile's status dot stands half its size past the tile, so the
       words keep the house gap from the dot, not from the tile. */
    --mark-w: var(--mark-size, 18px);
    --mark-gap: calc(var(--space-2) + var(--status-dot-size) / 2);
    --time-w: 7ch;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-inline-size: 0;
  }
  .rows {
    display: flex;
    flex-direction: column;
    gap: var(--space-row);
    margin: 0;
    padding: 0;
    list-style: none;
    min-inline-size: 0;
  }
  li {
    position: relative;
    min-inline-size: 0;
  }
  /* A sub-step hangs off its parent's mark on the app's nesting line. */
  .rows.nested {
    --nest-gap: var(--space-row);
    padding-inline-start: var(--nest-pad, var(--space-5));
  }

  /* RunSteps' row: the mark at the row's edge, the words, then the time and
     the fold's count, each in a column as wide in every row, so every
     time and every count in the frame ends on one x. What the row is tied
     to or waits on runs under its words. */
  .row {
    display: grid;
    grid-template-columns: var(--mark-w) minmax(0, 1fr) auto;
    grid-template-areas:
      "mark words trail"
      ". under under";
    column-gap: var(--space-2);
    row-gap: 2px;
    align-items: start;
    min-block-size: 28px;
    padding-block: 5px;
    font: var(--type-label);
    color: var(--ink-strong);
  }
  .pv-mark {
    grid-area: mark;
    display: grid;
    place-items: center;
    inline-size: var(--mark-w);
    block-size: max(1lh, var(--mark-w));
  }
  .words {
    grid-area: words;
    min-inline-size: 0;
    padding-inline-start: calc(var(--mark-gap) - var(--space-2));
    overflow-wrap: anywhere;
    text-wrap: pretty;
    font-weight: var(--weight-body);
  }
  .row[data-state="doing"] .words,
  .row[data-state="waiting"] .words {
    font-weight: var(--weight-strong);
  }
  .row[data-state="done"] .words {
    color: var(--ink-muted);
  }
  .row[data-state="failed"] .words {
    color: var(--status-fail-ink);
  }
  .trail {
    grid-area: trail;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    block-size: max(1lh, var(--mark-w));
  }
  .time {
    inline-size: var(--time-w);
    text-align: end;
    color: var(--ink-muted);
    font: var(--type-meta);
    line-height: inherit;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .fold {
    display: flex;
    align-items: center;
    justify-content: end;
    gap: 2px;
    block-size: 1lh;
  }
  .chev {
    display: grid;
    place-items: center;
    color: var(--ink-muted);

    & :global(svg) {
      inline-size: 12px;
      block-size: 12px;
    }
    @media (prefers-reduced-motion: no-preference) {
      transition: rotate var(--dur-control) var(--ease-out);
    }
    &[data-open] {
      rotate: 90deg;
    }
  }

  /* A to-do's mark is its checkbox: the same three drawings, pressed to
     tick or untick it from the plan. */
  .tick-target {
    display: grid;
    place-items: center;
    inline-size: var(--mark-w);
    block-size: var(--mark-w);
    padding: 0;
    border: 0;
    border-radius: var(--radius-xs);
    background: none;
    cursor: pointer;
    transition: background-color var(--dur-control) var(--ease-out);
  }
  @media (hover: hover) and (pointer: fine) {
    .tick-target:hover {
      background: var(--surface-hover);
    }
  }

  /* Under the words: the task a to-do became, the session's proposal, or
     what a step waits on, its colour and words carrying the state. */
  .under {
    grid-area: under;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1) var(--space-2);
    min-inline-size: 0;
    padding-inline-start: calc(var(--mark-gap) - var(--space-2));
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .wait {
    display: block;
    overflow-wrap: anywhere;

    &[data-kind="you"] {
      color: var(--status-attn-ink);
    }
    &[data-kind="fail"] {
      color: var(--status-fail-ink);
    }
  }
  .link {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--space-1);
    min-inline-size: 0;
    padding: 0;
    border: 0;
    border-radius: var(--radius-xs);
    background: none;
    color: var(--link-ink);
    font: inherit;
    text-align: start;
    cursor: pointer;

    & .stage {
      color: var(--ink-muted);
    }
  }
  .link-words {
    overflow-wrap: anywhere;
  }
  @media (hover: hover) and (pointer: fine) {
    .link:hover .link-words {
      text-decoration: underline;
    }
  }
  .under :global(.agree) {
    flex: none;
  }

  /* What a carried step folds open, past its own steps: its report, and the
     way into its session, at its words' column. */
  .report {
    margin: 2px 0 var(--space-1);
    margin-inline-start: calc(var(--mark-w) + var(--mark-gap));
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-xs);
    background: var(--surface-recess);
    color: var(--ink-strong);
    font: var(--type-meta);
  }
  .open,
  .add {
    display: inline-flex;
    align-items: center;
    border: 0;
    background: none;
    cursor: pointer;
    transition: color var(--dur-control) var(--ease-out);
  }
  .open {
    gap: var(--space-1);
    min-block-size: 24px;
    margin-inline-start: calc(var(--mark-w) + var(--mark-gap));
    padding: 0;
    border-radius: var(--radius-xs);
    color: var(--link-ink);
    font: var(--type-meta);

    & :global(svg) {
      inline-size: 12px;
      block-size: 12px;
    }
  }
  .foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);

    & :global(.canvas) {
      padding-inline: 0;
    }
  }
  .add {
    gap: var(--mark-gap);
    min-block-size: 28px;
    padding: 0;
    color: var(--ink-muted);
    font: var(--type-label);
    font-weight: var(--weight-body);

    & :global(svg) {
      inline-size: var(--mark-w);
      block-size: var(--icon-md);
    }
  }
  @media (hover: hover) and (pointer: fine) {
    .add:hover {
      color: var(--ink-strong);
    }
  }

  /* The spec: one folded part after the steps, opening to its words. */
  .spec {
    margin-block-start: var(--space-3);
    padding-block-start: var(--space-2);
    border-block-start: 1px solid var(--border-hairline);
  }
  .spec-head {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    inline-size: 100%;
    min-block-size: 32px;
    padding: 0;
    border: 0;
    background: none;
    color: var(--ink-strong);
    font: var(--type-label);
    text-align: start;
    cursor: pointer;

    & :global(.spec-chev) {
      margin-inline-start: auto;
      inline-size: var(--icon-md);
      block-size: var(--icon-md);
      color: var(--ink-muted);
      transition: rotate var(--dur-control) var(--ease-in-out);
    }
  }
  .spec[data-open] .spec-head :global(.spec-chev) {
    rotate: 180deg;
  }
  .spec-at {
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .spec-body {
    padding-block: var(--space-1) var(--space-3);
  }

  /* A finger's rows: 44px, and the marks' and chips' areas with them. */
  @media (pointer: coarse) {
    .row {
      min-block-size: 44px;
      padding-block: 11px;
    }
    .add,
    .spec-head {
      min-block-size: 44px;
    }
  }
  :global([data-coarse]) .row {
    min-block-size: 44px;
    padding-block: 11px;
  }
  :global([data-coarse]) .add,
  :global([data-coarse]) .spec-head {
    min-block-size: 44px;
  }
</style>
