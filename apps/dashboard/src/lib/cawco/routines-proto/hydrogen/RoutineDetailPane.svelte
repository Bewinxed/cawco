<script lang="ts">
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import {
    IconMore,
    IconPause,
    IconPen,
    IconPlay,
    IconRefresh,
    IconSparkles,
    IconTick,
    IconTrash,
  } from "#lib/icons.js";
  import CommandOutputBlock from "./CommandOutputBlock.svelte";
  import InlineConfirm from "./InlineConfirm.svelte";
  import PaneFrame from "./PaneFrame.svelte";
  import RoutineAskList from "./RoutineAskList.svelte";
  import RoutineConfirm, {
    type RoutineConfirmKind,
  } from "./RoutineConfirm.svelte";
  import RoutineSpendDisclosure from "./RoutineSpendDisclosure.svelte";
  import RunHistoryRow from "./RunHistoryRow.svelte";
  import {
    deriveRoutineAsks,
    deriveRoutineState,
    doneWhenStatusSentence,
    eventRuleSentence,
    formatHeldSummary,
    nextRunSummary,
  } from "./routine-format";
  import {
    type ApprovedAction,
    type EventRule,
    type EventSource,
    formatDay,
    formatExactClock,
    formatRelAge,
    LOCAL_ZONE,
    MOCK_NOW,
    type Routine,
  } from "./routines-data";
  import type { ActionDecision } from "./routines-state";
  import ScheduledActionCard from "./ScheduledActionCard.svelte";
  import ServiceMark from "./ServiceMark.svelte";
  import StatusBadge from "./StatusBadge.svelte";

  interface Props {
    actions: ApprovedAction[];
    now?: number;
    onaction: (decision: ActionDecision, actionId: string) => void;
    onaskcaw: (prompt: string) => void;
    oncheckagain: (id: string) => void;
    onclose: () => void;
    ondelete: (id: string) => void;
    onedit: (id: string) => void;
    onextenddate: (id: string, days: number | null) => void;
    onkeep: (id: string) => void;
    onmarkdone: (id: string) => void;
    onopenrun: (routineId: string, runId: string) => void;
    onrunnow: (id: string) => void;
    ontogglepause: (id: string) => void;
    ontogglerule: (ruleId: string) => void;
    phone?: boolean;
    routine: Routine;
    rules: EventRule[];
    sources: EventSource[];
    stale?: boolean;
  }

  let {
    routine,
    actions,
    rules,
    sources,
    stale = false,
    now = MOCK_NOW,
    phone = false,
    onclose,
    onrunnow,
    ontogglepause,
    onkeep,
    onedit,
    onaskcaw,
    onmarkdone,
    oncheckagain,
    onextenddate,
    ondelete,
    onopenrun,
    onaction,
    ontogglerule,
  }: Props = $props();

  type ConfirmKind = RoutineConfirmKind | "mark-done" | "check-again";
  let confirm = $state<ConfirmKind>(null);
  let showSpend = $state(false);
  let showAllRuns = $state(false);

  let seenId = "";
  $effect(() => {
    if (seenId && seenId !== routine.id) {
      confirm = null;
      showSpend = false;
      showAllRuns = false;
    }
    seenId = routine.id;
  });

  const next = $derived(nextRunSummary(routine, now));
  const doneWhen = $derived(routine.doneWhen ?? null);
  const doneWhenLine = $derived(doneWhenStatusSentence(routine, now));
  const asks = $derived(
    deriveRoutineAsks({ actions, now, routine, rules, sources })
  );
  const status = $derived(deriveRoutineState(routine, asks, now));
  const attachedRules = $derived(
    rules.filter((rule) => rule.routineId === routine.id)
  );
  const scheduledActions = $derived(
    actions.filter(
      (one) => one.routineId === routine.id && one.state === "approved"
    )
  );
  const isRunning = $derived(
    routine.status === "running" ||
      routine.runs.some(
        (run) => run.outcome === "running" || run.outcome === "queued"
      )
  );
  const hasHeldWork = $derived(
    doneWhen !== null &&
      (doneWhen.heldTasks.length > 0 || doneWhen.heldSteps > 0)
  );
  const visibleRuns = $derived(
    showAllRuns ? routine.runs : routine.runs.slice(0, 4)
  );

  const scheduleFields = $derived.by(() => {
    const rhythmNote =
      routine.schedule.timezone === LOCAL_ZONE
        ? routine.schedule.rhythm
        : `${routine.schedule.rhythm} (${routine.schedule.timezone})`;
    let clockNote: string | null = null;
    if (routine.schedule.nextAt && !next.blocked) {
      clockNote = `${formatExactClock(routine.schedule.nextAt)} (${LOCAL_ZONE})`;
    } else if (next.secondary && next.secondary !== routine.schedule.rhythm) {
      clockNote = next.secondary;
    }
    return [
      { label: "Rhythm", note: null, primary: rhythmNote },
      {
        label: "Next run on your clock",
        note: clockNote,
        primary: next.primary,
      },
    ];
  });

  function requestPauseToggle(): void {
    if (
      routine.status !== "paused" &&
      doneWhen &&
      doneWhen.standing !== "met" &&
      hasHeldWork
    ) {
      confirm = confirm === "pause-held" ? null : "pause-held";
      return;
    }
    confirm = null;
    ontogglepause(routine.id);
  }

  function ranActionsFor(ids: string[] | undefined): ApprovedAction[] {
    if (!ids) {
      return [];
    }
    return actions.filter((one) => ids.includes(one.id) && one.state === "ran");
  }
