<script lang="ts">
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Switch } from "#lib/components/ui/switch/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { IconMaximize, IconPen, IconPlay, IconTrash } from "#lib/icons.js";
  import ExactCallDisclosure from "./ExactCallDisclosure.svelte";
  import RoutineAskList from "./RoutineAskList.svelte";
  import RoutineConfirm, {
    type RoutineConfirmKind,
  } from "./RoutineConfirm.svelte";
  import {
    type RoutineAsk,
    type RoutineTileStateDescriptor,
    runOutcomeMeta,
    tileConditionText,
    tileNextAndRunsText,
  } from "./routine-format";
  import {
    type ApprovedAction,
    type EventRule,
    formatExactClock,
    formatRelAge,
    LOCAL_ZONE,
    MOCK_NOW,
    type Routine,
  } from "./routines-data";
  import type { RoutineTileCallbacks } from "./routines-state";
  import ServiceMark from "./ServiceMark.svelte";
  import StatusGlyph from "./StatusGlyph.svelte";

  interface Props extends RoutineTileCallbacks {
    asks: RoutineAsk[];
    now?: number;
    routine: Routine;
    rules: EventRule[];
    scheduledActions: ApprovedAction[];
    selectedRoutineId: string | null;
    selectedRunId: string | null;
    stale?: boolean;
    tileState: RoutineTileStateDescriptor;
  }

  let {
    routine,
    asks,
    tileState,
    rules,
    scheduledActions,
    selectedRoutineId,
    selectedRunId,
    stale = false,
    now = MOCK_NOW,
    onopenroutine,
    onopenrun,
    onfixwithcaw,
    onrunnow,
    onkeep,
    onapprove,
    ondeny,
    oncancelaction,
    onacknowledge,
    onresumerule,
    onextenddate,
    onmarkdone,
    ontogglepause,
    onedit,
    ondelete,
  }: Props = $props();

  let confirm = $state<RoutineConfirmKind>(null);

  const selected = $derived(
    selectedRoutineId === routine.id && selectedRunId === null
  );
  const isRunning = $derived(routine.status === "running");
  const isEnabled = $derived(
    routine.status !== "paused" && routine.status !== "stopped"
  );
  const doneWhen = $derived(routine.doneWhen ?? null);
  const hasHeldWork = $derived(
    doneWhen !== null &&
      doneWhen.standing !== "met" &&
      (doneWhen.heldTasks.length > 0 || doneWhen.heldSteps > 0)
  );
  const conditionText = $derived(tileConditionText(routine, rules));
  const nextAndRuns = $derived(tileNextAndRunsText(routine, now));
  const recentRuns = $derived(
    asks.length > 0 || scheduledActions.length > 0
      ? routine.runs.slice(0, 1)
      : routine.runs.slice(0, 2)
  );
  const scheduleLabel = $derived(
    routine.schedule.timezone === LOCAL_ZONE
      ? routine.schedule.rhythm
      : `${routine.schedule.rhythm} (${routine.schedule.timezone})`
  );

  function runTitleClass(runSelected: boolean, runFailed: boolean): string {
    if (runSelected) {
      return "text-selected-ink";
    }
    return runFailed ? "text-status-fail-ink" : "text-ink-muted";
  }

  function requestPauseToggle(): void {
    if (stale) {
      return;
    }
    if (
      routine.status !== "paused" &&
      routine.status !== "stopped" &&
      hasHeldWork
    ) {
      confirm = confirm === "pause-held" ? null : "pause-held";
      return;
    }
    confirm = null;
    ontogglepause(routine.id);
  }
</script>

<article
  class={[
    "flex min-w-0 flex-col gap-space-1 rounded-sm px-space-3 pt-space-2 pb-space-3 text-ink-strong shadow-tile transition-[background-color] duration-(--duration-control) ease-out",
    selected ? "bg-selected-bg" : "bg-surface-raised",
  ]}
  data-routine-state={tileState.kind}
  data-routine-tile={routine.id}
  data-selected={selected || undefined}
