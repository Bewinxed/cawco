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
  import DelegateRow from "./DelegateRow.svelte";
  import { carriersOf, openBefore, type PlanFixture } from "./fixtures";
  import ProgressLine from "./ProgressLine.svelte";
  import StepTile from "./StepTile.svelte";
  import SubRows from "./SubRows.svelte";
  import TaskBadge from "./TaskBadge.svelte";
  import { useView } from "./view.svelte";

  let { plan, list }: { plan: PlanFixture; list: Snippet } = $props();

  const view = useView();
  const step = $derived(plan.steps.find((one) => one.id === view.pushed.id));
  const delegate = $derived(
    plan.delegates.find((one) => one.id === view.pushed.id)
  );
  const pushed = $derived(Boolean(step || delegate));
</script>

<div class="stack" data-pushed={pushed || undefined} data-slot="push-stack">
  <div class="page list" inert={pushed}>{@render list()}</div>
  <div class="page detail" data-slot="pushed-page" inert={!pushed}>
    {#if pushed}
      <button
        class="back pressable"
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
        <header class="head" data-state={state}>
          <StepTile {state} />
          <h3 class="title">{step.words}</h3>
        </header>
        <p class="meta">
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
            <TaskBadge
              stage={step.promoted.stage}
              title={step.promoted.title}
            />
          {/if}
        </p>
        {#if openBefore(plan, step).length > 0}
          <p class="after">
            Starts after {openBefore(plan, step)
              .map((one) => one.short)
              .join(" and ")}
          </p>
        {/if}
        <div class="description" data-slot="description">
          <MessageBody source={step.description} />
        </div>
        {#if step.subs?.length}
          <ul class="rows">
            <SubRows steps={step.subs} />
          </ul>
        {/if}
        {#if carriersOf(plan, step).length > 0}
          <ul class="rows">
            {#each carriersOf(plan, step) as one (one.id)}
              <DelegateRow delegate={one} />
            {/each}
          </ul>
        {/if}
      {:else if delegate}
        <header class="head">
          <SessionMark
            id={delegate.id}
            place={delegate.place}
            status={delegate.status}
          />
          <h3 class="title">
            <span class="name">{delegate.name}</span>
            {delegate.problem}
          </h3>
        </header>
        <div class="line"><ProgressLine {delegate} /></div>
        {#if delegate.wait}
          <p class="meta" data-kind={delegate.wait.kind}>
            {delegate.wait.words}
          </p>
        {/if}
        {#if delegate.steps.length > 0}
          <ul class="rows">
            <SubRows steps={delegate.steps} />
          </ul>
        {/if}
        {#if delegate.report}
          <p class="report" data-slot="report">{delegate.report}</p>
        {/if}
        <span class="acts">
          <button class="open pressable" type="button">
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

<style>
  /* Both pages in one cell; the stack cuts what slides past its sides. */
  .stack {
    display: grid;
    overflow-x: clip;
  }
  .page {
    grid-area: 1 / 1;
    min-inline-size: 0;
    transition:
      translate 260ms var(--ease-drawer),
      opacity 260ms var(--ease-drawer);
  }
  /* The page that comes in is the sheet's own surface, so the list it
     covers never shows through it. */
  .detail {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-self: start;
    gap: var(--space-2);
    background: var(--surface-raised);
    translate: 100% 0;
  }
  .stack[data-pushed] {
    & .list {
      translate: -30% 0;
      opacity: 0.6;
      visibility: hidden;
      transition:
        translate 280ms var(--ease-drawer),
        opacity 280ms var(--ease-drawer),
        visibility 0s 280ms;
    }
    & .detail {
      translate: 0 0;
      transition-duration: 280ms;
    }
  }
  .stack:not([data-pushed]) .detail {
    visibility: hidden;
    transition:
      translate 260ms var(--ease-drawer),
      visibility 0s 260ms;
  }
  @media (prefers-reduced-motion: reduce) {
    .page,
    .stack[data-pushed] .page {
      translate: 0 0;
      transition: opacity 120ms var(--ease-out);
    }
    .stack[data-pushed] .list {
      opacity: 0;
    }
  }
  .back {
    display: inline-flex;
    align-items: center;
    align-self: start;
    gap: var(--space-1);
    min-block-size: 44px;
    padding: 0;
    border: 0;
    border-radius: var(--radius-xs);
    background: none;
    color: var(--link-ink);
    font: var(--type-label);
    cursor: pointer;

    & :global(svg) {
      inline-size: var(--icon-md);
      block-size: var(--icon-md);
    }
    &:focus-visible {
      outline: 2px solid var(--focus-ring);
      outline-offset: 2px;
    }
  }
  .head {
    display: grid;
    grid-template-columns: var(--pv-tile, 18px) minmax(0, 1fr);
    align-items: start;
    gap: var(--space-2);
  }
  .title {
    margin: 0;
    font: var(--type-body);
    font-weight: var(--weight-strong);
    color: var(--ink-strong);
    overflow-wrap: anywhere;
    text-wrap: balance;
  }
  .name::after {
    content: " ·";
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1) var(--space-2);
    margin: 0;
    padding-inline-start: calc(var(--pv-tile, 18px) + var(--space-2));
    font: var(--type-meta);
    color: var(--ink-muted);
    font-variant-numeric: tabular-nums;

    &[data-kind="you"] {
      color: var(--status-attn-ink);
    }
    &[data-kind="fail"] {
      color: var(--status-fail-ink);
    }
  }
  .after {
    margin: 0;
    padding-inline-start: calc(var(--pv-tile, 18px) + var(--space-2));
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .line {
    padding-inline-start: calc(var(--pv-tile, 18px) + var(--space-2));
  }
  .description {
    padding-inline-start: calc(var(--pv-tile, 18px) + var(--space-2));
    font: var(--type-body);
  }
  .rows {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .report {
    margin: 0;
    padding: var(--space-2) var(--space-3);
    border-radius: 5px;
    background: var(--surface-raised);
    box-shadow: var(--shadow-tile);
    font: var(--type-meta);
    color: var(--ink-strong);
  }
  .acts {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
  }
  .open {
    display: inline-flex;
    align-items: center;
    align-self: start;
    gap: var(--space-1);
    min-block-size: 44px;
    padding: 0;
    border: 0;
    background: none;
    color: var(--link-ink);
    font: var(--type-meta);
    cursor: pointer;

    & :global(svg) {
      inline-size: 12px;
      block-size: 12px;
    }
  }
</style>
