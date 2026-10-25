<script lang="ts" module>
  export type Variation = "a" | "b" | "c";
</script>

<script lang="ts">
  /**
   * The plan's body in one of the three variations, from the same rows:
   *
   * - A · One ledger: one list; a delegate is one row under the to-do it
   *   carries, on the nesting rail; a dependency is an "after …" chip whose
   *   names link to their steps.
   * - B · Lanes: steps that start after the same steps run at the same
   *   time, and stand side by side in columns (a band); lines run from a
   *   step to the steps that start after it, turning only between rows; a
   *   delegate sits under its step, on a line that pulses while it works.
   * - C · Crew first: the delegates, one flat row each with its progress
   *   line, then the to-dos in one column, each with tiles saying who is on
   *   it and what it waits on named under its words, each name a link.
   *
   * On a phone, A opens a step in place; B and C push its page.
   */
  import { untrack } from "svelte";
  import { nestFrom } from "#lib/cawco/motion/branch.svelte.js";
  import { reflow } from "#lib/cawco/motion/rows.svelte.js";
  import { IconChevronRight } from "#lib/icons.js";
  import Connectors, { type Edge } from "./Connectors.svelte";
  import CrewTiles from "./CrewTiles.svelte";
  import { ON_WORDS, ROWS } from "./classes";
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

  const afterEdges = $derived(
    steps.flatMap((step) =>
      (step.after ?? []).map((from): Edge => ({
        from,
        to: step.id,
        kind: "after",
      }))
    )
  );
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
   * Lanes: the rows in bands, each a step alone or the steps that start
   * after the same steps (they run at the same time), side by side. A step
   * that waits stands right after the band of the last step it waits on,
   * so every line joins two bands next to each other and runs past no
   * other row; a step that waits on nothing keeps its place in the plan.
   */
  const bands = $derived.by(() => {
    const out: Step[][] = [];
    const keyOf = (step: Step) => (step.after ?? []).join(",");
    const bandOf = (id: string) =>
      out.findIndex((band) => band.some((one) => one.id === id));
    for (const step of steps) {
      const key = keyOf(step);
      const last = Math.max(-1, ...(step.after ?? []).map(bandOf));
      if (key === "" || last < 0) {
        out.push([step]);
        continue;
      }
      const next = out[last + 1];
      if (next?.[0] && keyOf(next[0]) === key) {
        next.push(step);
      } else {
        out.splice(last + 1, 0, [step]);
      }
    }
    return out;
  });

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
  /** A list of rows, a hair apart. */
  const LIST = [ROWS, "gap-space-row"];
  /** A group's quiet head. */
  const GROUP_HEAD =
    "m-0 flex items-baseline gap-space-2 type-label font-normal text-ink-muted";
</script>

