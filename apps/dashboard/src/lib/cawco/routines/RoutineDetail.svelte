<script lang="ts">
  import type { ApprovedActionView } from "@cawco/core/actions";
  import type { CheckMachineView } from "@cawco/core/routine-kinds";
  import {
    conditionStateWords,
    conditionWords as conditions,
    verdictWords,
  } from "@cawco/core/words/conditions";
  import {
    checkOutcomeWords,
    checkWords,
  } from "@cawco/core/words/routine-check";
  import { routinesWords as words } from "@cawco/core/words/routines";
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
   *    link to the run's session where it is read whole.
   * 3. Actions, when its runs proposed any: the Approved actions table
   *    (ActionsTable), without the routine's name, which is the row's.
   *
   * A routine with a condition shows it first: its statement, where it
   * stands and its words, the day its checks stop, what waits on it, and
   * Check again and Mark met (Mark met says what it reaches before it
   * goes). Its runs' Outcome is each one's verdict: Met, Not yet, Could not
   * check.
   *
   * A routine gated by a check shows its command next, then each machine
   * it runs on: how it last went there and when, why when it failed, and
   * when its output last woke the routine. A quiet check keeps no run, so
   * these lines are all that say it ran.
   */
  import { hubSeam } from "#lib/cawco/hub-live.js";
  import { rowHref } from "#lib/cawco/links.js";
  import Markdown from "#lib/cawco/Markdown.svelte";
  import { since } from "#lib/cawco/rules.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as Table from "#lib/components/ui/table/index.js";
  import { frameObserver } from "#lib/platform/frame-observer.js";
  import { failureWords } from "#lib/platform/hub-read.js";
  import RowFault from "../RowFault.svelte";
  import ActionsTable from "./ActionsTable.svelte";
  import RunStatus, { type Status } from "./RunStatus.svelte";
  import {
    checkConditionAgain,
    markConditionMet,
    type Routine,
    type RoutineRun,
    readRoutineRuns,
  } from "./routines-api";
  import ScheduleStrip from "./ScheduleStrip.svelte";
  import { exactOf, scheduleOf } from "./schedule";

  let {
    routine,
    actions = [],
    onchanged = () => undefined,
  }: {
    routine: Routine;
    /** What its runs proposed and what came of it. */
    actions?: ApprovedActionView[];
    /** The hub changed it (its condition checked again, or marked met): the page reads it again. */
    onchanged?: () => unknown;
  } = $props();

  // --- its check -----------------------------------------------------------------

  const check = $derived(routine.check);

  /** How the check last went on a machine, in the page's status vocabulary. */
  function checkStatus(one: CheckMachineView): Status {
    switch (one.outcome) {
      case "failed":
        return "failed";
      case "quiet":
      case "woke":
        return "done";
      case "paused":
      case null:
        return "neutral";
    }
  }

  /** What the status line says: how it went and when, or that it has not run there. */
  const checkSaid = (one: CheckMachineView): string =>
    one.outcome === null || one.checkedAt === null
      ? checkWords.notYet
      : `${checkOutcomeWords[one.outcome]} · ${checkWords.checked(since(one.checkedAt))}`;

  // --- its condition -------------------------------------------------------------

  const condition = $derived(routine.condition);
  const DAY = new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  /** What it says of where it stands, by its state. */
  const conditionSaid = $derived.by((): string | null => {
    if (!condition) {
      return null;
    }
    switch (condition.state) {
      case "met":
        return condition.markedMet
          ? conditions.markedMet(since(condition.metAt))
          : conditions.metBy(condition.evidence ?? "", since(condition.metAt));
      case "timed-out":
        return conditions.timedOut(
          DAY.format(condition.deadline ?? Date.now()),
          condition.reason
        );
      case "failing":
        return conditions.failing(condition.reason);
      case "paused":
        return conditions.paused;
      case "asked":
        return conditions.askedLine(condition.reason);
      case "could-not-check":
        return condition.reason
          ? conditions.couldNotCheck(condition.reason)
          : null;
      case "checking":
        return conditions.checkingLine;
      case "not-yet":
        return condition.reason;
      case "deleted":
        return conditions.deleted;
    }
  });
  let conditionActing = $state<"again" | "met" | null>(null);
  let conditionFault = $state<string | null>(null);
  let askingMet = $state(false);
  async function conditionAct(
    act: "again" | "met",
    go: () => Promise<unknown>,
    refused: (why: string) => string
  ) {
    conditionActing = act;
    conditionFault = null;
    try {
      await go();
      askingMet = false;
      await onchanged();
    } catch (error) {
      conditionFault = refused(failureWords(error));
    } finally {
      conditionActing = null;
    }
  }

  const hub = hubSeam();

  /** The strip's now, read as the detail opens. */
  const now = Date.now();
  const scheduleWords = $derived(
    scheduleOf(routine.cron, routine.timeZone, routine.nextSlot).words
  );

  /** The runs shown first: the newest five; a button shows the rest, then reads older pages from the hub. */
  const SHOWN = 5;
  let allRuns = $state(false);
  /** Older runs read from the hub past the ones the routine carries. */
  let older = $state<RoutineRun[]>([]);
  let reading = $state(false);
  let readFault = $state<string | null>(null);
  const held = $derived([
    ...routine.runs,
    ...older.filter((one) => !routine.runs.some((run) => run.id === one.id)),
  ]);
  const recent = $derived(allRuns ? held : held.slice(0, SHOWN));
  /** Runs the routine has had that are not on screen: held, or still at the hub. */
  const unshown = $derived(Math.max(routine.runsTotal - recent.length, 0));

  /** More runs: those already held first, then the hub's next page. */
  async function showMore(): Promise<void> {
    if (!allRuns && held.length > recent.length) {
      allRuns = true;
      return;
    }
    allRuns = true;
    reading = true;
    readFault = null;
    try {
      const page = await readRoutineRuns(routine.id, held.length, hub.client);
      older = [...older, ...page.runs];
    } catch (error) {
      readFault = failureWords(error);
    } finally {
      reading = false;
    }
  }
  /** Where a run is read whole: its session; null for a run no session took. */
  const runHref = (run: RoutineRun): string | null =>
    run.instanceId ? rowHref(run.instanceId) : null;

  /** A run's outcome, in the page's status vocabulary: a check run's, its verdict. */
  function outcomeOf(run: RoutineRun): { status: Status; word: string } {
    if (run.state === "ended" && run.verdict === "stop") {
      return { status: "done", word: verdictWords.stop };
    }
    if (run.state === "ended" && run.verdict === "ask") {
      return { status: "neutral", word: verdictWords.ask };
    }
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
    if (
      run.state === "skipped" ||
      run.outcome === "failed" ||
      (run.verdict === "keep" && run.outcome === "silent")
    ) {
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
  class="flex flex-col gap-space-4 px-space-3 pb-space-4 @sm/table:ps-(--detail-lead)"
  style:--detail-lead={"calc(var(--spacing-row-compact) + var(--spacing-space-3) * 2)"}
>
  {#if condition}
    <section
      data-slot="condition"
      aria-labelledby="condition-{routine.id}"
      class="flex max-w-measure flex-col gap-space-2 pt-space-2"
    >
      <h4
        class="m-0 flex flex-wrap items-baseline gap-x-space-2 type-label text-ink-strong"
        id="condition-{routine.id}"
      >
        <span>{conditions.conditionHead}</span>
        <span class="type-meta text-ink-muted"
          >{conditionStateWords[condition.state]}</span
        >
      </h4>
      <p class="m-0 type-body text-ink-strong wrap-break-word">
        {condition.statement}
      </p>
      {#if conditionSaid}
        <p class="m-0 type-body text-ink-strong wrap-break-word">
          {conditionSaid}
        </p>
      {/if}
      <p class="m-0 flex flex-wrap gap-x-space-2 type-meta text-ink-muted">
        {#if condition.state !== "met"}
          <span
            >{condition.deadline === null
              ? conditions.noDeadline
              : conditions.stopsAt(DAY.format(condition.deadline))}</span
          >
        {/if}
        <span
          >{conditions.waitedBy(
            condition.waitedBy.length,
            condition.steps
          )}</span
        >
      </p>
      {#if askingMet}
        <p class="m-0 type-body text-ink-strong">{conditions.markMetAsk}</p>
      {/if}
      <div data-slot="acts" class="flex flex-wrap items-center gap-space-2">
        {#if askingMet}
          <Button
            label={conditions.markMet}
            onclick={() =>
              conditionAct(
                "met",
                () => markConditionMet(routine.id),
                conditions.refusedMarkMet
              )}
            pending={conditionActing === "met"}
            size="xs"
            variant="secondary"
          />
          <Button
            disabled={conditionActing !== null}
            label={conditions.cancel}
            onclick={() => {
              askingMet = false;
            }}
            size="xs"
            variant="ghost"
          />
        {:else}
          <!-- A timed-out condition keeps checking with no day to stop:
               its old one has passed (the task's view sets a new one). -->
          <Button
            disabled={conditionActing !== null}
            label={condition.state === "timed-out"
              ? conditions.keepChecking
              : conditions.checkAgain}
            onclick={() =>
              conditionAct(
                "again",
                () =>
                  checkConditionAgain(
                    routine.id,
                    condition.state === "timed-out" ? null : undefined
                  ),
                conditions.refusedCheckAgain
              )}
            pending={conditionActing === "again"}
            size="xs"
            variant="secondary"
          />
          {#if condition.state !== "met"}
            <Button
              disabled={conditionActing !== null}
              label={conditions.markMet}
              onclick={() => {
                askingMet = true;
              }}
              size="xs"
              variant="ghost"
            />
          {/if}
        {/if}
      </div>
      <RowFault reason={conditionFault} />
    </section>
  {/if}
  {#if check}
    <section
      data-slot="check"
      aria-labelledby="check-{routine.id}"
      class="flex max-w-measure flex-col gap-space-2 pt-space-2"
    >
      <h4 class="m-0 type-label text-ink-strong" id="check-{routine.id}">
        {checkWords.head}
      </h4>
      <p class="m-0 type-code liga-none text-ink-strong wrap-anywhere">
        {check.command}
      </p>
      <p class="m-0 type-meta text-ink-muted">{checkWords.hint}</p>
      {#if !check.approved}
        <p class="m-0 type-body text-status-attn">
          {checkWords.unapprovedLine}
        </p>
      {/if}
      <ul
        data-slot="check-machines"
        class="m-0 flex list-none flex-col gap-space-2 p-0"
      >
        {#each check.machines as one (one.machine)}
          <li data-machine class="flex flex-col gap-space-1">
            <span class="type-body text-ink-strong">{one.machine}</span>
            <span class="flex flex-wrap items-center gap-x-space-2">
              <RunStatus status={checkStatus(one)} text={checkSaid(one)} />
              {#if one.wokeAt !== null}
                <span class="type-meta text-ink-muted"
                  >{checkWords.woke(since(one.wokeAt))}</span
                >
              {/if}
            </span>
            {#if one.said}
              <span class="type-meta text-ink-strong wrap-break-word"
                >{one.said}</span
              >
            {/if}
          </li>
        {/each}
      </ul>
    </section>
  {/if}
  <!-- The schedule drawn whole: the row's strip with its days or hours. -->
  <div data-slot="schedule-wrap" class="max-w-measure pt-space-2">
    <ScheduleStrip
      label={scheduleWords}
      {now}
      paused={!routine.enabled}
      runs={routine.nextRuns}
    />
  </div>
  <div
    data-slot="instruction-wrap"
    class="flex max-w-measure flex-col items-start gap-space-1"
  >
    <div
      data-slot="instruction"
      bind:this={body}
      class="type-body text-ink-strong data-clamped:max-h-(--clamp-h) data-clamped:overflow-hidden data-clamped:mask-(--fade-mask)"
      data-clamped={whole ? undefined : ""}
      id="instruction-{routine.id}"
      style:--clamp-h="calc(var(--lines) * 1lh)"
      style:--fade-from="calc(100% - 1lh)"
      style:--fade-mask={"linear-gradient(to bottom, var(--color-ink-strong) var(--fade-from), transparent)"}
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
                class="w-(--w) @max-phone/table:w-(--w-narrow)"
                style="--w: calc(var(--spacing) * 24); --w-narrow: calc(var(--spacing) * 18)"
                variant="band">{words.columnWhen}</Table.Head
              >
              <Table.Head
                class="w-(--w) @max-phone/table:w-(--w-narrow)"
                style="--w: calc(var(--spacing) * 44); --w-narrow: calc(var(--spacing) * 32)"
                variant="band">{words.columnOutcome}</Table.Head
              >
              <Table.Head
                class="w-(--w)"
                style="--w: calc(var(--spacing) * 20)"
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
                  class="w-(--w) @max-phone/table:w-(--w-narrow)"
                  style="--w: calc(var(--spacing) * 24); --w-narrow: calc(var(--spacing) * 18)"
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
                  class="w-(--w) @max-phone/table:w-(--w-narrow)"
                  style="--w: calc(var(--spacing) * 44); --w-narrow: calc(var(--spacing) * 32)"
                  data-cell="outcome"
                  rule="top"
                  variant="ledger"
                >
                  <RunStatus status={outcome.status} text={outcome.word} />
                </Table.Cell>
                <Table.Cell
                  class="w-(--w)"
                  style="--w: calc(var(--spacing) * 20)"
                  data-cell="took"
                  fold="runs-took"
                  rule="top"
                  variant="ledger"
                >
                  <span data-slot="num" class="num">{tookOf(run)}</span>
                </Table.Cell>
                <Table.Cell
                  class="@max-sm/table:col-span-full @max-sm/table:row-start-1"
                  data-cell="result"
                  rule="top"
                  variant="ledger"
                >
                  {#if href}
                    <a
                      data-slot="result"
                      class="block truncate text-ink-strong no-underline group-outcome-failed/run:text-status-fail hover:underline hover:underline-offset-3 hover:not-group-outcome-failed/run:text-accent-ink"
                      {href}
                      title={result || undefined}>{result || words.readRun}</a
                    >
                  {:else}
                    <span
                      data-slot="result"
                      class="block truncate text-ink-strong group-outcome-failed/run:text-status-fail"
                      title={result || undefined}>{result}</span
                    >
                  {/if}
                </Table.Cell>
              </Table.Row>
            {/each}
          </Table.Body>
        </Table.Root>
      </div>
      {#if unshown > 0}
        <Button
          data-more-runs
          class="-ms-space-2 self-start"
          disabled={reading}
          onclick={showMore}
          size="xs"
          variant="ghost">{words.moreRuns(unshown)}</Button
        >
      {/if}
      {#if readFault}
        <p class="m-0 type-meta text-status-fail" role="status">
          {readFault}
        </p>
      {/if}
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
