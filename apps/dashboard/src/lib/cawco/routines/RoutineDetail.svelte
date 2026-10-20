<script lang="ts">
  import { type ApprovedActionView, routinesWords as words } from "@cawco/core";
  import { frameObserver } from "#lib/cawco/frame-observer.js";
  /**
   * A routine opened in place under its row: only what the row does not say
   * (the owner: "why are you repeating this info that is already up
   * there"). Its name, schedule, last and next run are the row's; the
   * schedule's strip stands here whole, with its days or hours.
   *
   * 0. Its schedule as times on a line (ScheduleStrip, labelled).
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
  import ScheduleStrip from "./ScheduleStrip.svelte";
  import { exactOf, scheduleOf } from "./schedule";

  let {
    routine,
    actions = [],
  }: {
    routine: Routine;
    /** What its runs proposed and what came of it. */
    actions?: ApprovedActionView[];
  } = $props();

  /** The strip's now, read as the detail opens. */
  const now = Date.now();
  const scheduleWords = $derived(
    scheduleOf(routine.cron, routine.timeZone, routine.nextSlot).words
  );

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
      return { status: "running", word: words.running };
    }
    if (run.state === "queued") {
      return { status: "neutral", word: words.queued };
    }
    if (run.state === "skipped") {
      return { status: "neutral", word: words.skipped };
    }
    if (run.outcome === "failed") {
      return { status: "failed", word: words.failed };
    }
    if (run.outcome === "cancelled") {
      return { status: "neutral", word: words.stopped };
    }
    if (run.outcome === "silent") {
      return { status: "done", word: words.silent };
    }
    return { status: "done", word: words.delivered };
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
      return words.tookUnder;
    }
    return minutes < 60
      ? words.tookMinutes(minutes)
      : words.tookHours(Math.floor(minutes / 60), minutes % 60);
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
    // Read now, and a change in the next frame (frameObserver): More comes
    // and goes on it.
    measure();
    const watch = frameObserver(measure);
    watch.observe(node);
    return () => watch.disconnect();
  });
</script>

<div
  data-slot="detail"
  class="flex flex-col gap-space-4 px-space-3 pb-space-4 @table-400px/table:ps-(--detail-lead)"
  style:--detail-lead="calc(var(--c-row-lead) + var(--space-3) * 2)"
>
  <!-- The schedule drawn whole: the row's strip with its days or hours. -->
  <div data-slot="schedule-wrap" class="max-w-c-measure pt-space-2">
    <ScheduleStrip
      label={scheduleWords}
      {now}
      paused={!routine.enabled}
      runs={routine.nextRuns}
    />
  </div>
  <div
    data-slot="instruction-wrap"
    class="flex max-w-c-measure flex-col items-start gap-space-1"
  >
    <div
      data-slot="instruction"
      bind:this={body}
      class="type-body text-ink-strong data-clamped:max-h-(--clamp-h) data-clamped:overflow-hidden data-clamped:mask-(--fade-mask)"
      data-clamped={whole ? undefined : ""}
      id="instruction-{routine.id}"
      style:--clamp-h="calc(var(--lines) * 1lh)"
      style:--fade-from="calc(100% - 1lh)"
      style:--fade-mask={"linear-gradient(to bottom, var(--mask-opaque) var(--fade-from), transparent)"}
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
        variant="ghost">{whole ? words.less : words.more}</Button
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
        {words.recentRuns}
      </h4>
      <div
        data-slot="runs-ledger"
        class="overflow-hidden rounded-sm border border-border-hairline bg-surface-raised"
      >
        <!-- Result is the column this ledger exists for and keeps its floor
             (c-ledger-title-min): Took folds under 576px, When and Outcome
             take their narrow widths under 496px, and under 424px each run
             is a card, its result across it, then when and outcome. -->
        <Table.Root
          data-runs
          aria-labelledby="runs-{routine.id}"
          layout="ledger"
          stacks="narrow"
          style="--card-cols: auto minmax(0, 1fr)"
        >
          <Table.Header>
            <Table.Row variant="band">
              <Table.Head
                data-slot="routine-detail-col-when"
                class="w-c-ledger-when-w @max-table-496px/table:w-c-ledger-when-w-narrow"
                variant="band">{words.columnWhen}</Table.Head
              >
              <Table.Head
                class="w-c-ledger-outcome-w @max-table-496px/table:w-c-ledger-outcome-w-narrow"
                variant="band">{words.columnOutcome}</Table.Head
              >
              <Table.Head
                class="w-c-ledger-took-w"
                fold="runs-took"
                variant="band">{words.columnTook}</Table.Head
              >
              <Table.Head variant="band">{words.columnResult}</Table.Head>
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
                variant="stacks"
              >
                <Table.Cell
                  class="w-c-ledger-when-w @max-table-496px/table:w-c-ledger-when-w-narrow"
                  data-cell="when"
                  rule="top"
                  variant="ledger"
                >
                  <time
                    data-slot="num"
                    class="num"
                    datetime={new Date(run.startedAt).toISOString()}
                    title={exactOf(run.startedAt)}>{since(run.startedAt)}</time
                  >
                </Table.Cell>
                <Table.Cell
                  class="w-c-ledger-outcome-w @max-table-496px/table:w-c-ledger-outcome-w-narrow"
                  data-cell="outcome"
                  rule="top"
                  variant="ledger"
                >
                  <RunStatus status={outcome.status} text={outcome.word} />
                </Table.Cell>
                <Table.Cell
                  class="w-c-ledger-took-w"
                  data-cell="took"
                  fold="runs-took"
                  rule="top"
                  variant="ledger"
                >
                  <span data-slot="num" class="num">{tookOf(run)}</span>
                </Table.Cell>
                <Table.Cell
                  class="@max-table-424px/table:col-span-full @max-table-424px/table:row-start-1"
                  data-cell="result"
                  rule="top"
                  variant="ledger"
                >
                  {#if href}
                    <a
                      data-slot="result"
                      class="block truncate text-ink-row no-underline group-outcome-failed/run:text-status-fail-ink hover:underline hover:underline-offset-3 hover:not-group-outcome-failed/run:text-link-ink"
                      {href}
                      title={result || undefined}>{result || words.readRun}</a
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
        {words.columnActions}
      </h4>
      <div
        class="overflow-hidden rounded-sm border border-border-hairline bg-surface-raised"
      >
        <ActionsTable {actions} label={words.columnActions} />
      </div>
    </section>
  {/if}
</div>
