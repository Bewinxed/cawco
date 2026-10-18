<script lang="ts">
  /**
   * THE PROPOSAL: the plan's body as the advisor's model draws it, one list
   * of steps where each says its state, who is on it, what it is tied to and
   * what it waits on. The row is RunSteps' recipe (mark at the row's edge,
   * words, link chip, then the time and the fold's count at the trailing
   * edge) on the app's nesting rails (`.kit-nest`, `nestFrom`), arriving and
   * moving on the house reflow. Page-local: nothing in the product draws
   * this yet. It mounts the real pieces it is made of: a carried step's mark
   * is SessionMark (the tree mark with its status dot), its fold is
   * TreeCount, Caw's needs-you face is CawFace, the spec is MessageBody, the
   * time is tickingClock through the run's own `duration`.
   */
  import { SvelteSet } from "svelte/reactivity";
  import CawFace from "#lib/cawco/home/CawFace.svelte";
  import MessageBody from "#lib/cawco/MessageBody.svelte";
  import { branch, nestFrom } from "#lib/cawco/motion/branch.svelte.js";
  import { tickingClock } from "#lib/cawco/motion/clock.svelte.js";
  import { reflow } from "#lib/cawco/motion/rows.svelte.js";
  import SessionMark from "#lib/cawco/SessionMark.svelte";
  import TreeCount from "#lib/cawco/TreeCount.svelte";
  import { duration } from "#lib/components/features/workflows/workflow-ui.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import {
    IconChevronDown,
    IconExternal,
    IconHourglass,
    IconPlus,
    IconTick,
  } from "#lib/icons.js";
  import type { PlanFixture, Step } from "./fixtures";

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
      return duration(new Date(loaded - step.startedAgo), null, clock.now);
    }
    return null;
  };

  /** The mark's place, which the rails hang from and end on. */
  const MARK = ".pv-mark";
</script>

