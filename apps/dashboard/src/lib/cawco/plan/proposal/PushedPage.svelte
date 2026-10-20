<script lang="ts">
  /**
   * THE PUSHED PAGE (proposal, Lanes and Crew first on a phone): a step or a
   * delegate opened as a page inside the sheet, on the phone Configure
   * stack's recipe (DESIGN.md, Pages): it comes in from the inline end over
   * 280ms on the drawer curve while the list falls back 30% and dims to
   * 0.6; Back reverses it over 260ms. The page heads with Back and the
   * step's words, then what its fold would hold.
   */
  import type { Snippet } from "svelte";
  import MessageBody from "#lib/cawco/MessageBody.svelte";
  import SessionMark from "#lib/cawco/SessionMark.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconChevronLeft, IconExternal } from "#lib/icons.js";
  import AckLine from "./AckLine.svelte";
  import { OPEN_SESSION, REPORT, ROWS } from "./classes";
  import DelegateRow from "./DelegateRow.svelte";
  import {
    carriersOf,
    openBefore,
    type PlanFixture,
    type Step,
  } from "./fixtures";
  import ProgressLine from "./ProgressLine.svelte";
  import StepTile from "./StepTile.svelte";
  import StepTools from "./StepTools.svelte";
  import SubRows from "./SubRows.svelte";
  import TaskBadge from "./TaskBadge.svelte";
  import { useView } from "./view.svelte";

  let {
    plan,
    steps,
    list,
  }: {
    plan: PlanFixture;
    /** The plan's rows as the person has them. */
    steps: Step[];
    list: Snippet;
  } = $props();

  const view = useView();
  const step = $derived(steps.find((one) => one.id === view.pushed.id));
  const ack = $derived(step ? view.acks.get(step.id) : undefined);
  const delegate = $derived(
    plan.delegates.find((one) => one.id === view.pushed.id)
  );
  const pushed = $derived(Boolean(step || delegate));
  /**
   * Both pages: one cell, moving on the drawer curve, in over --dur-panel
   * and back over --dur-pop (DESIGN.md, Pages: 280ms and 260ms). The page
   * going away stays seen until it has moved (a visibility transition
   * holds `visible` to its end), then nothing in it is reachable. With less
   * motion nothing travels: the pages only cross-fade over --dur-control.
   */
  const PAGE =
    "col-start-1 row-start-1 min-w-0 transition-[translate,opacity,visibility] ease-drawer motion-reduce:translate-x-0 motion-reduce:transition-[opacity,visibility] motion-reduce:duration-(--dur-control) motion-reduce:ease-out";
  /** The page's head: its tile or mark beside its title. */
  const HEAD = "grid grid-cols-(--pv-cols-narrow) items-start gap-space-2";
  const TITLE =
    "m-0 type-body font-medium wrap-anywhere text-balance text-ink-strong";
  /** A line on the title's column, in meta. */
  const META =
    "num m-0 flex flex-wrap items-center gap-x-space-2 gap-y-space-1 ps-(--pv-tile-in) type-meta";
</script>

<!-- Both pages in one cell; the stack cuts what slides past its sides. The
     page that comes in is the sheet's own surface, so the list it covers
     never shows through it. With less motion nothing travels: the pages
     only cross-fade. -->
<div
  class="grid overflow-x-clip"
  data-pushed={pushed || undefined}
  data-slot="push-stack"
>
  <div
    class={[
      PAGE,
      pushed
        ? "invisible -translate-x-3/10 opacity-60 duration-(--dur-panel) motion-reduce:opacity-0"
        : "duration-(--dur-pop)",
    ]}
    inert={pushed}
  >
    {@render list()}
  </div>
  <div
    class={[
      PAGE,
      "relative z-1 flex flex-col gap-space-2 self-start bg-surface-raised",
      pushed
        ? "translate-x-0 duration-(--dur-panel)"
        : "invisible translate-x-full duration-(--dur-pop)",
    ]}
    data-slot="pushed-page"
    inert={!pushed}
  >
    {#if pushed}
      <button
        class="pressable mark-line inline-flex min-h-c-touch-floor items-center gap-space-1 self-start rounded-xs p-0 type-label text-link-ink [&_svg]:size-icon-md"
        onclick={() => {
          view.pushed.id = null;
        }}
        type="button"
      >
        <IconChevronLeft aria-hidden="true" />
        <span>Plan</span>
      </button>
      {#if step}
        {@const state = view.stateOf(step.id, step.state)}
        <header class={HEAD} data-state={state}>
          <StepTile {state} />
          <h3 class={TITLE}>{step.words}</h3>
        </header>
        <p class={[META, "text-ink-muted"]}>
          <span class="num"
            >{view.timeOf(step.id, step.state, step.startedAgo, step.took) ||
              "Not started"}</span
          >
          {#if step.subs?.length}
            <span
              >· {step.subs.filter((sub) => sub.state === "done").length} of
              {step.subs.length} steps</span
            >
          {/if}
          {#if step.promoted}
            <TaskBadge task={step.promoted} />
          {/if}
        </p>
        {#if openBefore(plan, step).length > 0}
          <p class="m-0 ps-(--pv-tile-in) type-meta text-ink-muted">
            Starts after {openBefore(plan, step)
              .map((one) => one.short)
              .join(" and ")}
          </p>
        {/if}
        <div class="ps-(--pv-tile-in) type-body" data-slot="description">
          <MessageBody source={step.description} />
        </div>
        {#if step.subs?.length}
          <ul class={ROWS}>
            <SubRows steps={step.subs} />
          </ul>
        {/if}
        {#if ack}
          <AckLine {ack} />
        {/if}
        <StepTools {plan} {step} {steps} />
        {#if carriersOf(plan, step).length > 0}
          <ul class={ROWS}>
            {#each carriersOf(plan, step) as one (one.id)}
              <DelegateRow delegate={one} />
            {/each}
          </ul>
        {/if}
      {:else if delegate}
        <!-- mark-line: the mark stands at the top of a title that wraps, in its own grid cell -->
        <header class={HEAD}>
          <SessionMark
            id={delegate.id}
            place={delegate.place}
            status={delegate.status}
          />
          <h3 class={TITLE}>
            <span>{delegate.name} ·</span>
            {delegate.problem}
          </h3>
        </header>
        <div class="ps-(--pv-tile-in)">
          <ProgressLine {delegate} />
        </div>
        {#if delegate.wait}
          <p
            class={[
              META,
              delegate.wait.kind === "you" && "text-status-attn-ink",
              delegate.wait.kind === "fail" && "text-status-fail-ink",
              delegate.wait.kind !== "you" &&
                delegate.wait.kind !== "fail" &&
                "text-ink-muted",
            ]}
            data-kind={delegate.wait.kind}
          >
            {delegate.wait.words}
          </p>
        {/if}
        {#if delegate.steps.length > 0}
          <ul class={ROWS}>
            <SubRows steps={delegate.steps} />
          </ul>
        {/if}
        {#if delegate.report}
          <p class={REPORT} data-slot="report">{delegate.report}</p>
        {/if}
        <span class="flex flex-wrap items-center gap-space-3">
          <button class={["mark-line", OPEN_SESSION]} type="button">
            <span>Open its session</span>
            <IconExternal aria-hidden="true" />
          </button>
          {#if delegate.status === "live" || delegate.status === "attn"}
            <Button label="Stop it" size="xs" variant="outline" />
          {/if}
        </span>
      {/if}
    {/if}
  </div>
</div>
