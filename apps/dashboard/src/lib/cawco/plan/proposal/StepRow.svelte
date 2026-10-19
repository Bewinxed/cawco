<script lang="ts">
  /**
   * A step's row (proposal), on RunSteps' recipe: the step tile, the words,
   * then at the trailing edge the task badge, the fold's chevron and the
   * time in a 7ch tabular column, so every time ends on one x. Under the
   * words: what it waits on ("after Date picker", each name a link to its
   * step), or the session's proposal. The words are the switch: pressed, the row tints (The Press
   * Rule: a wide control never scales) and the step opens on the accordion
   * to its description and sub-steps; on a phone in Lanes and Crew first it
   * pushes the step's page instead. The tile stays the to-do's checkbox.
   */
  import type { Snippet } from "svelte";
  import { fade } from "svelte/transition";
  import MessageBody from "#lib/cawco/MessageBody.svelte";
  import { nestFrom } from "#lib/cawco/motion/branch.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconChevronRight } from "#lib/icons.js";
  import AckLine from "./AckLine.svelte";
  import Fold from "./Fold.svelte";
  import { openBefore, type PlanFixture, type Step } from "./fixtures";
  import StepTile from "./StepTile.svelte";
  import StepTools from "./StepTools.svelte";
  import SubRows from "./SubRows.svelte";
  import TaskBadge from "./TaskBadge.svelte";
  import { pointAt, useView } from "./view.svelte";

  let {
    step,
    plan,
    steps,
    pushes = false,
    lane = 0,
    lanes = 1,
    trail,
    inFold,
    below,
  }: {
    step: Step;
    plan: PlanFixture;
    /** The plan's rows as the person has them, for a move. */
    steps: Step[];
    /** Pressing the words pushes the step's page (a phone, Lanes and Crew first). */
    pushes?: boolean;
    /** Lanes: which of the two lanes its tile stands in. */
    lane?: number;
    /** Lanes: how many lanes run through this row (its gutter's width). */
    lanes?: number;
    /** More at the trailing edge, before the chevron (Crew first: who is on it). */
    trail?: Snippet;
    /** More inside the fold, after the sub-steps (Crew first: its delegates). */
    inFold?: Snippet;
    /** Under the row and its fold, always shown (One ledger: its delegates). */
    below?: Snippet;
  } = $props();

  const view = useView();
  const now = $derived(view.stateOf(step.id, step.state));
  const time = $derived(
    view.timeOf(step.id, step.state, step.startedAgo, step.took)
  );
  const open = $derived(view.opened.has(step.id));
  const waitsOn = $derived(openBefore(plan, step));
  const proposed = $derived(step.proposed && !view.agreed.has(step.id));
  /** A proposal the person turned down leaves the plan. */
  let dismissed = $state(false);
  const uid = $props.id();
  const foldId = $derived(`fold-${uid}`);
  const gone = $derived(view.removed.has(step.id));
  const ack = $derived(view.acks.get(step.id));

  function press(): void {
    if (pushes) {
      view.pushed.id = step.id;
      return;
    }
    view.toggle(step.id);
  }
</script>

<li
  class="item"
  data-lit={view.lit.id === step.id || undefined}
  data-after={step.after?.join(" ")}
  data-row={step.id}
  data-flip="box"
  hidden={dismissed}
  style:--lead-in="calc({lane} * (var(--pv-tile, 18px) + var(--space-2)))"
  style:--lead-w={lanes > 1
    ? `calc(${lanes} * var(--pv-tile, 18px) + ${lanes - 1} * var(--space-2))`
    : undefined}
