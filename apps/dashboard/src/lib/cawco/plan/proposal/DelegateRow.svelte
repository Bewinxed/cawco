<script lang="ts">
  /**
   * A DELEGATE'S ROW (proposal): one row however much it is doing. Its tile
   * (SessionMark: its sprite on its project's hue, the corner status dot),
   * its name and the problem it is on, its time; under them its progress
   * line and one line saying where it stands. Its own steps, its report and
   * the way into its session sit behind its fold, shut until asked for; on
   * a phone in Lanes and Crew first it pushes its page instead.
   */
  import SessionMark from "#lib/cawco/SessionMark.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import {
    IconChevronRight,
    IconError,
    IconExternal,
    IconNeedsYou,
  } from "#lib/icons.js";
  // Page-local Solar glyph the proposal adds (not in $lib/icons.ts yet).
  import GlyphWaiting from "~icons/solar/hourglass-line-bold-duotone";
  import Fold from "./Fold.svelte";
  import type { Delegate } from "./fixtures";
  import ProgressLine from "./ProgressLine.svelte";
  import SubRows from "./SubRows.svelte";
  import { useView } from "./view.svelte";

  let {
    delegate,
    pushes = false,
  }: {
    delegate: Delegate;
    /** Pressing it pushes its page (a phone, Lanes and Crew first). */
    pushes?: boolean;
  } = $props();

  const view = useView();
  const open = $derived(view.opened.has(delegate.id));
  const uid = $props.id();
  const foldId = $derived(`fold-${uid}`);
  const counted = $derived(
    delegate.status === "live" || delegate.status === "attn"
  );
  const time = $derived(
    view.timeOf(
      delegate.id,
      counted ? "doing" : "done",
      delegate.startedAgo,
      delegate.took
    )
  );
  /** Where it stands, in one line: its figure and step, or what it waits on. */
  /**
   * What it needs from the person, said in full where it is opened: its
   * question, or why it failed. The row itself says the state in a word
   * and offers the act beside it, so a row is one line under its title.
   */
  const detail = $derived.by(() => {
    const { wait } = delegate;
    if (wait?.kind === "you") {
      return wait.words.split(" · ").slice(1).join(" · ");
    }
    return wait?.kind === "fail" ? wait.words : "";
  });
  const standing = $derived.by(() => {
    if (delegate.wait?.kind === "you") {
      return "Waiting on you";
    }
    if (delegate.wait?.kind === "fail") {
      return "Failed";
    }
    if (delegate.wait) {
      return delegate.wait.words;
    }
    if (delegate.status === "done") {
      return "Finished";
    }
    const { plan } = delegate;
    const now = delegate.steps.find((one) => one.state === "doing");
    return plan
      ? `${plan.done} of ${plan.total}${now ? ` · ${now.words}` : ""}`
      : "Starting";
  });

  function press(): void {
    if (pushes) {
      view.pushed.id = delegate.id;
      return;
    }
    view.toggle(delegate.id);
  }
</script>

