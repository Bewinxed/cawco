<script lang="ts" module>
  export type Variation = "a" | "b" | "c";
</script>

<script lang="ts">
  /**
   * The plan's body in one of the three variations, from the same rows:
   *
   * - A · One ledger: one list; a delegate is one row under the to-do it
   *   carries, on the nesting rail; a dependency is an "after … ↑" chip.
   * - B · Lanes: steps that can run side by side stand in two lanes, and
   *   lines run from a step to the steps that start after it; a delegate
   *   sits under its step, on a line that pulses while it works.
   * - C · Crew first: "On it", one flat row per delegate with its progress
   *   line, then the to-dos, each with small tiles saying who is on it and
   *   one straight line per dependency.
   *
   * On a phone, A opens a step in place; B and C push its page.
   */
  import { untrack } from "svelte";
  import { nestFrom } from "#lib/cawco/motion/branch.svelte.js";
  import { reflow } from "#lib/cawco/motion/rows.svelte.js";
  import { IconChevronRight } from "#lib/icons.js";
  import Connectors, { type Edge } from "./Connectors.svelte";
  import CrewTiles from "./CrewTiles.svelte";
  import DelegateRow from "./DelegateRow.svelte";
  import Fold from "./Fold.svelte";
  import {
    carriersOf,
    type Delegate,
    type PlanFixture,
    progress,
    type Step,
    stackOrder,
  } from "./fixtures";
  import PlanFoot from "./PlanFoot.svelte";
  import PushedPage from "./PushedPage.svelte";
  import StepRow from "./StepRow.svelte";
  import { frameView } from "./view.svelte";

  let {
    plan,
    variation,
    loaded,
    phone = false,
  }: {
    plan: PlanFixture;
    variation: Variation;
    /** When the page loaded: every running time counts from it. */
    loaded: number;
    phone?: boolean;
  } = $props();

  const view = frameView({
    loaded: untrack(() => loaded),
    phone: untrack(() => phone),
    plan: () => plan,
  });
  const pushes = $derived(phone && variation !== "a");

  /** Lanes: a step beside a later one that starts after the same step. */
  const laneOf = (step: Step): number => {
    const key = (step.after ?? []).join(",");
    if (!key) {
      return 0;
    }
    const index = plan.steps.indexOf(step);
    return plan.steps.some(
      (other, at) => at > index && (other.after ?? []).join(",") === key
    )
      ? 1
      : 0;
  };

  const afterEdges = $derived(
    plan.steps.flatMap((step) =>
      (step.after ?? []).map((from): Edge => ({
        from,
        to: step.id,
        kind: "after",
      }))
    )
  );
  const laneEdges = $derived([
    ...afterEdges,
    ...plan.steps.flatMap((step) =>
      carriersOf(plan, step).map((one): Edge => ({
        from: step.id,
        to: `d:${one.id}`,
        kind: "carries",
        pulse: one.status === "live",
      }))
    ),
  ]);

  /** Crew first: the stack, working first; the finished fold under it. */
  const onIt = $derived(
    stackOrder(plan.delegates.filter((one) => one.status !== "done"))
  );
  const done = $derived(progress(plan));
  const finished = $derived(
    plan.delegates.filter((one) => one.status === "done")
  );
</script>

