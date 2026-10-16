<script lang="ts">
  import type { ApprovedActionView } from "@cawco/core";
  /**
   * A routine opened in place under its row: only what the row does not say
   * (the owner: "why are you repeating this info that is already up
   * there"). Its name, schedule, last and next run are the row's.
   *
   * 1. Its instruction, as the markdown it is written in (the messages'
   *    Markdown, at body size), four lines at most until More.
   * 2. Recent runs, the newest five, as a ledger (the routines table's own
   *    band and rows): When (how long ago, the exact time on hover),
   *    Outcome (the page's status glyph and its word), Took, and Result,
   *    the words the run set (Caw's `routine_result`, a delegate's
   *    `finish_item`, the hub's reason for a failure or an empty run), a
   *    link to the run's thread where it is read whole.
   * 3. Actions, when its runs proposed any: the Approved actions table
   *    (ActionsTable), without the routine's name, which is the row's.
   */
  import { since } from "#lib/cawco/rules.js";
  import { threadHref } from "#lib/cawco/thread-tabs.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Markdown } from "#lib/components/ui/markdown/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Table from "#lib/components/ui/table/index.js";
  import ActionsTable from "./ActionsTable.svelte";
  import RunStatus, { type Status } from "./RunStatus.svelte";
  import type { Routine, RoutineRun } from "./routines-api";
  import { exactOf } from "./schedule";

  let {
    routine,
    actions = [],
  }: {
    routine: Routine;
    /** What its runs proposed and what came of it. */
    actions?: ApprovedActionView[];
  } = $props();

  /** The runs shown: the newest five. */
  const SHOWN = 5;
  const recent = $derived(routine.runs.slice(0, SHOWN));
  /** Where a run is read whole: its own thread, else the routine's, where its result is noted. */
  const runHref = (run: RoutineRun): string | null => {
    const thread = run.threadId ?? routine.threadId;
    return thread ? threadHref(thread) : null;
  };

  /** A run's outcome, in the page's status vocabulary. */
  function outcomeOf(run: RoutineRun): { status: Status; word: string } {
    if (run.state === "running" || run.state === "starting") {
      return { status: "running", word: "Running" };
    }
    if (run.state === "queued") {
      return { status: "neutral", word: "Queued" };
    }
    if (run.state === "skipped") {
      return { status: "neutral", word: "Skipped" };
    }
    if (run.outcome === "failed") {
      return { status: "failed", word: "Failed" };
    }
    if (run.outcome === "cancelled") {
      return { status: "neutral", word: "Stopped" };
    }
    if (run.outcome === "silent") {
      return { status: "done", word: "Nothing to report" };
    }
    return { status: "done", word: "Delivered" };
  }

  /** What the run set, or why it had nothing. */
  function resultOf(run: RoutineRun): string {
    if (run.state === "skipped" || run.outcome === "failed") {
      return run.reason ?? "";
    }
    return run.output ?? run.reason ?? "";
  }

  /** How long it ran: "4m", "1h 5m", "<1m"; nothing while it goes. */
  function tookOf(run: RoutineRun): string {
    if (run.endedAt === null) {
      return "";
    }
    const minutes = Math.round((run.endedAt - run.startedAt) / 60_000);
    if (minutes < 1) {
      return "<1m";
    }
    return minutes < 60
      ? `${minutes}m`
      : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  }

  // --- the instruction's clamp --------------------------------------------------

  let body = $state<HTMLElement | null>(null);
  /** It runs past four lines: More shows the rest. */
  let long = $state(false);
  let whole = $state(false);
  $effect(() => {
    const node = body;
    if (!node || whole) {
      return;
    }
    const measure = () => {
      long = node.scrollHeight > node.clientHeight + 1;
    };
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(node);
    return () => watch.disconnect();
  });
</script>