>
  <header class="flex min-h-c-badge-h items-center justify-between gap-space-2">
    <div class="mark-line flex min-w-0 flex-1 items-center gap-space-2">
      <Tip label={tileState.tooltip} tap>
        {#snippet children(tip)}
          <span
            {...tip}
            aria-label={tileState.ariaLabel}
            class="inline-flex flex-none items-center"
            data-box
            data-routine-state-glyph={tileState.kind}
            role="img"
          >
            <StatusGlyph glyph={tileState.glyph} tone={tileState.tone} />
          </span>
        {/snippet}
      </Tip>
      <h3
        class={[
          "m-0 min-w-0 flex-1 overflow-clip type-label text-ellipsis whitespace-nowrap",
          selected ? "text-selected-ink" : "text-ink-strong",
        ]}
        data-slot="routine-name"
        title={routine.name}
      >
        {routine.name}
      </h3>
    </div>

    <div class="flex flex-none items-center gap-space-1">
      {#if tileState.badgeLabel}
        <Badge variant={tileState.badgeVariant}>
          <span>{tileState.badgeLabel}</span>
        </Badge>
      {/if}
      <Tip label="Open {routine.name}">
        {#snippet children(tip)}
          <Button
            {...tip}
            aria-label="Open {routine.name}"
            data-open-routine={routine.id}
            icon={IconMaximize}
            onclick={() => onopenroutine(routine.id)}
            size="icon-xs"
            tone="quiet"
            variant="ghost"
          />
        {/snippet}
      </Tip>
    </div>
  </header>

  <p
    class="m-0 line-clamp-2 type-meta text-ink-muted wrap-anywhere"
    data-slot="routine-summary"
  >
    {routine.summary}
  </p>

  {#if conditionText}
    <p
      class="m-0 line-clamp-1 type-meta text-ink-subtle wrap-anywhere"
      data-slot="routine-condition"
      title={conditionText}
    >
      {conditionText}
    </p>
  {/if}

  <p
    class={[
      "m-0 type-meta wrap-anywhere",
      isRunning && routine.runningStep
        ? "text-status-live-ink"
        : "text-ink-subtle",
    ]}
    data-slot="routine-schedule"
  >
    {#if isRunning && routine.runningStep}
      <span>{routine.runningStep}</span>
    {:else}
      <span>{scheduleLabel}</span>
    {/if}
  </p>

  {#if asks.length > 0}
    <RoutineAskList
      {asks}
      {onacknowledge}
      {onapprove}
      {ondeny}
      {onextenddate}
      {onfixwithcaw}
      {onkeep}
      {onmarkdone}
      {onresumerule}
      {onrunnow}
      {routine}
      {stale}
      variant="tile"
    />
  {/if}

  {#if scheduledActions.length > 0}
    <div
      class="flex flex-col gap-space-1 border-t border-t-border-hairline pt-space-1"
    >
      {#each scheduledActions as action (action.id)}
        <div
          class="flex items-center justify-between gap-space-2"
          data-scheduled-action={action.id}
        >
          <span
            class="mark-line flex min-w-0 flex-1 items-center gap-space-1 type-meta text-ink-muted"
          >
            <ServiceMark service={action.service} size="sm" />
            <span
              class="min-w-0 flex-1 overflow-clip text-ellipsis whitespace-nowrap text-ink-strong"
              title={action.sentence}
            >
              {action.sentence}
            </span>
            <span aria-hidden="true">·</span>
            <span class="flex-none tabular-nums">{action.whenLabel}</span>
          </span>
          <Button
            disabled={stale}
            label="Cancel"
            onclick={() => oncancelaction(action.id)}
            size="xs"
            variant="outline"
          />
        </div>
        <ExactCallDisclosure {action} />
      {/each}
    </div>
  {/if}

  {#if recentRuns.length > 0}
    <ul
      class="m-0 flex list-none flex-col gap-space-row border-t border-t-border-hairline p-0 pt-space-1"
      data-slot="tile-runs"
    >
      {#each recentRuns as run (run.id)}
        {@const runMeta = runOutcomeMeta(run.outcome)}
        {@const runSelected = selectedRunId === run.id}
        {@const runFailed =
          run.outcome === "failed" || run.outcome === "could-not-check"}
        <li
          class={[
            "mark-line flex items-center gap-space-2 rounded-xs px-space-1 py-px transition-[background-color] duration-(--duration-control) ease-out",
            runSelected ? "bg-selected-bg" : "hover:bg-surface-hover",
          ]}
          data-tile-run={run.id}
        >
          <span
            class="inline-flex flex-none items-center"
            data-box
            title={runMeta.label}
          >
            <StatusGlyph glyph={runMeta.glyph} size="sm" tone={runMeta.tone} />
          </span>
          <span
            class={[
              "min-w-0 flex-1 overflow-clip type-meta text-ellipsis whitespace-nowrap",
              runTitleClass(runSelected, runFailed),
            ]}
            title={run.oneLine}
          >
            {run.oneLine}
          </span>
          <span
            class="flex-none type-meta text-ink-subtle tabular-nums"
            title={formatExactClock(run.startedAt)}
          >
            {formatRelAge(run.startedAt, now)}
          </span>
          <Tip
            label="Open run · {routine.name} ({formatRelAge(
              run.startedAt,
              now
            )})"
          >
            {#snippet children(tip)}
              <Button
                {...tip}
                aria-label="Open run from {formatRelAge(
                  run.startedAt,
                  now
                )} for {routine.name}"
                data-open-run={run.id}
                icon={IconMaximize}
                onclick={() => onopenrun(routine.id, run.id)}
                size="icon-xs"
                tone="quiet"
                variant="ghost"
              />
            {/snippet}
          </Tip>
        </li>
      {/each}
    </ul>
  {/if}

  <RoutineConfirm compact {ondelete} {ontogglepause} {routine} bind:confirm />

  <footer
    class="mt-auto flex items-center justify-between gap-space-2 border-t border-t-border-hairline pt-space-2"
  >
    <span
      class="min-w-0 overflow-clip type-meta text-ellipsis whitespace-nowrap text-ink-subtle tabular-nums"
      data-slot="routine-next-runs"
      title={nextAndRuns.exact}
    >
      {nextAndRuns.text}
    </span>

    <div class="flex flex-none items-center gap-space-1">
      {#if routine.status !== "finished"}
        <Switch
          aria-label={isEnabled
            ? `Pause ${routine.name}`
            : `Turn on ${routine.name}`}
          checked={isEnabled}
          disabled={stale}
          onCheckedChange={() => requestPauseToggle()}
          size="sm"
          title={isEnabled ? "Turn off" : "Turn on"}
        />
      {/if}
      <Tip label="Run now">
        {#snippet children(tip)}
          <Button
            {...tip}
            aria-label="Run {routine.name} now"
            disabled={stale || isRunning || routine.status === "finished"}
            icon={IconPlay}
            onclick={() => onrunnow(routine.id)}
            size="icon-xs"
            tone="quiet"
            variant="ghost"
          />
        {/snippet}
      </Tip>
      <Tip label={routine.builtIn ? "Edit schedule" : "Edit"}>
        {#snippet children(tip)}
          <Button
            {...tip}
            aria-label="Edit {routine.name}"
            disabled={stale}
            icon={IconPen}
            onclick={() => onedit(routine.id)}
            size="icon-xs"
            tone="quiet"
            variant="ghost"
          />
        {/snippet}
      </Tip>
      {#if !routine.builtIn}
        <Tip label="Delete">
          {#snippet children(tip)}
            <Button
              {...tip}
              aria-label="Delete {routine.name}"
              disabled={stale}
              icon={IconTrash}
              onclick={() => {
                confirm = confirm === "delete" ? null : "delete";
              }}
              size="icon-xs"
              tone="quiet"
              variant="ghost"
            />
          {/snippet}
        </Tip>
      {/if}
    </div>
  </footer>
</article>
