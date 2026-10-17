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

<!-- literal: 1lh -->
<div
  data-slot="detail"
  class="flex flex-col gap-space-4 px-space-3 pb-space-4 @routines-ledger-400px/routines-ledger:ps-(--detail-lead)"
  style:--detail-lead="calc(var(--c-row-lead) + var(--space-3) * 2)"
>
  <!-- literal: 72ch -->
  <div
    data-slot="instruction-wrap"
    class="flex max-w-(--measure) flex-col items-start gap-space-1"
    style:--measure="72ch"
  >
    <div
      data-slot="instruction"
      bind:this={body}
      class="type-body text-ink-strong data-clamped:max-h-(--clamp-h) data-clamped:overflow-hidden"
      data-clamped={whole ? undefined : ""}
      id="instruction-{routine.id}"
      style:--clamp-h="calc(var(--lines) * 1lh)"
      style:--lines="4"
    >
      <Markdown source={routine.prompt} />
    </div>
    {#if long}
      <Button
        data-more
        aria-controls="instruction-{routine.id}"
        aria-expanded={whole}
        class="-ms-space-2"
        onclick={() => {
          whole = !whole;
        }}
        size="xs"
        variant="ghost">{whole ? "Less" : "More"}</Button
      >
    {/if}
  </div>

  {#if recent.length > 0}
    <section
      data-slot="runs"
      aria-labelledby="runs-{routine.id}"
      class="flex flex-col gap-space-2"
    >
      <h4 class="m-0 type-label text-ink-strong" id="runs-{routine.id}">
        Recent runs
      </h4>
      <!-- literal: 6rem -->
      <!-- literal: 4.5rem -->
      <!-- literal: 11rem -->
      <!-- literal: 8rem -->
      <!-- literal: 5rem -->
      <div
        class="overflow-hidden rounded-sm border border-border-hairline bg-surface-raised"
        style:--outcome-w="11rem"
        style:--outcome-w-narrow="8rem"
        style:--took-w="5rem"
        style:--when-w="6rem"
        style:--when-w-narrow="4.5rem"
      >
        <Table.Root
          data-runs
          aria-labelledby="runs-{routine.id}"
          class="table-fixed border-separate"
        >
          <Table.Header>
            <Table.Row class="border-0 bg-surface-band">
              <!-- biome-ignore lint/a11y/noHeaderScope: Table.Head renders a real <th>; biome only sees the component tag -->
              <Table.Head
                class="h-c-toolbar-ctl w-(--when-w) px-space-3 type-label tracking-caps text-ink-muted uppercase @max-routines-ledger-399px/routines-ledger:w-(--when-w-narrow)"
                scope="col">When</Table.Head
              >
              <!-- biome-ignore lint/a11y/noHeaderScope: Table.Head renders a real <th>; biome only sees the component tag -->
              <Table.Head
                class="h-c-toolbar-ctl w-(--outcome-w) px-space-3 type-label tracking-caps text-ink-muted uppercase @max-routines-ledger-399px/routines-ledger:w-(--outcome-w-narrow)"
                scope="col">Outcome</Table.Head
              >
              <!-- biome-ignore lint/a11y/noHeaderScope: Table.Head renders a real <th>; biome only sees the component tag -->
              <Table.Head
                class="h-c-toolbar-ctl w-(--took-w) px-space-3 type-label tracking-caps text-ink-muted uppercase @max-routines-ledger-399px/routines-ledger:hidden"
                scope="col">Took</Table.Head
              >
              <!-- biome-ignore lint/a11y/noHeaderScope: Table.Head renders a real <th>; biome only sees the component tag -->
              <Table.Head
                class="h-c-toolbar-ctl px-space-3 type-label tracking-caps text-ink-muted uppercase"
                scope="col">Result</Table.Head
              >
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {#each recent as run (run.id)}
              {@const outcome = outcomeOf(run)}
              {@const result = resultOf(run)}
              {@const href = runHref(run)}
              <Table.Row
                data-run
                class="group/run"
                data-outcome={outcome.status}
              >
                <Table.Cell
                  class="h-c-btn-h-lg w-(--when-w) border-t border-border-hairline px-space-3 py-0 type-meta text-ink-muted num @max-routines-ledger-399px/routines-ledger:w-(--when-w-narrow)"
                  data-cell="when"
                >
                  <time
                    data-slot="num"
                    class="num"
                    datetime={new Date(run.startedAt).toISOString()}
                    title={exactOf(run.startedAt)}>{since(run.startedAt)}</time
                  >
                </Table.Cell>
                <Table.Cell
                  class="h-c-btn-h-lg w-(--outcome-w) border-t border-border-hairline px-space-3 py-0 type-meta text-ink-muted num @max-routines-ledger-399px/routines-ledger:w-(--outcome-w-narrow)"
                  data-cell="outcome"
                >
                  <RunStatus status={outcome.status} text={outcome.word} />
                </Table.Cell>
                <Table.Cell
                  class="h-c-btn-h-lg w-(--took-w) border-t border-border-hairline px-space-3 py-0 type-meta text-ink-muted num @max-routines-ledger-399px/routines-ledger:hidden"
                  data-cell="took"
                >
                  <span data-slot="num" class="num">{tookOf(run)}</span>
                </Table.Cell>
                <Table.Cell
                  class="h-c-btn-h-lg border-t border-border-hairline px-space-3 py-0 type-meta text-ink-muted num"
                  data-cell="result"
                >
                  {#if href}
                    <!-- literal: 3px -->
                    <a
                      data-slot="result"
                      class="block truncate text-ink-row no-underline underline-offset-(--offset) group-outcome-failed/run:text-status-fail-ink hover:text-link-ink hover:underline hover:group-outcome-failed/run:text-status-fail-ink"
                      {href}
                      style:--offset="3px"
                      title={result || undefined}>{result || "Read the run"}</a
                    >
                  {:else}
                    <span
                      data-slot="result"
                      class="block truncate text-ink-row group-outcome-failed/run:text-status-fail-ink"
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
      class="flex flex-col gap-space-2"
    >
      <h4 class="m-0 type-label text-ink-strong" id="actions-{routine.id}">
        Actions
      </h4>
      <div
        class="overflow-hidden rounded-sm border border-border-hairline bg-surface-raised"
      >
        <ActionsTable {actions} label="Actions" />
      </div>
    </section>
  {/if}
</div>

<style>
  /* residual: foreign-dom — the Markdown's own first block */
  [data-slot="instruction"] :global(.md > :first-child) {
    margin-block-start: 0;
  }

  /* residual: unmapped */
  [data-runs] {
    border-spacing: 0;
  }
  [data-slot="instruction"][data-clamped] {
    mask-image: linear-gradient(to bottom, canvas calc(100% - 1lh), transparent);
  }
</style>