{#snippet delegates(list: Delegate[])}
  {#each list as one (one.id)}
    <DelegateRow delegate={one} {pushes} />
  {/each}
{/snippet}

<!-- The queued and finished delegates' line: on the words' column, or in
     the stack's head line with no tile's indent. -->
{#snippet foldTrigger(list: Delegate[], word: string, inHead = false)}
  {#if list.length > 0}
    <button
      aria-controls="{word}-{uid}"
      aria-expanded={view.opened.has(word)}
      class={[
        "mark-line inline-flex min-h-c-row-lead items-center gap-space-1 self-start rounded-xs p-0 type-meta text-ink-muted in-data-coarse:min-h-c-touch-floor",
        !inHead && "ps-(--pv-tile-in)",
      ]}
      onclick={() => view.toggle(word)}
      type="button"
    >
      <span>{list.length} {word}</span>
      <span
        aria-hidden="true"
        class="grid place-items-center [&_svg]:size-icon-sm motion-safe:transition-[rotate] motion-safe:duration-(--dur-control) motion-safe:ease-out data-open:rotate-90"
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
      <ul class={LIST}>{@render delegates(list)}</ul>
    </Fold>
  {/if}
{/snippet}

{#snippet ledger()}
  <NeedsYou delegates={plan.delegates} />
  <ul class={LIST} {@attach reflow()} {@attach view.clock.watch}>
    {#each steps as step (step.id)}
      {@const carried = carriersOf(plan, step)}
      <StepRow {plan} {step} {steps}>
        {#snippet below()}
          {#if carried.length > 0}
            <!-- One ledger: a delegate hangs one level in off its to-do's tile. -->
            <ul
              class={[LIST, "kit-nest ps-(--nest-pad)"]}
              data-slot="delegates"
              {@attach nestFrom("[data-nest-glyph]", "[data-lead]")}
            >
              {@render delegates(carried)}
            </ul>
          {/if}
        {/snippet}
      </StepRow>
    {/each}
  </ul>
{/snippet}

{#snippet laneStep(step: Step)}
  {@const carried = carriersOf(plan, step)}
  <StepRow {plan} {pushes} {step} {steps}>
    {#snippet below()}
      {#if carried.length > 0}
        <ul class={[LIST, ON_WORDS]} data-slot="delegates">
          {@render delegates(carried)}
        </ul>
      {/if}
    {/snippet}
  </StepRow>
{/snippet}

{#snippet lanes()}
  <NeedsYou delegates={plan.delegates} />
  <!-- Lanes: a step's delegates stand on its words' column, joined to it by
       a line. A band's steps stand in columns of one width, side by side,
       each as tall as its own rows; the gap between them is the lines'
       room. -->
  <div class="relative" data-slot="lanes">
    <Connectors edges={laneEdges} />
    <ul class={LIST} {@attach reflow()} {@attach view.clock.watch}>
      {#each bands as band (band.map((one) => one.id).join(" "))}
        {#if band.length > 1}
          <li
            class="min-w-0"
            data-band={band.map((one) => one.id).join(" ")}
            data-flip="box"
            data-slot="band"
          >
            <ul
              class={[
                LIST,
                "grid grid-cols-(--band-cols) items-start gap-x-space-3",
              ]}
              style:--band-cols="repeat({band.length}, minmax(0, 1fr))"
            >
              {#each band as step (step.id)}
                {@render laneStep(step)}
              {/each}
            </ul>
          </li>
        {:else}
          {@render laneStep(band[0] as Step)}
        {/if}
      {/each}
    </ul>
  </div>
{/snippet}

{#snippet crew()}
  <!-- Crew first: two groups, each named by a quiet head. -->
  <section aria-labelledby="on-it-{uid}" class="flex flex-col gap-space-1">
    <!-- The queued delegates wait in the head's own line: what is on it
         stands in the stack, and the queue opens under it when asked. -->
    <div
      class="flex flex-wrap items-center justify-between gap-x-space-3 gap-y-space-1"
    >
      <h3 class={["mark-line", GROUP_HEAD]} id="on-it-{uid}">
        <span>Delegates</span>
        <span class="num type-meta" data-num>{onIt.length}</span>
      </h3>
      {@render foldTrigger(queued, "queued", true)}
    </div>
    <ul
      class={LIST}
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
  <section
    aria-labelledby="todos-{uid}"
    class="mt-space-3 flex flex-col gap-space-1 border-t border-border-hairline pt-space-3"
  >
    <h3 class={GROUP_HEAD} id="todos-{uid}">To-dos</h3>
    <!-- One column: every to-do's tile and words on one line each, what it
         waits on named under its words, each name a link to its step. -->
    <ul class={LIST} {@attach reflow()}>
      {#each steps as step (step.id)}
        {@const carried = carriersOf(plan, step)}
        {@const working = carried.filter((one) => one.status !== "done")}
        <StepRow {plan} {pushes} {step} {steps}>
          {#snippet trail()}
            <CrewTiles delegates={working} />
          {/snippet}
          {#snippet inFold()}
            {#if carried.length > 0}
              <ul class={[LIST, ON_WORDS]}>
                {@render delegates(carried)}
              </ul>
            {/if}
          {/snippet}
        </StepRow>
      {/each}
    </ul>
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

<div
  class="flex min-w-0 flex-col gap-space-1"
  data-slot="plan"
  data-variation={variation}
>
  {#if pushes}
    <PushedPage list={body} {plan} {steps} />
  {:else}
    {@render body()}
  {/if}
</div>
