<script lang="ts">
  import { DAY_MS } from "@cawco/core/time";
  import type { Snippet } from "svelte";
  import StatTile from "#lib/cawco/StatTile.svelte";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { IconClose, IconSparkles } from "#lib/icons.js";
  import RoutineTile from "./RoutineTile.svelte";
  import {
    deriveRoutineAsks,
    deriveRoutineState,
    findSoonestRoutine,
    isHealthyOutcome,
    sortRoutinesForBento,
  } from "./routine-format";
  import {
    type ApprovedAction,
    type CawSuggestion,
    type EventRule,
    type EventSource,
    formatNextClock,
    MOCK_NOW,
    type Routine,
  } from "./routines-data";
  import type { RoutineTileCallbacks } from "./routines-state";

  interface Props extends RoutineTileCallbacks {
    actions: ApprovedAction[];
    headerAction?: Snippet;
    now?: number;
    ondismisssuggestion: () => void;
    onturnonsuggestion: () => void;
    routines: Routine[];
    rules: EventRule[];
    selectedRoutineId: string | null;
    selectedRunId: string | null;
    sources: EventSource[];
    stale?: boolean;
    suggestion: CawSuggestion | null;
  }

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
    ontogglepause,
    onedit,
    ondelete,
    onturnonsuggestion,
    ondismisssuggestion,
  }: Props = $props();

  const sortedTiles = $derived.by(() => {
    const items = routines.map((routine) => {
      const asks = deriveRoutineAsks({
        actions,
        now,
        routine,
        rules,
        sources,
      });
      const state = deriveRoutineState(routine, asks, now);
      return {
        asks,
        routine,
        rules: rules.filter((rule) => rule.routineId === routine.id),
        scheduledActions: actions.filter(
          (one) => one.routineId === routine.id && one.state === "approved"
        ),
        state,
      };
    });
    return sortRoutinesForBento(items);
  });

  const needsYouCount = $derived(
    sortedTiles.filter((item) => item.state.kind === "needs-you").length
  );
  const totalAsks = $derived(
    sortedTiles.reduce((sum, item) => sum + item.asks.length, 0)
  );
  const needsYouUnit = $derived.by(() => {
    if (stale) {
      return "paused";
    }
    if (totalAsks === 0) {
      return "all clear";
    }
    return `${totalAsks} ${totalAsks === 1 ? "ask" : "asks"}`;
  });
  const runningCount = $derived(
    routines.filter((one) => one.status === "running").length
  );
  const activeCount = $derived(
    routines.filter(
      (one) => one.status === "active" || one.status === "running"
    ).length
  );
  const healthyRuns24h = $derived.by(() => {
    let count = 0;
    for (const routine of routines) {
      for (const run of routine.runs) {
        if (now - run.startedAt <= DAY_MS && isHealthyOutcome(run.outcome)) {
          count += 1;
        }
      }
    }
    return count;
  });
  const soonest = $derived(findSoonestRoutine(routines));
</script>

<div class="flex flex-col gap-space-3" data-slot="routine-bento-view">
  <header
    class="flex flex-wrap items-center justify-between gap-space-2"
    data-slot="routines-header"
  >
    <div class="mark-line flex min-w-0 flex-wrap items-center gap-space-2">
      <h2 class="m-0 type-label text-ink-strong">Routines</h2>
      <Badge data-box size="tally" variant="secondary">
        <span>{routines.length}</span>
      </Badge>
      {#if soonest}
        <span class="type-meta text-ink-muted tabular-nums max-phone:hidden">
          Next: {soonest.name} ({formatNextClock(soonest.at, now)})
        </span>
      {/if}
    </div>
    {@render headerAction?.()}
  </header>

  <div
    class="grid grid-cols-(--stat-cols) gap-space-3"
    data-slot="routines-counts"
    style:--stat-cols={"repeat(auto-fit, minmax(max(min(100%, var(--spacing-c-stat-tile-min)), calc((100% - 3 * var(--spacing-space-3)) / 4)), 1fr))"}
  >
    <StatTile
      label="Needs you"
      tone={needsYouCount > 0 && !stale ? "attn" : "neutral"}
      unit={needsYouUnit}
      value={stale ? "—" : needsYouCount}
    />
    <StatTile
      label="Running"
      tone={runningCount > 0 ? "live" : "neutral"}
      unit={runningCount > 0 ? "live now" : "idle"}
      value={runningCount}
    />
    <StatTile
      label="Active"
      tone="neutral"
      unit="of {routines.length}"
      value={activeCount}
    />
    <StatTile
      label="Ran fine · 24h"
      tone={healthyRuns24h > 0 ? "done" : "neutral"}
      unit={healthyRuns24h === 1 ? "run" : "runs"}
      value={healthyRuns24h}
    />
  </div>

  <div
    class="rounded-lg bg-surface-recess p-space-1 inset-ring inset-ring-border-hairline"
    data-slot="routines-bento"
  >
    <div
      class="grid grid-cols-(--bento-cols) gap-space-1"
      style:--bento-cols={"repeat(auto-fill, minmax(max(min(100%, var(--spacing-c-board-col-min)), calc((100% - 3 * var(--spacing-space-1)) / 4)), 1fr))"}
    >
      {#each sortedTiles as item (item.routine.id)}
        <RoutineTile
          asks={item.asks}
          {now}
          {onacknowledge}
          {onapprove}
          {oncancelaction}
          {ondelete}
          {ondeny}
          {onedit}
          {onextenddate}
          {onfixwithcaw}
          {onkeep}
          {onmarkdone}
          {onopenroutine}
          {onopenrun}
          {onresumerule}
          {onrunnow}
          {ontogglepause}
          routine={item.routine}
          rules={item.rules}
          scheduledActions={item.scheduledActions}
          {selectedRoutineId}
          {selectedRunId}
          {stale}
          tileState={item.state}
        />
      {/each}

      {#if suggestion}
        <article
          class="flex min-w-0 flex-col gap-space-1 rounded-sm bg-surface-well px-space-3 pt-space-2 pb-space-3 text-ink-strong inset-ring inset-ring-border-hairline"
          data-slot="caw-suggestion"
        >
          <header
            class="flex min-h-c-badge-h items-center justify-between gap-space-2"
          >
            <div class="mark-line flex min-w-0 flex-1 items-center gap-space-2">
              <IconSparkles class="size-icon-md flex-none text-ink-muted" />
              <h3
                class="m-0 min-w-0 flex-1 overflow-clip type-label text-ellipsis whitespace-nowrap text-ink-strong"
                title={suggestion.title}
              >
                {suggestion.title}
              </h3>
            </div>
            <div class="flex flex-none items-center gap-space-1">
              <Badge variant="raised"><span>Suggested</span></Badge>
              <Tip label="Not now">
                {#snippet children(tip)}
                  <Button
                    {...tip}
                    aria-label="Dismiss suggestion"
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
          </header>

          <p class="m-0 line-clamp-2 type-meta text-ink-muted wrap-anywhere">
            {suggestion.detail}
          </p>

          <p class="m-0 type-meta text-ink-subtle tabular-nums">
            {suggestion.nextLabel}
          </p>

          <footer
            class="mt-auto flex items-center justify-between gap-space-2 border-t border-t-border-hairline pt-space-2"
          >
            <span class="type-meta text-ink-subtle">Caw suggestion</span>
            <Button
              disabled={stale}
              label="Turn on"
              onclick={onturnonsuggestion}
              size="xs"
              variant="outline"
            />
          </footer>
        </article>
      {/if}
    </div>
  </div>
</div>
