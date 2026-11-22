<script lang="ts">
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { IconMaximize } from "#lib/icons.js";
  import ExactCallDisclosure from "./ExactCallDisclosure.svelte";
  import {
    runOutcomeMeta,
    type StatusTone,
    triggerLabel,
  } from "./routine-format";
  import {
    type ApprovedAction,
    formatRelAge,
    formatShortDuration,
    MOCK_NOW,
    type RoutineRun,
  } from "./routines-data";
  import StatusGlyph from "./StatusGlyph.svelte";

  const OUTCOME_TONE_INK: Record<StatusTone, string> = {
    attn: "text-status-attn-ink",
    done: "text-status-done-ink",
    fail: "text-status-fail-ink",
    idle: "text-ink-strong",
    live: "text-status-live-ink",
  };

  let {
    run,
    ranActions,
    now = MOCK_NOW,
    onopen,
  }: {
    now?: number;
    onopen: () => void;
    ranActions: ApprovedAction[];
    run: RoutineRun;
  } = $props();

  const meta = $derived(runOutcomeMeta(run.outcome));
  const age = $derived(formatRelAge(run.startedAt, now));
  const summaryMeta = $derived(
    `${age} · ${formatShortDuration(run.durationMs)} · ${run.triggerDetail ?? triggerLabel(run.trigger)}`
  );
</script>

<li
  class="flex items-start justify-between gap-space-3 border-b border-b-border-hairline px-space-3 py-space-3 transition-[background-color] duration-(--duration-control) ease-out last:border-b-0 hover:bg-surface-hover"
  data-run-row={run.id}
>
  <div class="flex min-w-0 flex-1 flex-col gap-space-1">
    <div
      class="flex flex-wrap items-center gap-x-space-2 gap-y-space-row type-meta"
    >
      <span
        class={[
          "mark-line inline-flex items-center gap-space-2 font-medium",
          OUTCOME_TONE_INK[meta.tone],
        ]}
      >
        <StatusGlyph glyph={meta.glyph} size="sm" tone={meta.tone} />
        <span>{meta.label}</span>
      </span>
      {#if run.retriedOnce}
        <Badge kind="meta" variant="secondary">
          <span>Retried once</span>
        </Badge>
      {/if}
      <span class="text-ink-muted tabular-nums">{summaryMeta}</span>
    </div>

    <p class="m-0 type-meta text-ink-muted line-clamp-2 wrap-anywhere">
      {run.oneLine}
    </p>

    {#each ranActions as action (action.id)}
      <ExactCallDisclosure {action} showOutcome={true} showResponse={true} />
    {/each}
  </div>

  <Tip label="Open run output & session">
    {#snippet children(tip)}
      <Button
        {...tip}
        aria-label="Open run from {age}"
        class="flex-none"
        data-open-run={run.id}
        icon={IconMaximize}
        onclick={onopen}
        size="icon-sm"
        tone="quiet"
        variant="ghost"
      />
    {/snippet}
  </Tip>
</li>
