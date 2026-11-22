<script lang="ts">
  import { DAY_MS } from "@cawco/core/time";
  import type { Snippet } from "svelte";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import {
    IconChevronDown,
    IconChevronRight,
    IconClose,
    IconMaximize,
    IconRepeat,
    IconSparkles,
  } from "#lib/icons.js";
  import { unfold } from "#lib/platform/motion/fold.svelte.js";
  import ExactCallDisclosure from "./ExactCallDisclosure.svelte";
  import RoutineAskList from "./RoutineAskList.svelte";
  import {
    comingUpTimeLabel,
    deriveRoutineAsks,
    findSoonestRoutine,
    type RoutineAsk,
    routineStatusMeta,
    runOutcomeMeta,
    type StatusGlyphKind,
    type StatusTone,
  } from "./routine-format";
  import {
    type ApprovedAction,
    type CawSuggestion,
    type EventRule,
    type EventSource,
    formatExactClock,
    formatNextClock,
    formatRelAge,
    MOCK_NOW,
    type Routine,
    type RoutineRun,
  } from "./routines-data";
  import ScheduledActionCard from "./ScheduledActionCard.svelte";
  import StatusGlyph from "./StatusGlyph.svelte";

  let {
    routines,
    actions,
    rules,
    sources,
    suggestion,
    selectedRoutineId,
    selectedRunId,
    stale = false,
    now = MOCK_NOW,
    headerAction,
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
    onturnonsuggestion,
    ondismisssuggestion,
  }: {
    routines: Routine[];
    actions: ApprovedAction[];
    rules: EventRule[];
    sources: EventSource[];
    suggestion: CawSuggestion | null;
    selectedRoutineId: string | null;
    selectedRunId: string | null;
    stale?: boolean;
    now?: number;
    headerAction?: Snippet;
    onopenroutine: (id: string) => void;
    onopenrun: (routineId: string, runId: string) => void;
    onfixwithcaw: (prompt: string) => void;
    onrunnow: (id: string) => void;
    onkeep: (id: string) => void;
    onapprove: (actionId: string) => void;
    ondeny: (actionId: string) => void;
    oncancelaction: (actionId: string) => void;
    onacknowledge: (actionId: string) => void;
    onresumerule: (ruleId: string) => void;
    onextenddate: (id: string, days: number | null) => void;
    onmarkdone: (id: string) => void;
    onturnonsuggestion: () => void;
    ondismisssuggestion: () => void;
  } = $props();

  let showQuiet = $state(false);

  function askLeadStatus(
    routine: Routine,
    asks: RoutineAsk[]
  ): { glyph: StatusGlyphKind; label: string; tone: StatusTone } {
    if (
      asks.some((one) => one.kind === "stopped" || one.kind === "run-failed")
    ) {
      return { glyph: "error", label: "Needs attention", tone: "fail" };
    }
    if (
      asks.some(
        (one) =>
          one.kind === "action-waiting" ||
          one.kind === "action-check" ||
          one.kind === "trigger-fault"
      )
    ) {
      return { glyph: "warning", label: "Waiting on you", tone: "attn" };
    }
    if (asks.some((one) => one.kind === "agent-unkept")) {
      return { glyph: "hourglass", label: "Keep or let expire", tone: "attn" };
    }
    return routineStatusMeta(routine, now);
  }

  const needsYouRows = $derived.by(() => {
    const list: { asks: RoutineAsk[]; routine: Routine }[] = [];
    for (const routine of routines) {
      const asks = deriveRoutineAsks({
        actions,
        now,
        routine,
        rules,
        sources,
      });
      if (asks.length > 0) {
        list.push({ asks, routine });
      }
    }
    return list;
  });

  const totalAsks = $derived(
    needsYouRows.reduce((sum, item) => sum + item.asks.length, 0)
  );

  const comingUpRows = $derived.by(() => {
    const active = routines.filter(
      (one) => one.status === "running" || one.status === "active"
    );
    const sorted = [...active].sort((a, b) => {
      const aRun = a.status === "running" ? 0 : 1;
      const bRun = b.status === "running" ? 0 : 1;
      if (aRun !== bRun) {
        return aRun - bRun;
      }
      if (a.schedule.nextAt !== null && b.schedule.nextAt !== null) {
        return a.schedule.nextAt - b.schedule.nextAt;
      }
      if (a.schedule.nextAt !== null) {
        return -1;
      }
      if (b.schedule.nextAt !== null) {
        return 1;
      }
      return a.name.localeCompare(b.name);
    });
    return sorted.map((routine) => ({
      routine,
      scheduledActions: actions.filter(
        (one) => one.routineId === routine.id && one.state === "approved"
      ),
    }));
  });

  const soonest = $derived(findSoonestRoutine(routines));

  const ranFineRuns = $derived.by(() => {
    const items: {
      ranActions: ApprovedAction[];
      routine: Routine;
      run: RoutineRun;
    }[] = [];
    for (const routine of routines) {
      for (const run of routine.runs) {
        if (now - run.startedAt > DAY_MS) {
          continue;
        }
        const healthy =
          run.outcome === "delivered" ||
          run.outcome === "nothing-to-report" ||
          run.outcome === "met" ||
          (run.outcome === "not-yet" && routine.status !== "stopped");
        if (!healthy) {
          continue;
        }
        const ranActions = run.proposedActionIds
          ? actions.filter(
              (one) =>
                run.proposedActionIds?.includes(one.id) && one.state === "ran"
            )
          : [];
        items.push({ ranActions, routine, run });
      }
    }
    return items.sort((a, b) => b.run.startedAt - a.run.startedAt);
  });

  const quietRoutines = $derived(
    routines.filter(
      (one) => one.status === "paused" || one.status === "finished"
    )
  );
