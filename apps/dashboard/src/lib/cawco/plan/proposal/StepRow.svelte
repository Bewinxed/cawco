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
  import {
    CHEVRON,
    ON_WORDS,
    ROW,
    ROWS,
    STATE_WORDS,
    TIME,
    TRAIL,
    WORDS,
  } from "./classes";
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
  /** What it waits on, or the session's proposal, under the words. */
  const UNDER =
    "col-span-2 col-start-2 row-start-2 flex min-w-0 flex-wrap items-center type-meta text-ink-muted @max-plan-step/step-row:col-span-1 @max-plan-step/step-row:row-start-3";

  function press(): void {
    if (pushes) {
      view.pushed.id = step.id;
      return;
    }
    view.toggle(step.id);
  }
</script>

<!-- A row in a narrow column (Lanes' steps side by side): the words take
     the row's width beside the tile, and the trail (its badge, chevron and
     time) stands under them, so neither is squeezed to a word a line. -->
<li
  class="@container/step-row relative min-w-0 rounded-sm transition-[background-color] duration-(--dur-fade) ease-out data-lit:bg-surface-hover"
  data-lit={view.lit.id === step.id || undefined}
  data-after={step.after?.join(" ")}
  data-row={step.id}
  data-flip="box"
  hidden={dismissed}
  style:--lead-in="calc({lane} * (var(--pv-tile) + var(--space-2)))"
  style:--lead-w={lanes > 1
    ? `calc(${lanes} * var(--pv-tile) + ${lanes - 1} * var(--space-2))`
    : "var(--pv-tile)"}
  style:--step-cols="var(--lead-w) minmax(0, 1fr) auto"
  style:--step-cols-narrow="var(--lead-w) minmax(0, 1fr)"
  style:--words-in="calc(var(--lead-w) + var(--space-2))"
>
  {#if gone}
    <div
      class={[
        ON_WORDS,
        "flex min-h-c-row-lead flex-wrap items-center gap-space-2 type-meta text-ink-muted in-data-coarse:min-h-c-touch-floor",
      ]}
    >
      <span class="min-w-0 wrap-anywhere line-through"
        >Removed: {step.words}</span
      >
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
    <div
      class={[
        ROW,
        "group/row gap-y-space-row grid-cols-(--step-cols) @max-plan-step/step-row:grid-cols-(--step-cols-narrow)",
      ]}
      data-slot="plan-row"
      data-state={now}
    >
      <span
        class="col-start-1 row-start-1 grid h-(--pv-lead-h) items-center justify-items-start ps-(--lead-in)"
        data-lead
        ><span class="grid w-(--pv-tile)" data-nest-glyph data-tile={step.id}
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
        class={[WORDS, STATE_WORDS, "@max-plan-step/step-row:me-0"]}
        data-slot="words"
        onclick={press}
        type="button"
      >
        {step.words}
      </button>
      <span
        class={[
          "mark-line",
          TRAIL,
          "@max-plan-step/step-row:col-start-2 @max-plan-step/step-row:row-start-2 @max-plan-step/step-row:h-auto @max-plan-step/step-row:flex-wrap",
        ]}
        data-slot="trail"
      >
        {@render trail?.()}
        {#if step.promoted}
          <span data-box><TaskBadge task={step.promoted} /></span>
        {/if}
        <span
          aria-hidden="true"
          class={CHEVRON}
          data-box
          data-open={(open && !pushes) || undefined}
          data-slot="chevron"><IconChevronRight /></span
        >
        <span
          class={[
            TIME,
            "@max-plan-step/step-row:w-auto @max-plan-step/step-row:text-start",
          ]}
          data-num
          data-slot="time">{time}</span
        >
      </span>
      {#if waitsOn.length > 0 && now !== "done"}
        <span
          class={[UNDER, "gap-space-1"]}
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
              class="pressable rounded-xs p-0 text-link-ink hover:underline"
              data-goes={before.id}
              onclick={(event) => pointAt(view, event.currentTarget, before.id)}
              type="button">{before.short}</button
            >
          {/each}
        </span>
      {:else if proposed}
        <span class={[UNDER, "gap-x-space-2 gap-y-space-1"]}>
          <span>Proposed by the session</span>
          <Button
            class="flex-none"
            onclick={() => view.agreed.add(step.id)}
            size="xs"
            variant="outline">Agree</Button
          >
          <Button
            class="flex-none"
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
      <!-- The body starts on the words' column. -->
      <div class="flex flex-col gap-space-1 pb-space-2">
        <div
          class={[ON_WORDS, "type-body text-ink-strong"]}
          data-slot="description"
        >
          <MessageBody source={step.description} />
        </div>
        {#if step.subs?.length}
          <ul
            class={[ROWS, "kit-nest gap-space-row ps-(--nest-pad)"]}
            {@attach nestFrom("[data-nest-glyph]", "[data-lead]")}
          >
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