>
  {#if gone}
    <div class="gone">
      <span class="gone-words">Removed: {step.words}</span>
      <Button
        onclick={() => {
          view.removed.delete(step.id);
          view.tell(step, "added");
        }}
        size="xs"
        variant="ghost">Undo</Button
      >
    </div>
  {:else}
    <div class="row" data-slot="plan-row" data-state={now}>
      <span class="pv-lead"
        ><span class="tile-at" data-tile={step.id}
          ><StepTile
            label={step.words}
            onpress={() => {
              if (view.ticked.has(step.id)) {
                view.ticked.delete(step.id);
              } else {
                view.ticked.add(step.id);
              }
              view.tell(step, "ticked");
            }}
            state={now}
          /></span
        ></span
      >
      <button
        aria-controls={pushes ? undefined : foldId}
        aria-expanded={pushes ? undefined : open}
        class="words press-tint"
        data-slot="words"
        onclick={press}
        type="button"
      >
        {step.words}
      </button>
      <span class="trail mark-line" data-slot="trail">
        {@render trail?.()}
        {#if step.promoted}
          <span data-box
            ><TaskBadge
              stage={step.promoted.stage}
              title={step.promoted.title}
            /></span
          >
        {/if}
        <span
          aria-hidden="true"
          class="chev"
          data-box
          data-open={(open && !pushes) || undefined}
          data-slot="chevron"><IconChevronRight /></span
        >
        <span class="num time" data-num data-slot="time">{time}</span>
      </span>
      {#if waitsOn.length > 0 && now !== "done"}
        <span
          class="under after"
          data-slot="after"
          out:fade={{ duration: 160 }}
        >
          <span>after</span>
          <!-- Each name is a link to its step: pressed, the plan scrolls to
               that step's row and lights it. -->
          {#each waitsOn as before, index (before.id)}
            {#if index > 0}<span aria-hidden="true">·</span>{/if}
            <button
              aria-label="Go to {before.short}"
              class="link pressable"
              data-goes={before.id}
              onclick={(event) => pointAt(view, event.currentTarget, before.id)}
              type="button">{before.short}</button
            >
          {/each}
        </span>
      {:else if proposed}
        <span class="under">
          <span>Proposed by the session</span>
          <Button
            class="agree"
            onclick={() => view.agreed.add(step.id)}
            size="xs"
            variant="outline">Agree</Button
          >
          <Button
            class="agree"
            onclick={() => {
              dismissed = true;
            }}
            size="xs"
            variant="ghost">Dismiss</Button
          >
        </span>
      {/if}
    </div>
  {/if}
  {#if ack}
    <AckLine {ack} />
  {/if}
  {#if !(pushes || gone)}
    <Fold id={foldId} {open}>
      <div class="body">
        <div class="description" data-slot="description">
          <MessageBody source={step.description} />
        </div>
        {#if step.subs?.length}
          <ul class="kit-nest subs" {@attach nestFrom(".tile-at", ".pv-lead")}>
            <SubRows steps={step.subs} />
          </ul>
        {/if}
        <StepTools {plan} {step} {steps} />
        {@render inFold?.()}
      </div>
    </Fold>
  {/if}
  {#if !gone}
    {@render below?.()}
  {/if}
</li>

<style>
  .item {
    position: relative;
    min-inline-size: 0;
    border-radius: var(--radius-sm);
    transition: background-color var(--dur-fade) var(--ease-out);

    &[data-lit] {
      background: var(--surface-hover);
    }
  }
  .gone {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    min-block-size: 28px;
    padding-inline-start: calc(
      var(--lead-w, var(--pv-tile, 18px)) + var(--space-2)
    );
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .gone-words {
    min-inline-size: 0;
    overflow-wrap: anywhere;
    text-decoration: line-through;
  }
  :global([data-coarse]) .gone {
    min-block-size: 44px;
  }
  .row {
    display: grid;
    grid-template-columns:
      var(--lead-w, var(--pv-tile, 18px)) minmax(0, 1fr)
      auto;
    grid-template-areas:
      "lead words trail"
      ". under under";
    column-gap: var(--space-2);
    row-gap: 2px;
    align-items: start;
    min-block-size: 28px;
    padding-block: 5px;
    font: var(--type-label);
    color: var(--ink-strong);
  }
  .pv-lead {
    grid-area: lead;
    display: grid;
    place-items: center start;
    padding-inline-start: var(--lead-in, 0px);
    block-size: max(1lh, var(--pv-tile, 18px));
  }
  .tile-at {
    display: grid;
    inline-size: var(--pv-tile, 18px);
  }
  .words {
    grid-area: words;
    min-inline-size: 0;
    margin: -2px -4px;
    padding: 2px 4px;
    border: 0;
    border-radius: var(--radius-xs);
    background: none;
    color: inherit;
    font: inherit;
    font-weight: var(--weight-body);
    text-align: start;
    overflow-wrap: anywhere;
    text-wrap: pretty;
    cursor: pointer;
    transition: background-color var(--dur-control) var(--ease-out);

    &:active {
      background: var(--surface-fill);
    }
    &:focus-visible {
      outline: 2px solid var(--focus-ring);
      outline-offset: -2px;
    }
  }
  @media (hover: hover) and (pointer: fine) {
    .words:hover {
      background: var(--surface-hover);
    }
  }
  .row[data-state="doing"] .words,
  .row[data-state="you"] .words {
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
    block-size: max(1lh, var(--pv-tile, 18px));
  }
  .chev {
    display: grid;
    place-items: center;
    color: var(--ink-subtle);

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
  .time {
    inline-size: 7ch;
    text-align: end;
    color: var(--ink-muted);
    font: var(--type-meta);
    line-height: inherit;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .under {
    grid-area: under;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1) var(--space-2);
    min-inline-size: 0;
    font: var(--type-meta);
    color: var(--ink-muted);

    & :global(.agree) {
      flex: none;
    }
  }
  .after {
    gap: var(--space-1);
  }
  .link {
    padding: 0;
    border: 0;
    border-radius: var(--radius-xs);
    background: none;
    color: var(--link-ink);
    font: inherit;
    cursor: pointer;

    &:focus-visible {
      outline: 2px solid var(--focus-ring);
      outline-offset: 2px;
    }
  }
  @media (hover: hover) and (pointer: fine) {
    .link:hover {
      text-decoration: underline;
    }
  }
  /* The body starts on the words' column. */
  .body {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding-block: 0 var(--space-2);
  }
  .description {
    padding-inline-start: calc(
      var(--lead-w, var(--pv-tile, 18px)) + var(--space-2)
    );
    color: var(--ink-strong);
    font: var(--type-body);
  }
  .subs {
    --nest-gap: var(--space-row);
    display: flex;
    flex-direction: column;
    gap: var(--space-row);
    margin: 0;
    padding: 0;
    padding-inline-start: var(--nest-pad, var(--space-5));
    list-style: none;
  }
  :global([data-coarse]) .row {
    min-block-size: 44px;
    padding-block: 11px;
  }
</style>
