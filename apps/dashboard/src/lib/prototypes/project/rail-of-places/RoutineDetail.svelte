<script lang="ts">
  /**
   * A routine in its pane (TOM task 8): what fires it and when, its acts
   * (Run now first; Pause, Change; Delete apart in the destructive look),
   * what each run does, and its recent runs down fixed columns, each with
   * its outcome glyph, when, how long, what it made and the session that
   * ran it. A failed last run is said first, with its reason.
   */
  import { railOfPlacesWords as w } from "@cawco/core/words/rail-of-places";
  import { Button } from "#lib/components/ui/button/index.js";
  import {
    IconError,
    IconPause,
    IconPen,
    IconPlay,
    IconSuccess,
    IconTranscript,
    IconTrash,
  } from "#lib/icons.js";
  import type { Routine } from "./model";

  let { routine, stale = false }: { routine: Routine; stale?: boolean } =
    $props();
</script>

<div class="flex flex-col gap-space-group">
  <p class="type-meta text-ink-muted">
    {w.firedBy}
    {routine.source.name} · {routine.schedule} · {routine.zone}
  </p>
  {#if routine.last.outcome === "failed" && routine.last.reason}
    <p
      class="rounded-md bg-status-fail-bg px-space-3 py-space-2 type-body text-status-fail-ink"
    >
      {w.outcomes.failed}
      {routine.last.ago}: {routine.last.reason}.
    </p>
  {/if}
  <div class="flex flex-wrap items-center gap-space-2">
    <Button
      variant="outline"
      size="sm"
      icon={IconPlay}
      label={w.runNow}
      disabled={stale}
    />
    <Button
      variant="ghost"
      size="sm"
      icon={IconPause}
      label={w.pause}
      disabled={stale}
    />
    <Button
      variant="ghost"
      size="sm"
      icon={IconPen}
      label={w.change}
      disabled={stale}
    />
    <Button
      class="ms-auto"
      variant="ghost"
      size="sm"
      tone="destructive"
      icon={IconTrash}
      label={w.deleteRoutine}
      disabled={stale}
    />
  </div>
  {#if stale}
    <p class="type-meta text-ink-muted">{w.runHeld}</p>
  {/if}
  <section class="flex flex-col gap-space-2">
    <h3 class="type-label text-ink-strong">{w.instruction}</h3>
    <p
      class="rounded-md bg-surface-recess px-space-3 py-space-3 type-prose text-ink-strong"
    >
      {routine.instruction}
    </p>
  </section>
  <section class="flex flex-col gap-space-2">
    <h3 class="type-label text-ink-strong">{w.recentRuns}</h3>
    <ul class="flex flex-col divide-y divide-border-hairline">
      {#each routine.runs as run (run.when)}
        <li class="flex gap-space-3 py-space-3">
          <span
            class="mark-cell grid h-c-row-mark w-c-row-lead flex-none place-items-center"
            role="img"
            aria-label={w.outcomes[run.outcome]}
          >
            {#if run.outcome === "failed"}
              <IconError
                class="size-icon-md text-status-fail-glyph"
                aria-hidden="true"
              />
            {:else}
              <IconSuccess
                class="size-icon-md text-status-done-glyph"
                aria-hidden="true"
              />
            {/if}
          </span>
          <div class="flex min-w-0 flex-1 flex-col gap-space-1">
            <div class="mark-line flex items-center gap-space-3">
              <span class="min-w-0 flex-1 type-label text-ink-row"
                >{run.when}</span
              >
              <span
                class="w-c-ledger-took-w flex-none text-end type-meta num text-ink-muted"
                >{run.took}</span
              >
              <Button
                class="flex-none"
                variant="ghost"
                size="icon-xs"
                tone="quiet"
                icon={IconTranscript}
                aria-label="{w.openSession}: {run.session}, {run.when}"
              />
            </div>
            <span class="type-body text-ink-strong">{run.produced}</span>
          </div>
        </li>
      {/each}
    </ul>
  </section>
</div>