</script>

<PaneFrame
  label={routine.name}
  {onclose}
  {phone}
  slotName="routine"
  slotValue={routine.id}
  title={routine.name}
>
  <header class="flex flex-col gap-space-2">
    <div class="flex flex-wrap items-baseline gap-space-2">
      <h2 class="m-0 type-title text-ink-strong wrap-anywhere">
        {routine.name}
      </h2>
      {#if routine.builtIn}
        <Badge variant="secondary"><span>Built-in</span></Badge>
      {/if}
    </div>

    <div class="flex flex-wrap items-center gap-space-2">
      <StatusBadge
        glyph={status.glyph}
        label={status.badgeLabel ?? status.word}
        tone={status.tone}
        variant={status.badgeVariant}
      />
      {#if routine.status === "running" && routine.runningStep}
        <span class="type-meta text-status-live-ink">
          {routine.runningStep}
        </span>
      {/if}
    </div>
  </header>

  <div class="flex flex-wrap items-center gap-space-2">
    {#if routine.status !== "finished"}
      <Button
        disabled={stale || isRunning}
        icon={IconPlay}
        label="Run now"
        onclick={() => onrunnow(routine.id)}
        size="sm"
        variant="outline"
      />
    {/if}
    <Button
      disabled={stale}
      icon={IconPen}
      label={routine.builtIn ? "Edit schedule" : "Edit"}
      onclick={() => onedit(routine.id)}
      size="sm"
      variant="outline"
    />
    <Button
      disabled={stale}
      icon={IconSparkles}
      label="Change with Caw"
      onclick={() => onaskcaw(`Change routine "${routine.name}": `)}
      size="sm"
      variant="outline"
    />

    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        {#snippet child({ props })}
          <Button
            {...props}
            aria-label="More actions for {routine.name}"
            class="ms-auto"
            disabled={stale}
            icon={IconMore}
            size="icon-sm"
            title="More actions"
            variant="outline"
          />
        {/snippet}
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="end" width="compact">
        <DropdownMenu.Item onSelect={() => onedit(routine.id)}>
          <IconPen />
          <span>{routine.builtIn ? "Edit schedule" : "Edit"}</span>
        </DropdownMenu.Item>
        {#if routine.status !== "finished"}
          <DropdownMenu.Item onSelect={requestPauseToggle}>
            {#if routine.status === "paused" || routine.status === "stopped"}
              <IconPlay />
              <span>Resume</span>
            {:else}
              <IconPause />
              <span>Pause</span>
            {/if}
          </DropdownMenu.Item>
        {/if}
        {#if !routine.builtIn}
          <DropdownMenu.Separator />
          <DropdownMenu.Item
            onSelect={() => {
              confirm = confirm === "delete" ? null : "delete";
            }}
            variant="destructive"
          >
            <IconTrash />
            <span>Delete</span>
          </DropdownMenu.Item>
        {/if}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  </div>

  {#if confirm === "pause-held" || confirm === "delete"}
    <RoutineConfirm
      attachedRuleCount={attachedRules.length}
      {ondelete}
      {ontogglepause}
      {routine}
      bind:confirm
    />
  {/if}

  {#if asks.length > 0}
    <section
      aria-labelledby="routine-needs-h"
      class="flex flex-col gap-space-2 rounded-lg border border-status-attn-glyph bg-needs-ground p-space-4"
      data-slot="routine-needs-you"
    >
      <div class="mark-line flex items-center gap-space-2">
        <h3 class="m-0 type-label text-ink-strong" id="routine-needs-h">
          Needs you
        </h3>
        {#if !stale}
          <Badge data-box size="tally" variant="attn-count">
            <span>{asks.length}</span>
          </Badge>
        {/if}
      </div>
      <RoutineAskList
        {asks}
        onacknowledge={(id) => onaction("acknowledge", id)}
        onapprove={(id) => onaction("approve", id)}
        ondeny={(id) => onaction("deny", id)}
        {onextenddate}
        onfixwithcaw={onaskcaw}
        {onkeep}
        {onmarkdone}
        onresumerule={ontogglerule}
        {onrunnow}
        {routine}
        {stale}
        variant="pane"
      />
    </section>
  {/if}

  <section
    aria-labelledby="routine-purpose-h"
    class="flex flex-col gap-space-3 border-t border-t-border-hairline pt-space-4"
  >
    <div class="flex flex-wrap items-center justify-between gap-space-2">
      <h3 class="m-0 type-label text-ink-strong" id="routine-purpose-h">
        What it's for
      </h3>
      <span class="type-meta text-ink-muted">{routine.executor.label}</span>
    </div>

    <p class="m-0 max-w-c-measure type-body text-ink-strong text-pretty">
      {routine.summary}
    </p>

    {#if routine.instructions && routine.instructions !== routine.summary}
      <p class="m-0 max-w-c-measure type-meta text-ink-muted text-pretty">
        {routine.instructions}
      </p>
    {/if}

    {#if routine.guardrail}
      <p class="m-0 max-w-c-measure type-meta text-ink-muted text-pretty">
        <span class="font-medium text-ink-strong">Only run when: </span>
        <span>{routine.guardrail}</span>
      </p>
    {/if}

    {#if doneWhen && doneWhenLine}
      <div
        class="flex flex-col gap-space-3 rounded-lg border border-border-well bg-surface-well p-space-4"
        data-slot="routine-done-when"
      >
        <div class="flex flex-wrap items-baseline justify-between gap-space-2">
          <span class="type-label text-ink-strong">Done when</span>
          <span class="type-meta text-ink-muted">
            {doneWhen.giveUpAt
              ? `Stops trying after ${formatDay(doneWhen.giveUpAt)}`
              : "Keeps checking until done"}
          </span>
        </div>

        <p class="m-0 type-body text-ink-strong text-pretty">
          {doneWhenLine}
        </p>

        {#if doneWhen.lastWords && doneWhen.lastWordsBy !== "owner"}
          <div
            class="flex flex-col gap-space-1 rounded-sm border border-border-hairline bg-surface-raised px-space-3 py-space-2"
          >
            {#if doneWhen.checkedAt}
              <span class="type-meta text-ink-muted tabular-nums">
                Latest finding · {formatRelAge(doneWhen.checkedAt, now)}
              </span>
            {/if}
            <p
              class={[
                "m-0 wrap-anywhere",
                doneWhen.lastWordsBy === "command"
                  ? "font-mono type-code text-ink-strong"
                  : "type-meta text-ink-strong",
              ]}
            >
              {doneWhen.lastWords}
            </p>
          </div>
        {/if}

        {#if doneWhen.method === "command" && doneWhen.command}
          <CommandOutputBlock
            ariaLabel="Copy check command"
            caption="Runs sandboxed on {doneWhen.machineName} without your credentials ({routine
              .limits.maxMinutes}m max)."
            code={doneWhen.command}
          />
        {/if}

        {#if hasHeldWork}
          <div
            class="flex flex-col gap-space-1 border-t border-t-border-hairline pt-space-2"
          >
            <span class="type-meta font-medium text-ink-strong">
              Waiting on this ({formatHeldSummary(
                doneWhen.heldTasks,
                doneWhen.heldSteps
              )})
            </span>
            <ul class="m-0 flex list-none flex-col gap-space-1 p-0">
              {#each doneWhen.heldTasks as task (task.id)}
                <li
                  class="flex items-center justify-between gap-space-2 rounded-sm bg-surface-raised px-space-3 py-space-2 type-meta"
                >
                  <span class="min-w-0 truncate text-ink-strong">
                    <code class="me-space-2 font-mono text-ink-subtle">
                      {task.id}
                    </code>
                    <span class="font-medium">{task.title}</span>
                  </span>
                  <span class="flex-none text-ink-muted">→ {task.stage}</span>
                </li>
              {/each}
            </ul>
          </div>
        {:else if doneWhen.standing !== "met"}
          <p class="m-0 type-meta text-ink-muted">
            Waits for a task to depend on it before checking.
          </p>
        {/if}

        <div class="flex flex-wrap items-center gap-space-2">
          {#if doneWhen.standing === "met"}
            <Button
              disabled={stale || isRunning}
              icon={IconRefresh}
              label="Check again"
              onclick={() => {
                confirm = confirm === "check-again" ? null : "check-again";
              }}
              size="sm"
              variant="outline"
            />
          {:else if doneWhen.standing !== "paused"}
            <Button
              disabled={stale}
              icon={IconTick}
              label="Mark done"
              onclick={() => {
                confirm = confirm === "mark-done" ? null : "mark-done";
              }}
              size="sm"
              variant="outline"
            />
          {/if}
        </div>

        {#if confirm === "mark-done"}
          <InlineConfirm
            confirmIcon={IconTick}
            confirmLabel="Mark done & release work"
            confirmVariant="grant"
            oncancel={() => {
              confirm = null;
            }}
            onconfirm={() => {
              confirm = null;
              onmarkdone(routine.id);
            }}
            title="Mark this done yourself?"
          >
            <p class="m-0 text-ink-muted">
              Checking stops for good and records that you marked it done.
              {#if hasHeldWork}
                Every held item goes ahead immediately ({formatHeldSummary(
                  doneWhen.heldTasks,
                  doneWhen.heldSteps
                )}), and started work stays running.
              {/if}
            </p>
          </InlineConfirm>
        {/if}

        {#if confirm === "check-again"}
          <InlineConfirm
            confirmIcon={IconRefresh}
            confirmLabel="Check again"
            oncancel={() => {
              confirm = null;
            }}
            onconfirm={() => {
              confirm = null;
              oncheckagain(routine.id);
            }}
            title="Clear done status and check again?"
            tone="control"
          >
            <p class="m-0 text-ink-muted">
              This clears the done status and runs a fresh check now. Tasks not
              yet started wait on it again while started tasks carry on.
            </p>
          </InlineConfirm>
        {/if}
      </div>
    {/if}

    <p class="m-0 type-meta text-ink-subtle">
      {#if routine.origin.by === "cawco"}
        Built-in CawCo routine.
      {:else if routine.origin.by === "session"}
        Made by session "{routine.origin.sessionTitle ?? "Agent"}" ·
        {routine.origin.kept ? "Kept by you" : "Waiting for your decision"}.
      {:else}
        Created by you.
      {/if}
    </p>
  </section>

  <section
    aria-labelledby="runs-section-h"
    class="flex flex-col gap-space-2 border-t border-t-border-hairline pt-space-4"
  >
    <header class="flex items-baseline justify-between gap-space-2">
      <h3 class="m-0 type-label text-ink-strong" id="runs-section-h">
        Recent runs
      </h3>
      <span class="type-meta text-ink-subtle tabular-nums">
        {routine.runs.length}
        {routine.runs.length === 1 ? "run" : "runs"}
      </span>
    </header>

    {#if routine.runs.length === 0}
      <p class="m-0 type-meta text-ink-muted">No runs recorded yet.</p>
    {:else}
      <ul
        class="m-0 list-none overflow-hidden rounded-lg border border-border-hairline bg-surface-raised p-0"
      >
        {#each visibleRuns as run (run.id)}
          <RunHistoryRow
            {now}
            onopen={() => onopenrun(routine.id, run.id)}
            ranActions={ranActionsFor(run.proposedActionIds)}
            {run}
          />
        {/each}
      </ul>

      {#if routine.runs.length > 4}
        <footer class="flex justify-start pt-space-1">
          <Button
            aria-expanded={showAllRuns}
            label={showAllRuns
              ? "Show fewer runs"
              : `All ${routine.runs.length} runs`}
            onclick={() => {
              showAllRuns = !showAllRuns;
            }}
            size="xs"
            variant="ghost"
          />
        </footer>
      {/if}
    {/if}
  </section>

  <section
    aria-labelledby="routine-timing-h"
    class="flex flex-col gap-space-3 border-t border-t-border-hairline pt-space-4"
    data-slot="routine-timing"
  >
    <h3 class="m-0 type-label text-ink-strong" id="routine-timing-h">
      When it runs
    </h3>
    <ul
      class="m-0 grid list-none grid-cols-1 gap-space-2 p-0 @details:grid-cols-2"
    >
      {#each scheduleFields as field (field.label)}
        <li class="flex flex-col gap-space-row">
          <span class="type-meta text-ink-muted">{field.label}</span>
          <span class="type-body text-ink-strong tabular-nums">
            {field.primary}
          </span>
          {#if field.note}
            <span class="type-meta text-ink-muted">{field.note}</span>
          {/if}
        </li>
      {/each}
    </ul>

    {#if attachedRules.length > 0}
      <ul class="m-0 flex list-none flex-col gap-space-2 p-0">
        {#each attachedRules as rule (rule.id)}
          <li
            class="flex items-center justify-between gap-space-3 rounded-sm bg-surface-recess px-space-3 py-space-2 type-meta"
            data-rule-row={rule.id}
          >
            <span
              class="mark-line flex min-w-0 flex-1 flex-wrap items-center gap-x-space-2 gap-y-space-row"
            >
              <ServiceMark service={rule.service} size="sm" />
              <span class="text-ink-strong">
                {eventRuleSentence(rule, routine.schedule.cadence !== "events")}
              </span>
              {#if !rule.enabled}
                <Badge data-box variant="attn"><span>Paused</span></Badge>
              {/if}
              {#if rule.lastDeliveredAt}
                <span class="text-ink-muted tabular-nums">
                  · last matched {formatRelAge(rule.lastDeliveredAt, now)}
                </span>
              {/if}
            </span>
            <Button
              disabled={stale}
              label={rule.enabled ? "Pause rule" : "Resume rule"}
              onclick={() => ontogglerule(rule.id)}
              size="xs"
              variant="outline"
            />
          </li>
        {/each}
      </ul>
    {/if}

    {#if scheduledActions.length > 0}
      <ul class="m-0 flex list-none flex-col gap-space-2 p-0">
        {#each scheduledActions as action (action.id)}
          <li>
            <ScheduledActionCard
              {action}
              oncancel={(id) => onaction("cancel", id)}
              {stale}
            />
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <RoutineSpendDisclosure bind:open={showSpend} {routine} />
</PaneFrame>
