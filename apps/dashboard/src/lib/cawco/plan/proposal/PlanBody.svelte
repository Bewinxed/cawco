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
    type Step,
    stackOrder,
  } from "./fixtures";
  import NeedsYou from "./NeedsYou.svelte";
  import PlanFoot from "./PlanFoot.svelte";
  import PushedPage from "./PushedPage.svelte";
  import StepRow from "./StepRow.svelte";
  import { frameView, type Scenario } from "./view.svelte";

  let {
    plan,
    variation,
    loaded,
    phone = false,
    scenario = "rest",
  }: {
    plan: PlanFixture;
    variation: Variation;
    /** When the page loaded: every running time counts from it. */
    loaded: number;
    phone?: boolean;
    /** What the frame stands at as it starts: at rest, or one change made. */
    scenario?: Scenario;
  } = $props();

  const view = frameView({
    loaded: untrack(() => loaded),
    phone: untrack(() => phone),
    plan: () => plan,
    scenario: untrack(() => scenario),
  });
  /** The plan's rows as the person has them. */
  const steps = $derived(view.arrange(plan.steps));
  const pushes = $derived(phone && variation !== "a");

  /** Lanes: a step beside a later one that starts after the same step. */
  const laneOf = (step: Step): number => {
    const key = (step.after ?? []).join(",");
    if (!key) {
      return 0;
    }
    const index = steps.findIndex((one) => one.id === step.id);
    return steps.some(
      (other, at) => at > index && (other.after ?? []).join(",") === key
    )
      ? 1
      : 0;
  };

  const afterEdges = $derived(
    steps.flatMap((step) =>
      (step.after ?? []).map((from): Edge => ({
        from,
        to: step.id,
        kind: "after",
      }))
    )
  );
  /**
   * Crew first draws only what still gates: an edge from a prerequisite
   * that has not finished. A finished one no longer holds anything back,
   * and its line would start at a done step.
   */
  const openEdges = $derived(
    afterEdges.filter((edge) => {
      const before = steps.find((one) => one.id === edge.from);
      return before && view.stateOf(before.id, before.state) !== "done";
    })
  );
  /**
   * Lanes: the rows the second lane runs through, from its first step to
   * the last step a line from it reaches. Only they keep the two-lane
   * gutter; every other row gives it back to its words.
   */
  const twoLanes = $derived.by(() => {
    const second = steps
      .map((step, index) => ({ step, index }))
      .filter(({ step }) => laneOf(step) === 1);
    if (second.length === 0) {
      return { from: -1, to: -1 };
    }
    const ids = new Set(second.map(({ step }) => step.id));
    const reached = steps
      .map((step, index) => ({ step, index }))
      .filter(({ step }) => (step.after ?? []).some((id) => ids.has(id)))
      .map(({ index }) => index);
    return {
      from: Math.min(...second.map(({ index }) => index)),
      to: Math.max(...second.map(({ index }) => index), ...reached),
    };
  });
  const lanesAt = (step: Step): number => {
    const index = steps.findIndex((one) => one.id === step.id);
    return index >= twoLanes.from && index <= twoLanes.to ? 2 : 1;
  };
  const laneEdges = $derived([
    ...afterEdges,
    ...steps.flatMap((step) =>
      carriersOf(plan, step).map((one): Edge => ({
        from: step.id,
        to: `d:${one.id}`,
        kind: "carries",
        pulse: one.status === "live",
      }))
    ),
  ]);

  /**
   * Crew first: the stack holds what is on it (needs you, failed, working),
   * what needs you first; queued and finished delegates fold into a line
   * each under it, so the stack never grows past what is running.
   */
  const onIt = $derived(
    stackOrder(
      plan.delegates.filter(
        (one) => one.status !== "done" && one.status !== "idle"
      )
    )
  );
  const queued = $derived(
    plan.delegates.filter((one) => one.status === "idle")
  );
  const finished = $derived(
    plan.delegates.filter((one) => one.status === "done")
  );
  const uid = $props.id();
</script>

{#snippet delegates(list: Delegate[])}
  {#each list as one (one.id)}
    <DelegateRow delegate={one} {pushes} />
  {/each}
{/snippet}

{#snippet foldTrigger(list: Delegate[], word: string)}
  {#if list.length > 0}
    <button
      aria-controls="{word}-{uid}"
      aria-expanded={view.opened.has(word)}
      class="finished mark-line"
      onclick={() => view.toggle(word)}
      type="button"
    >
      <span>{list.length} {word}</span>
      <span
        aria-hidden="true"
        class="chev"
        data-box
        data-open={view.opened.has(word) || undefined}
        ><IconChevronRight /></span
      >
    </button>
  {/if}
{/snippet}

{#snippet foldBody(list: Delegate[], word: string)}
  {#if list.length > 0}
    <Fold id="{word}-{uid}" open={view.opened.has(word)}>
      <ul class="rows">{@render delegates(list)}</ul>
    </Fold>
  {/if}
{/snippet}

{#snippet ledger()}
  <NeedsYou delegates={plan.delegates} />
  <ul class="rows" {@attach reflow()} {@attach view.clock.watch}>
    {#each steps as step (step.id)}
      {@const carried = carriersOf(plan, step)}
      <StepRow {plan} {step} {steps}>
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
  <NeedsYou delegates={plan.delegates} />
  <div class="lanes">
    <Connectors edges={laneEdges} mode="lanes" />
    <ul class="rows" {@attach reflow()} {@attach view.clock.watch}>
      {#each steps as step (step.id)}
        {@const carried = carriersOf(plan, step)}
        <StepRow
          lane={laneOf(step)}
          lanes={lanesAt(step)}
          {plan}
          {pushes}
          {step}
          {steps}
        >
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
  <section aria-labelledby="on-it-{uid}" class="group">
    <!-- The queued delegates wait in the head's own line: what is on it
         stands in the stack, and the queue opens under it when asked. -->
    <div class="group-top">
      <h3 class="group-head mark-line" id="on-it-{uid}">
        <span>Delegates</span>
        <span class="num count" data-num>{onIt.length}</span>
      </h3>
      {@render foldTrigger(queued, "queued")}
    </div>
    <ul
      class="rows"
      data-slot="stack"
      {@attach reflow()}
      {@attach view.clock.watch}
    >
      {@render delegates(onIt)}
    </ul>
    {@render foldBody(queued, "queued")}
    {@render foldTrigger(finished, "finished")}
    {@render foldBody(finished, "finished")}
  </section>
  <section aria-labelledby="todos-{uid}" class="group">
    <h3 class="group-head" id="todos-{uid}">To-dos</h3>
    <div class="column">
      <Connectors edges={openEdges} mode="column" />
      <ul class="rows" {@attach reflow()}>
        {#each steps as step (step.id)}
          {@const carried = carriersOf(plan, step)}
          {@const working = carried.filter((one) => one.status !== "done")}
          <StepRow {plan} {pushes} {step} {steps}>
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
    <PushedPage list={body} {plan} {steps} />
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

  /* Lanes: a step's tile stands in its lane; a row the second lane runs
     through takes the two-lane gutter (StepRow's --lead-w), every other
     row the one tile's. Its delegates stand on its words' column. */
  .lanes {
    position: relative;
  }
  .on-lane {
    padding-inline-start: calc(
      var(--lead-w, var(--pv-tile, 18px)) + var(--space-2)
    );
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
  .group-top {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-1) var(--space-3);
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
  /* In the stack's head line the queue's trigger needs no tile's indent. */
  .group-top .finished {
    padding-inline-start: 0;
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