<div data-slot="detail" class="detail">
  <div data-slot="instruction-wrap" class="instruction-wrap">
    <div
      data-slot="instruction"
      bind:this={body}
      class="instruction"
      data-clamped={whole ? undefined : ""}
      id="instruction-{routine.id}"
    >
      <Markdown source={routine.prompt} />
    </div>
    {#if long}
      <Button
        data-more
        aria-controls="instruction-{routine.id}"
        aria-expanded={whole}
        class="more"
        onclick={() => {
          whole = !whole;
        }}
        size="xs"
        variant="ghost">{whole ? "Less" : "More"}</Button
      >
    {/if}
  </div>

  {#if recent.length > 0}
    <section data-slot="runs" aria-labelledby="runs-{routine.id}" class="runs">
      <h4 class="runs-head" id="runs-{routine.id}">Recent runs</h4>
      <div class="runs-ledger">
        <Table.Root
          data-runs
          aria-labelledby="runs-{routine.id}"
          class="runs table-fixed"
        >
          <Table.Header>
            <Table.Row class="band border-0">
              <!-- biome-ignore lint/a11y/noHeaderScope: Table.Head renders a real <th>; biome only sees the component tag -->
              <Table.Head class="col-when" scope="col">When</Table.Head>
              <!-- biome-ignore lint/a11y/noHeaderScope: Table.Head renders a real <th>; biome only sees the component tag -->
              <Table.Head class="col-outcome" scope="col">Outcome</Table.Head>
              <!-- biome-ignore lint/a11y/noHeaderScope: Table.Head renders a real <th>; biome only sees the component tag -->
              <Table.Head class="col-took" scope="col">Took</Table.Head>
              <!-- biome-ignore lint/a11y/noHeaderScope: Table.Head renders a real <th>; biome only sees the component tag -->
              <Table.Head class="col-result" scope="col">Result</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {#each recent as run (run.id)}
              {@const outcome = outcomeOf(run)}
              {@const result = resultOf(run)}
              {@const href = runHref(run)}
              <Table.Row data-run class="run" data-outcome={outcome.status}>
                <Table.Cell class="col-when" data-cell="when">
                  <time
                    data-slot="num"
                    class="num"
                    datetime={new Date(run.startedAt).toISOString()}
                    title={exactOf(run.startedAt)}>{since(run.startedAt)}</time
                  >
                </Table.Cell>
                <Table.Cell class="col-outcome" data-cell="outcome">
                  <RunStatus status={outcome.status} text={outcome.word} />
                </Table.Cell>
                <Table.Cell class="col-took" data-cell="took">
                  <span data-slot="num" class="num">{tookOf(run)}</span>
                </Table.Cell>
                <Table.Cell class="col-result" data-cell="result">
                  {#if href}
                    <a
                      data-slot="result"
                      class="result"
                      {href}
                      title={result || undefined}>{result || "Read the run"}</a
                    >
                  {:else}
                    <span
                      data-slot="result"
                      class="result"
                      title={result || undefined}>{result}</span
                    >
                  {/if}
                </Table.Cell>
              </Table.Row>
            {/each}
          </Table.Body>
        </Table.Root>
      </div>
    </section>
  {/if}

  {#if actions.length > 0}
    <section
      data-slot="runs"
      aria-labelledby="actions-{routine.id}"
      class="runs"
    >
      <h4 class="runs-head" id="actions-{routine.id}">Actions</h4>
      <div class="runs-ledger">
        <ActionsTable {actions} label="Actions" />
      </div>
    </section>
  {/if}
</div>

<style>
  .detail {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: 0 var(--space-3) var(--space-4);
  }
  /* On a ledger 400px wide or more, on the row's name column (the state
     column, then the name cell's own inset). */
  @container routines-ledger (min-width: 400px) {
    .detail {
      padding-inline-start: calc(var(--c-row-lead) + var(--space-3) * 2);
    }
  }

  /* The instruction: markdown at body size, 72ch, four lines until More. */
  .instruction-wrap {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-1);
    max-inline-size: 72ch;
  }
  .instruction {
    --lines: 4;
    font: var(--type-body);
    color: var(--ink-strong);
  }
  .instruction[data-clamped] {
    max-block-size: calc(var(--lines) * 1lh);
    overflow: hidden;
    mask-image: linear-gradient(to bottom, #000 calc(100% - 1lh), transparent);
  }
  .instruction :global(.md > :first-child) {
    margin-block-start: 0;
  }
  .instruction-wrap :global(.more) {
    margin-inline-start: calc(var(--space-2) * -1);
  }

  .runs {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .runs-head {
    margin: 0;
    font: var(--type-label);
    color: var(--ink-strong);
  }
  /* The routines table's band and rows, on the well. */
  .runs-ledger {
    overflow: hidden;
    border: 1px solid var(--border-hairline);
    border-radius: var(--radius-sm);
    background: var(--surface-raised);
  }
  .runs-ledger :global(table.runs) {
    border-collapse: separate;
    border-spacing: 0;
  }
  .runs-ledger :global(tr.band) {
    background: var(--surface-band);
  }
  .runs-ledger :global(tr.band th) {
    block-size: var(--c-toolbar-ctl);
    padding-inline: var(--space-3);
    font: var(--type-label);
    letter-spacing: var(--track-caps);
    text-transform: uppercase;
    color: var(--ink-muted);
  }
  .runs-ledger :global(tr.run td) {
    block-size: var(--c-btn-h-lg);
    padding-block: 0;
    padding-inline: var(--space-3);
    border-block-start: 1px solid var(--border-hairline);
    font: var(--type-meta);
    font-variant-numeric: tabular-nums;
    color: var(--ink-muted);
  }
  .runs-ledger :global(.col-when) {
    inline-size: 6rem;
  }
  .runs-ledger :global(.col-outcome) {
    inline-size: 11rem;
  }
  .runs-ledger :global(.col-took) {
    inline-size: 5rem;
  }
  .result {
    display: block;
    overflow: hidden;
    color: var(--ink-row);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  a.result {
    text-decoration: none;
  }
  @media (hover: hover) {
    a.result:hover {
      color: var(--link-ink);
      text-decoration: underline;
      text-underline-offset: 3px;
    }
  }
  .runs-ledger :global(tr.run[data-outcome="failed"] .result) {
    color: var(--status-fail-ink);
  }
  /* A phone: Took gives its room to the result. */
  @container routines-ledger (max-width: 399px) {
    .runs-ledger :global(.col-took) {
      display: none;
    }
    .runs-ledger :global(.col-when) {
      inline-size: 4.5rem;
    }
    .runs-ledger :global(.col-outcome) {
      inline-size: 8rem;
    }
  }
</style>