</script>

{#snippet routineCardRow(
  routine: Routine,
  glyph: StatusGlyphKind,
  tone: StatusTone,
  glyphTitle: string,
  headerTrail: Snippet,
  bodyContent: Snippet,
  rowOpener?: Snippet
)}
  {@const selected = selectedRoutineId === routine.id && selectedRunId === null}
  <li
    class={[
      "flex items-start gap-space-3 border-b border-b-border-hairline px-space-3 py-space-3 transition-[background-color] duration-(--duration-control) ease-out last:border-b-0",
      selected ? "bg-selected-bg" : "hover:bg-surface-hover",
    ]}
    data-routine-row={routine.id}
    data-selected={selected || undefined}
  >
    <div
      class="flex w-c-row-lead flex-none items-center justify-center pt-space-1"
      title={glyphTitle}
    >
      <StatusGlyph {glyph} {tone} />
    </div>

    <div class="flex min-w-0 flex-1 flex-col gap-space-1">
      <div
        class="flex flex-wrap items-center justify-between gap-x-space-3 gap-y-space-row"
      >
        <span
          class={[
            "min-w-0 type-label wrap-anywhere",
            selected ? "text-selected-ink" : "text-ink-strong",
          ]}
          data-slot="routine-name"
        >
          {routine.name}
        </span>
        {@render headerTrail()}
      </div>
      {@render bodyContent()}
    </div>

    {#if rowOpener}
      <div class="flex flex-none items-center">
        {@render rowOpener()}
      </div>
    {/if}
  </li>
{/snippet}

{#snippet openRoutineIcon(routine: Routine)}
  <Tip label="Open {routine.name}">
    {#snippet children(tip)}
      <Button
        {...tip}
        aria-label="Open {routine.name}"
        data-open-routine={routine.id}
        icon={IconMaximize}
        onclick={() => onopenroutine(routine.id)}
        size="icon-sm"
        tone="quiet"
        variant="ghost"
      />
    {/snippet}
  </Tip>
{/snippet}

<div class="flex flex-col gap-space-5" data-slot="routine-list">
  {#if needsYouRows.length > 0}
    <section
      aria-labelledby="routines-group-needs"
      class="flex flex-col gap-space-2"
      data-routine-group="needs"
    >
      <div class="flex flex-wrap items-center justify-between gap-space-2">
        <div class="mark-line flex items-center gap-space-2">
          <h2 class="m-0 type-label text-ink-strong" id="routines-group-needs">
            Needs you
          </h2>
          {#if !stale}
            <Badge data-box size="tally" variant="attn-count">
              <span>{totalAsks}</span>
            </Badge>
          {/if}
        </div>
        {@render headerAction?.()}
      </div>

      <div class="overflow-hidden rounded-lg bg-surface-raised shadow-tile">
        <ul class="m-0 list-none p-0">
          {#each needsYouRows as { routine, asks } (routine.id)}
            {@const lead = askLeadStatus(routine, asks)}
            {#snippet trail()}
              {@render openRoutineIcon(routine)}
            {/snippet}
            {#snippet askBody()}
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
                variant="row"
              />
            {/snippet}
            {@render routineCardRow(
              routine,
              lead.glyph,
              lead.tone,
              lead.label,
              trail,
              askBody
            )}
          {/each}
        </ul>
      </div>
    </section>
  {:else if routines.length > 0}
    <div
      class="flex flex-wrap items-center justify-between gap-space-2"
      data-slot="nothing-needs-you"
    >
      <p class="m-0 type-body text-ink-muted tabular-nums">
        {#if stale}
          Hub offline · live asks paused.
        {:else if soonest}
          <span class="text-ink-strong">Nothing needs you.</span>
          <span>
            Next: {soonest.name} ({formatNextClock(soonest.at, now)}).
          </span>
        {:else}
          <span class="text-ink-strong">Nothing needs you.</span>
        {/if}
      </p>
      {@render headerAction?.()}
    </div>
  {/if}

  {#if comingUpRows.length > 0 || suggestion}
    <section
      aria-labelledby="routines-group-coming-up"
      class="flex flex-col gap-space-2"
      data-routine-group="coming-up"
    >
      <div class="mark-line flex items-center gap-space-2">
        <h2 class="m-0 type-label text-ink-muted" id="routines-group-coming-up">
          Coming up
        </h2>
        {#if comingUpRows.length > 0}
          <Badge data-box size="tally" variant="secondary">
            <span>{comingUpRows.length}</span>
          </Badge>
        {/if}
      </div>

      <div class="overflow-hidden rounded-lg bg-surface-raised shadow-tile">
        <ul class="m-0 list-none p-0">
          {#each comingUpRows as { routine, scheduledActions } (routine.id)}
            {@const isRunning = routine.status === "running"}
            {#snippet timeTrail()}
              <span
                class={[
                  "flex-none type-meta tabular-nums",
                  isRunning ? "text-status-live-ink" : "text-ink-strong",
                ]}
                title={routine.schedule.nextAt
                  ? formatExactClock(routine.schedule.nextAt)
                  : undefined}
              >
                {comingUpTimeLabel(routine, now)}
              </span>
            {/snippet}
            {#snippet comingBody()}
              <p
                class={[
                  "m-0 type-meta line-clamp-1 wrap-anywhere",
                  isRunning && routine.runningStep
                    ? "text-status-live-ink"
                    : "text-ink-muted",
                ]}
                data-slot="routine-summary"
              >
                {isRunning && routine.runningStep
                  ? routine.runningStep
                  : routine.summary}
              </p>
              {#each scheduledActions as action (action.id)}
                <ScheduledActionCard
                  {action}
                  oncancel={oncancelaction}
                  {stale}
                />
              {/each}
            {/snippet}
            {#snippet opener()}
              {@render openRoutineIcon(routine)}
            {/snippet}
            {@render routineCardRow(
              routine,
              isRunning ? "running" : "clock",
              isRunning ? "live" : "idle",
              isRunning ? "Running now" : "Scheduled",
              timeTrail,
              comingBody,
              opener
            )}
          {/each}

          {#if suggestion}
            <li
              class="flex items-center gap-space-3 border-t border-t-border-hairline bg-surface-recess px-space-3 py-space-3"
              data-slot="caw-suggestion"
              title={suggestion.detail}
            >
              <div
                class="flex w-c-row-lead flex-none items-center justify-center"
              >
                <IconSparkles class="size-icon-md flex-none text-ink-muted" />
              </div>
              <div
                class="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-space-3 gap-y-space-2"
              >
                <p class="m-0 min-w-0 type-meta text-ink-strong wrap-anywhere">
                  <span class="font-medium">Caw suggests:</span>
                  <span> {suggestion.title}</span>
                  <span aria-hidden="true" class="text-ink-subtle"> · </span>
                  <span class="text-ink-muted tabular-nums">
                    {suggestion.nextLabel}
                  </span>
                </p>
                <div class="flex flex-none items-center gap-space-1">
                  <Button
                    disabled={stale}
                    label="Turn on"
                    onclick={onturnonsuggestion}
                    size="xs"
                    variant="outline"
                  />
                  <Tip label="Not now">
                    {#snippet children(tip)}
                      <Button
                        {...tip}
                        aria-label="Not now"
                        disabled={stale}
                        icon={IconClose}
                        onclick={ondismisssuggestion}
                        size="icon-xs"
                        tone="quiet"
                        variant="ghost"
                      />
                    {/snippet}
                  </Tip>
                </div>
              </div>
            </li>
          {/if}
        </ul>
      </div>
    </section>
  {/if}

  {#if ranFineRuns.length > 0}
    <section
      aria-labelledby="routines-group-ran-fine"
      class="flex flex-col gap-space-2"
      data-routine-group="ran-fine"
    >
      <div class="mark-line flex items-center gap-space-2">
        <h2 class="m-0 type-label text-ink-muted" id="routines-group-ran-fine">
          Ran fine
        </h2>
        <Badge data-box size="tally" variant="secondary">
          <span>{ranFineRuns.length}</span>
        </Badge>
      </div>

      <div class="overflow-hidden rounded-lg bg-surface-raised shadow-tile">
        <ul class="m-0 list-none p-0">
          {#each ranFineRuns as item (item.run.id)}
            {@const meta = runOutcomeMeta(item.run.outcome)}
            {@const selected = selectedRunId === item.run.id}
            <li
              class={[
                "flex items-start gap-space-3 border-b border-b-border-hairline px-space-3 py-space-3 transition-[background-color] duration-(--duration-control) ease-out last:border-b-0",
                selected ? "bg-selected-bg" : "hover:bg-surface-hover",
              ]}
              data-ran-row={item.run.id}
              data-selected={selected || undefined}
            >
              <div
                class="flex w-c-row-lead flex-none items-center justify-center pt-space-1"
                title={meta.label}
              >
                <StatusGlyph glyph={meta.glyph} tone={meta.tone} />
              </div>

              <div class="flex min-w-0 flex-1 flex-col gap-space-1">
                <div
                  class="flex flex-wrap items-baseline justify-between gap-x-space-3 gap-y-space-row"
                >
                  <p
                    class="m-0 min-w-0 flex-1 type-meta text-ink-muted wrap-anywhere"
                  >
                    <span
                      class={[
                        "type-label",
                        selected ? "text-selected-ink" : "text-ink-strong",
                      ]}
                    >
                      {item.routine.name}
                    </span>
                    <span aria-hidden="true"> · </span>
                    <span>{item.run.oneLine}</span>
                  </p>
                  <span
                    class="flex-none type-meta text-ink-muted tabular-nums"
                    title={formatExactClock(item.run.startedAt)}
                  >
                    {formatRelAge(item.run.startedAt, now)}
                  </span>
                </div>

                {#each item.ranActions as action (action.id)}
                  <ExactCallDisclosure
                    {action}
                    showOutcome={true}
                    showResponse={true}
                  />
                {/each}
              </div>

              <div class="flex flex-none items-center">
                <Tip
                  label="Open run · {item.routine.name} ({formatRelAge(
                    item.run.startedAt,
                    now
                  )})"
                >
                  {#snippet children(tip)}
                    <Button
                      {...tip}
                      aria-label="Open run from {formatRelAge(
                        item.run.startedAt,
                        now
                      )} for {item.routine.name}"
                      data-open-run={item.run.id}
                      icon={IconMaximize}
                      onclick={() => onopenrun(item.routine.id, item.run.id)}
                      size="icon-sm"
                      tone="quiet"
                      variant="ghost"
                    />
                  {/snippet}
                </Tip>
              </div>
            </li>
          {/each}
        </ul>
      </div>
    </section>
  {/if}

  {#if quietRoutines.length > 0}
    <section class="flex flex-col gap-space-2" data-routine-group="quiet">
      <div>
        <button
          aria-expanded={showQuiet}
          class="mark-line press-tint inline-flex items-center gap-space-1 rounded-sm px-space-2 py-space-1 type-meta text-ink-muted transition-[background-color,color] duration-(--duration-control) ease-out hover:bg-surface-hover hover:text-ink-strong"
          data-slot="toggle-quiet"
          onclick={() => {
            showQuiet = !showQuiet;
          }}
          type="button"
        >
          {#if showQuiet}
            <IconChevronDown class="size-icon-sm flex-none" />
          {:else}
            <IconChevronRight class="size-icon-sm flex-none" />
          {/if}
          <span class="tabular-nums">
            {quietRoutines.length} paused or done · {showQuiet
              ? "hide"
              : "show"}
          </span>
        </button>
      </div>

      {#if showQuiet}
        <div
          class="overflow-hidden rounded-lg bg-surface-raised shadow-tile"
          transition:unfold
        >
          <ul class="m-0 list-none p-0">
            {#each quietRoutines as routine (routine.id)}
              {@const status = routineStatusMeta(routine, now)}
              {#snippet quietTrail()}
                <span class="flex-none type-meta text-ink-muted">
                  {status.label}
                </span>
              {/snippet}
              {#snippet quietBody()}
                <p
                  class="m-0 type-meta text-ink-muted line-clamp-1 wrap-anywhere"
                >
                  {routine.summary}
                </p>
              {/snippet}
              {#snippet opener()}
                {@render openRoutineIcon(routine)}
              {/snippet}
              {@render routineCardRow(
                routine,
                status.glyph,
                status.tone,
                status.label,
                quietTrail,
                quietBody,
                opener
              )}
            {/each}
          </ul>
        </div>
      {/if}
    </section>
  {/if}

  {#if routines.length === 0}
    <div
      class="mark-line flex items-center gap-space-2 type-body text-ink-muted"
    >
      <IconRepeat class="size-icon-md flex-none" />
      <span>No routines yet.</span>
    </div>
  {/if}
</div>