{#snippet delegates(list: Delegate[])}
  {#each list as one (one.id)}
    <DelegateRow delegate={one} {pushes} />
  {/each}
{/snippet}

{#snippet ledger()}
  <ul class="rows" {@attach reflow()} {@attach view.clock.watch}>
    {#each plan.steps as step (step.id)}
      {@const carried = carriersOf(plan, step)}
      <StepRow {plan} {step}>
        {#snippet below()}
          {#if carried.length > 0}
            <ul
              class="kit-nest rows nested"
              data-slot="delegates"
              {@attach nestFrom(".tile-at", ".pv-lead")}
            >
              {@render delegates(carried)}
            </ul>
          {/if}
        {/snippet}
      </StepRow>
    {/each}
  </ul>
{/snippet}

{#snippet lanes()}
  <div class="lanes">
    <Connectors edges={laneEdges} mode="lanes" />
    <ul class="rows" {@attach reflow()} {@attach view.clock.watch}>
      {#each plan.steps as step (step.id)}
        {@const carried = carriersOf(plan, step)}
        <StepRow lane={laneOf(step)} {plan} {pushes} {step}>
          {#snippet below()}
            {#if carried.length > 0}
              <ul class="rows on-lane" data-slot="delegates">
                {@render delegates(carried)}
              </ul>
            {/if}
          {/snippet}
        </StepRow>
      {/each}
    </ul>
  </div>
{/snippet}

{#snippet crew()}
  <section aria-labelledby="on-it-{variation}" class="group">
    <h3 class="group-head mark-line" id="on-it-{variation}">
      <span>On it</span>
      <span class="num count" data-num>{onIt.length}</span>
    </h3>
    <ul
      class="rows"
      data-slot="stack"
      {@attach reflow()}
      {@attach view.clock.watch}
    >
      {@render delegates(onIt)}
    </ul>
    {#if finished.length > 0}
      <button
        aria-expanded={view.opened.has("finished")}
        class="finished mark-line"
        onclick={() => view.toggle("finished")}
        type="button"
      >
        <span>{finished.length} finished</span>
        <span
          aria-hidden="true"
          class="chev"
          data-box
          data-open={view.opened.has("finished") || undefined}
          ><IconChevronRight /></span
        >
      </button>
      <Fold id="finished-{variation}" open={view.opened.has("finished")}>
        <ul class="rows">{@render delegates(finished)}</ul>
      </Fold>
    {/if}
  </section>
  <section aria-labelledby="todos-{variation}" class="group">
    <h3 class="group-head mark-line" id="todos-{variation}">
      <span>To-dos</span>
      <span class="num count" data-num>{done.done} of {done.total}</span>
    </h3>
    <div class="column">
      <Connectors edges={afterEdges} mode="column" />
      <ul class="rows" {@attach reflow()}>
        {#each plan.steps as step (step.id)}
          {@const carried = carriersOf(plan, step)}
          {@const working = carried.filter((one) => one.status !== "done")}
          <StepRow {plan} {pushes} {step}>
            {#snippet trail()}
              <CrewTiles delegates={working} />
            {/snippet}
            {#snippet inFold()}
              {#if carried.length > 0}
                <ul class="rows in-fold">{@render delegates(carried)}</ul>
              {/if}
            {/snippet}
          </StepRow>
        {/each}
      </ul>
    </div>
  </section>
{/snippet}

{#snippet body()}
  {#if variation === "a"}
    {@render ledger()}
  {:else if variation === "b"}
    {@render lanes()}
  {:else}
    {@render crew()}
  {/if}
  <PlanFoot {plan} />
{/snippet}

<div class="plan" data-slot="plan" data-variation={variation}>
  {#if pushes}
    <PushedPage list={body} {plan} />
  {:else}
    {@render body()}
  {/if}
</div>

<style>
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
  /* One ledger: a delegate hangs one level in off its to-do's tile. */
  .rows.nested {
    --nest-gap: var(--space-row);
    padding-inline-start: var(--nest-pad, var(--space-5));
  }

  /* Lanes: two 18px lanes and the gap before the words; a step's tile
     stands in its lane, its delegates under it on the words' column. */
  .lanes {
    position: relative;
    --lead-w: calc(var(--pv-tile, 18px) * 2 + var(--space-2));
  }
  .on-lane {
    padding-inline-start: calc(var(--pv-tile, 18px) * 2 + var(--space-2) * 2);
  }

  /* Crew first: two groups, each named by a quiet head. */
  .group {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);

    & + .group {
      margin-block-start: var(--space-3);
      padding-block-start: var(--space-3);
      border-block-start: 1px solid var(--border-hairline);
    }
  }
  .group-head {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    margin: 0;
    font: var(--type-label);
    font-weight: var(--weight-body);
    color: var(--ink-muted);
  }
  .count {
    font: var(--type-meta);
    font-variant-numeric: tabular-nums;
  }
  .column {
    position: relative;
  }
  .in-fold {
    padding-inline-start: calc(var(--pv-tile, 18px) + var(--space-2));
  }
  .finished {
    display: inline-flex;
    align-items: center;
    align-self: start;
    gap: var(--space-1);
    min-block-size: 28px;
    padding: 0;
    padding-inline-start: calc(var(--pv-tile, 18px) + var(--space-2));
    border: 0;
    border-radius: var(--radius-xs);
    background: none;
    color: var(--ink-muted);
    font: var(--type-meta);
    cursor: pointer;

    &:focus-visible {
      outline: 2px solid var(--focus-ring);
      outline-offset: 2px;
    }
  }
  .chev {
    display: grid;
    place-items: center;

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
  :global([data-coarse]) .finished {
    min-block-size: 44px;
  }
</style>