<!-- The session's own mark: to do an open ring, doing the live dot breathing,
     done the tick drawn along its stroke (PlanTree's three), failed the
     cross in fail ink. -->
{#snippet ownMark(state: Step["state"])}
  {#if state === "done"}
    <IconTick class="tick" />
  {:else}
    <span data-slot="dot" class="dot" data-live={state === "doing" || undefined}
    ></span>
  {/if}
{/snippet}

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
          {@render ownMark(state)}
        </button>
      {:else}
        {@render ownMark(state)}
      {/if}
    </span>
    <span data-slot="words" class="words">{step.words}</span>
    <span class="trail">
      {#if step.proposed && !agreed.has(step.id)}
        <span class="tag">Proposed</span>
        <Button
          class="agree"
          onclick={() => agreed.add(step.id)}
          size="xs"
          variant="outline">Agree</Button
        >
      {:else if step.promoted}
        <button
          aria-label="Open {step.promoted.task}, in {step.promoted.stage}"
          class="chip task touch-hit"
          type="button"
        >
          <span class="arrow" aria-hidden="true">→</span>
          <span class="ref">{step.promoted.task}</span>
          <span class="stage">· {step.promoted.stage}</span>
        </button>
      {:else if step.todo}
        <span class="chip ref">{step.todo}</span>
      {/if}
      {#if time}
        <span data-num class="num time">{time}</span>
      {/if}
      {#if step.fold}
        <TreeCount
          count={step.fold.count}
          noun={step.fold.noun}
          ontoggle={() => turn(step.id)}
          {open}
        />
      {/if}
    </span>
    {#if step.wait}
      <span data-slot="wait" class="wait" data-kind={step.wait.kind}>
        {#if step.wait.kind === "you"}
          <CawFace size={14} status="needs-you" />
        {:else if step.wait.kind === "slot"}
          <IconHourglass aria-hidden="true" class="wait-glyph" />
        {/if}
        <span class="wait-words">{step.wait.words}</span>
      </span>
    {/if}
  </div>
{/snippet}

{#snippet tree(steps: Step[], nested: boolean)}
  <ul
    class={nested ? "kit-nest rows nested" : "rows"}
    in:branch={{ glyph: MARK }}
    out:branch={{ glyph: MARK }}
    {@attach reflow()}
    {@attach nested ? nestFrom(MARK) : clock.watch}
  >
    {#each steps as step (step.id)}
      {@const shows = step.carrier ? isOpen(step) : true}
      <li data-flip="box">
        {@render row(step)}
        {#if shows && (step.children?.length ?? 0) > 0}
          {@render tree(step.children ?? [], true)}
        {/if}
        {#if step.carrier && isOpen(step)}
          <div
            class="fold-foot"
            in:branch={{ glyph: MARK }}
            out:branch={{ glyph: MARK }}
            data-flip-anchor
          >
            {#if step.fold?.report}
              <p class="report" data-branch-item>{step.fold.report}</p>
            {/if}
            <button class="open" data-branch-item type="button">
              <span>Open its session</span>
              <IconExternal aria-hidden="true" />
            </button>
          </div>
        {/if}
      </li>
    {/each}
  </ul>
{/snippet}

<div data-slot="plan" class="plan">
  {@render tree(plan.steps, false)}
  {#if plan.task}
    <button class="add touch-hit" type="button">
      <IconPlus aria-hidden="true" />
      <span>Add a to-do</span>
    </button>
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
        <IconChevronDown aria-hidden="true" class="chev" />
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
  :is(.tick-target, .chip.task, .open, .add):focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }
  .spec-head:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: -2px;
    border-radius: var(--radius-xs);
  }
  .plan {
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

  /* RunSteps' row: the mark at the row's edge, the words, then at the
     trailing edge the link chip, the time and the fold's count; what it
     waits on runs under the words. */
  .row {
    display: grid;
    grid-template-columns: var(--icon-md) minmax(0, 1fr) auto;
    grid-template-areas:
      "mark words trail"
      ". wait wait";
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
    inline-size: var(--icon-md);
    block-size: 1lh;
  }
  .words {
    grid-area: words;
    min-inline-size: 0;
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
    block-size: 1lh;
  }

  /* The session's own mark (PlanTree's): an open ring, the live dot that
     breathes in scale, the house tick drawn along its stroke. */
  .dot {
    inline-size: var(--status-dot-size);
    block-size: var(--status-dot-size);
    border-radius: 50%;
    box-shadow: inset 0 0 0 1px var(--ink-subtle);

    &[data-live] {
      box-shadow: none;
      background: var(--status-live-glyph);
    }
  }
  .pv-mark :global(.tick) {
    inline-size: var(--icon-md);
    block-size: var(--icon-md);
    color: var(--status-done-glyph);
  }
  @media (prefers-reduced-motion: no-preference) {
    .dot[data-live] {
      animation: pv-breath var(--breath) var(--ease-in-out) infinite;
    }
    .pv-mark :global(.tick path) {
      stroke-dasharray: 20;
      animation: pv-tick var(--dur-toggle) var(--ease-out) both;
    }
  }
  @keyframes pv-breath {
    50% {
      scale: 0.7;
    }
  }
  @keyframes pv-tick {
    from {
      stroke-dashoffset: 20;
    }
    to {
      stroke-dashoffset: 0;
    }
  }

  /* A to-do's mark is its checkbox: the same three drawings, pressed to
     tick or untick it from the plan. */
  .tick-target {
    display: grid;
    place-items: center;
    inline-size: var(--icon-md);
    block-size: var(--icon-md);
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
    .tick-target:hover .dot:not([data-live]) {
      box-shadow: inset 0 0 0 1px var(--ink-muted);
    }
  }

  /* The link chip: a to-do's id in code ink, a promoted to-do's task and
     its stage. */
  .chip {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: var(--space-1);
    block-size: 20px;
    padding-inline: 6px;
    border: 0;
    border-radius: var(--radius-xs);
    background: var(--surface-recess);
    color: var(--ink-muted);
    font: var(--type-meta);
    white-space: nowrap;
  }
  .ref {
    font-family: var(--font-mono);
    font-variant-ligatures: none;
  }
  .chip.task {
    color: var(--ink-strong);
    cursor: pointer;
    transition: background-color var(--dur-control) var(--ease-out);

    & .stage {
      color: var(--ink-muted);
    }
  }
  @media (hover: hover) and (pointer: fine) {
    .chip.task:hover {
      background: var(--surface-hover);
    }
  }
  .tag {
    flex: none;
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .trail :global(.agree) {
    flex: none;
  }
  .time {
    flex: none;
    color: var(--ink-muted);
    font: var(--type-meta);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  /* What a step waits on, under its words, in meta ink: Caw's needs-you
     face for a question, the hourglass for a slot, fail ink for a failure. */
  .wait {
    grid-area: wait;
    display: flex;
    align-items: center;
    gap: var(--space-1);
    min-inline-size: 0;
    font: var(--type-meta);
    color: var(--ink-muted);

    &[data-kind="you"] {
      color: var(--status-attn-ink);
    }
    &[data-kind="fail"] {
      color: var(--status-fail-ink);
    }
    & :global(.wait-glyph) {
      flex: none;
      inline-size: 12px;
      block-size: 12px;
    }
  }
  .wait-words {
    min-inline-size: 0;
    overflow-wrap: anywhere;
  }

  /* What a carried step folds open, past its own steps: its report, and the
     way into its session. */
  .fold-foot {
    display: flex;
    flex-direction: column;
    align-items: start;
    gap: var(--space-1);
    padding-block: 2px var(--space-1);
    padding-inline-start: calc(var(--icon-md) + var(--space-2));
  }
  .report {
    margin: 0;
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
    gap: var(--space-1);
    min-block-size: 24px;
    padding: 0 var(--space-1);
    margin-inline-start: calc(-1 * var(--space-1));
    border: 0;
    border-radius: var(--radius-xs);
    background: none;
    color: var(--ink-muted);
    font: var(--type-meta);
    cursor: pointer;
    transition:
      background-color var(--dur-control) var(--ease-out),
      color var(--dur-control) var(--ease-out);

    & :global(svg) {
      inline-size: 12px;
      block-size: 12px;
    }
  }
  .add {
    gap: var(--space-2);
    min-block-size: 28px;
    margin-inline-start: 0;
    padding-inline: 0;
    font: var(--type-label);
    font-weight: var(--weight-body);

    & :global(svg) {
      inline-size: var(--icon-md);
      block-size: var(--icon-md);
    }
  }
  @media (hover: hover) and (pointer: fine) {
    .open:hover,
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

    & :global(.chev) {
      margin-inline-start: auto;
      inline-size: var(--icon-md);
      block-size: var(--icon-md);
      color: var(--ink-muted);
      transition: rotate var(--dur-control) var(--ease-in-out);
    }
  }
  .spec[data-open] .spec-head :global(.chev) {
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
