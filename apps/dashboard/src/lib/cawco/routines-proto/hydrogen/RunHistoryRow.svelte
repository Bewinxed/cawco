<script lang="ts">
  import { Button } from "#lib/components/ui/button/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { IconMaximize } from "#lib/icons.js";
  import { runOutcomeMeta } from "./routine-format";
  import {
    formatExactClock,
    formatRelAge,
    MOCK_NOW,
    type RoutineRun,
  } from "./routines-data";
  import StatusGlyph from "./StatusGlyph.svelte";

  let {
    run,
    now = MOCK_NOW,
    onopen,
  }: {
    now?: number;
    onopen: () => void;
    run: RoutineRun;
  } = $props();

  const meta = $derived(runOutcomeMeta(run.outcome));
  const age = $derived(formatRelAge(run.startedAt, now));
</script>

<li
  class="mark-line flex items-start gap-space-2 border-b border-b-border-hairline px-space-3 py-space-2 transition-[background-color] duration-(--duration-control) ease-out last:border-b-0 hover:bg-surface-hover"
  data-run-row={run.id}
>
  <span
    aria-label={meta.label}
    class="inline-flex h-lh flex-none items-center type-meta"
    data-box
    role="img"
    title={meta.label}
  >
    <StatusGlyph glyph={meta.glyph} size="sm" tone={meta.tone} />
  </span>
  <p class="m-0 min-w-0 flex-1 type-meta text-ink-strong text-pretty">
    {run.oneLine}
  </p>
  <span
    class="flex-none type-meta text-ink-subtle tabular-nums"
    title={formatExactClock(run.startedAt)}
  >
    {age}
  </span>
  <Tip label="Open this run">
    {#snippet children(tip)}
      <Button
        {...tip}
        aria-label="Open the run from {age}"
        class="-my-space-1 flex-none"
        data-open-run={run.id}
        icon={IconMaximize}
        onclick={onopen}
        size="icon-xs"
        tone="quiet"
        variant="ghost"
      />
    {/snippet}
  </Tip>
</li>