<li class="item" data-delegate data-flip="box" data-row={delegate.id}>
  <div class="row" data-slot="plan-row" data-status={delegate.status}>
    <span class="pv-lead" data-tile="d:{delegate.id}">
      <SessionMark
        id={delegate.id}
        place={delegate.place}
        status={delegate.status}
      />
    </span>
    <button
      aria-controls={pushes ? undefined : foldId}
      aria-expanded={pushes ? undefined : open}
      class="words press-tint"
      data-slot="words"
      onclick={press}
      type="button"
    >
      <span class="sr-only">{delegate.name}: </span>
      <span class="problem">{delegate.problem}</span>
    </button>
    <span class="trail mark-line" data-slot="trail">
      <span
        aria-hidden="true"
        class="chev"
        data-box
        data-open={(open && !pushes) || undefined}
        data-slot="chevron"><IconChevronRight /></span
      >
      <span class="num time" data-num data-slot="time">{time}</span>
    </span>
    <span class="under">
      <ProgressLine {delegate} />
      <span
        class="standing mark-line"
        data-kind={delegate.wait?.kind}
        data-slot="wait"
      >
        {#if delegate.wait}
          <span class="mark-cell">
            {#if delegate.wait.kind === "you"}
              <IconNeedsYou aria-hidden="true" />
            {:else if delegate.wait.kind === "slot"}
              <GlyphWaiting aria-hidden="true" />
            {:else}
              <IconError aria-hidden="true" />
            {/if}
          </span>
        {/if}
        <span class="standing-words">{standing}</span>
      </span>
      <!-- What it needs from you, where it asks: answer its question (as
           Cofounder answers in place), or retry what failed (Relevance AI's
           Resume; every failure names its way back). -->
      {#if delegate.wait?.kind === "you"}
        <span class="act"
          ><Button
            class="touch-hit"
            label="Answer"
            size="sm"
            variant="outline"
          /></span
        >
      {:else if delegate.wait?.kind === "fail"}
        <span class="act"
          ><Button
            class="touch-hit"
            label="Retry"
            size="sm"
            variant="outline"
          /></span
        >
      {/if}
    </span>
  </div>
  {#if !pushes}
    <Fold id={foldId} {open}>
      <div class="body">
        {#if detail}
          <p class="detail" data-kind={delegate.wait?.kind}>{detail}</p>
        {/if}
        {#if delegate.steps.length > 0}
          <ul class="steps">
            <SubRows steps={delegate.steps} />
          </ul>
        {/if}
        {#if delegate.report}
          <p class="report" data-slot="report">{delegate.report}</p>
        {/if}
        <span class="acts">
          <button class="open pressable mark-line" type="button">
            <span>Open its session</span>
            <IconExternal aria-hidden="true" />
          </button>
          {#if delegate.status === "live" || delegate.status === "attn"}
            <Button label="Stop it" size="xs" variant="outline" />
          {/if}
        </span>
      </div>
    </Fold>
  {/if}
</li>

<style>
  .item {
    min-inline-size: 0;
    container: delegate-row / inline-size;
  }
  /* A row in a narrow column (under a step in Lanes' columns): the problem
     takes the row's width beside the tile, the chevron and time under it,
     and its line and where it stands the row's whole width under those, so
     a state beside its act ("Waiting on you" by Answer) keeps one line. */
  @container delegate-row (inline-size < 13rem) {
    .row {
      grid-template-columns: var(--pv-tile, 18px) minmax(0, 1fr);
      grid-template-areas:
        "lead words"
        ". trail"
        "under under";
    }
    .trail {
      block-size: auto;
    }
    .time {
      inline-size: auto;
      text-align: start;
    }
  }
  .row {
    display: grid;
    grid-template-columns: var(--pv-tile, 18px) minmax(0, 1fr) auto;
    grid-template-areas:
      "lead words trail"
      ". under under";
    column-gap: var(--space-2);
    row-gap: var(--space-1);
    align-items: start;
    min-block-size: 28px;
    padding-block: 5px;
    font: var(--type-label);
    color: var(--ink-strong);
  }
  .pv-lead {
    grid-area: lead;
    display: grid;
    place-items: center;
    block-size: max(1lh, var(--pv-tile, 18px));
  }
  .words {
    grid-area: words;
    display: block;
    min-inline-size: 0;
    margin: -2px -4px;
    padding: 2px 4px;
    border: 0;
    border-radius: var(--radius-xs);
    background: none;
    color: inherit;
    font: inherit;
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
  .problem {
    font-weight: var(--weight-body);
  }
  .row[data-status="done"] .problem {
    color: var(--ink-muted);
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
  /* The progress line, then where it stands, then its act. The line takes
     the row's room first, up to a fixed share (32%), so every delegate's
     line starts and ends on one x where there is room. Where the row is
     short the line gives way first, to its 48px floor; past that, what
     follows it goes to the next line whole, never through it, so a state
     beside its act ("Waiting on you" by Answer) never breaks. */
  .under {
    grid-area: under;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1) var(--space-2);
    min-inline-size: 0;

    & > :global([data-slot="progress-line"]) {
      flex: 1000 1 48px;
      max-inline-size: max(48px, 32%);
    }
  }
  .act {
    display: flex;
    flex: none;
    margin-inline-start: auto;
  }
  /* The question or the failure's reason, first in the fold. */
  .detail {
    margin: 0;
    font: var(--type-body);
    color: var(--ink-strong);
    overflow-wrap: anywhere;
    text-wrap: pretty;

    &[data-kind="fail"] {
      color: var(--status-fail-ink);
    }
  }
  /* Words that wrap take what the line leaves them; a state in a word or
     two keeps its own width, one line. */
  .standing {
    display: flex;
    flex: 1 1 0;
    align-items: start;
    gap: var(--space-1);
    min-inline-size: 0;
    font: var(--type-meta);
    color: var(--ink-muted);

    & :global(svg) {
      flex: none;
      inline-size: 12px;
      block-size: 1lh;
    }
    &[data-kind="you"] {
      color: var(--status-attn-ink);
    }
    &[data-kind="fail"] {
      color: var(--status-fail-ink);
    }
  }
  .standing-words {
    min-inline-size: 0;
    overflow-wrap: anywhere;
    text-wrap: pretty;
  }
  .standing:is([data-kind="you"], [data-kind="fail"]) {
    flex: none;

    & .standing-words {
      white-space: nowrap;
    }
  }
  /* What its fold holds, on the words' column. */
  .body {
    display: flex;
    flex-direction: column;
    align-items: start;
    gap: var(--space-2);
    padding-block: var(--space-1) var(--space-2);
    padding-inline-start: calc(var(--pv-tile, 18px) + var(--space-2));
  }
  .steps {
    display: flex;
    flex-direction: column;
    align-self: stretch;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  /* Its report: the subagent's raised 5px card with the tile shadow. */
  .report {
    margin: 0;
    padding: var(--space-2) var(--space-3);
    border-radius: 5px;
    background: var(--surface-raised);
    box-shadow: var(--shadow-tile);
    color: var(--ink-strong);
    font: var(--type-meta);
    text-wrap: pretty;
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
    gap: var(--space-1);
    min-block-size: 24px;
    padding: 0;
    border: 0;
    border-radius: var(--radius-xs);
    background: none;
    color: var(--link-ink);
    font: var(--type-meta);
    cursor: pointer;

    & :global(svg) {
      inline-size: 12px;
      block-size: 12px;
    }
    &:focus-visible {
      outline: 2px solid var(--focus-ring);
      outline-offset: 2px;
    }
  }
  :global([data-coarse]) .row {
    min-block-size: 44px;
    padding-block: 11px;
  }
  :global([data-coarse]) .open {
    min-block-size: 44px;
  }
</style>
