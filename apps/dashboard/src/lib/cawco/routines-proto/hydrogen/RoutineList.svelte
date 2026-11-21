<script lang="ts">
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import { IconExternal, IconRepeat } from "#lib/icons.js";
  import {
    nextRunSummary,
    routineStatusMeta,
    runOutcomeMeta,
    type StatusGlyphKind,
    type StatusTone,
  } from "./routine-format";
  import {
    daysUntil,
    formatExactClock,
    formatNextClock,
    formatRelAge,
    MOCK_NOW,
    type Routine,
    routineNeedsAttention,
  } from "./routines-data";
  import StatusGlyph from "./StatusGlyph.svelte";

  let {
    routines,
    selectedId,
    stale = false,
    now = MOCK_NOW,
    onopen,
    onkeep,
  }: {
    routines: Routine[];
    selectedId: string | null;
    stale?: boolean;
    now?: number;
    onopen: (id: string) => void;
    onkeep: (id: string) => void;
  } = $props();

  const attention = $derived(
    routines.filter((routine) => routineNeedsAttention(routine))
  );
  const active = $derived(
    routines.filter(
      (routine) =>
        !routineNeedsAttention(routine) &&
        (routine.status === "running" || routine.status === "active")
    )
  );
  const quiet = $derived(
    routines.filter(
      (routine) =>
        !routineNeedsAttention(routine) &&
        (routine.status === "paused" || routine.status === "finished")
    )
  );
  const runningCount = $derived(
    routines.filter((routine) => routine.status === "running").length
  );

  /** Soonest scheduled run across active routines (T3: tell a quiet project from a busy one). */
  const soonest = $derived.by(() => {
    let pick: { at: number; name: string } | null = null;
    for (const routine of routines) {
      if (
        (routine.status === "active" || routine.status === "running") &&
        routine.schedule.nextAt !== null &&
        (pick === null || routine.schedule.nextAt < pick.at)
      ) {
        pick = { at: routine.schedule.nextAt, name: routine.name };
      }
    }
    return pick;
  });

  const sections = $derived(
    [
      {
        id: "attention",
        label: "Needs attention",
        rows: attention,
        urgent: true,
      },
      {
        id: "active",
        label: "Active",
        rows: active,
        urgent: false,
      },
      {
        id: "quiet",
        label: "Paused & finished",
        rows: quiet,
        urgent: false,
      },
    ].filter((section) => section.rows.length > 0)
  );

  function lastRunBrief(routine: Routine): {
    age: string | null;
    glyph: StatusGlyphKind;
    label: string;
    tone: StatusTone;
  } {
    const [latest] = routine.runs;
    if (!latest) {
      return {
        glyph: "neutral",
        tone: "idle",
        label: "No runs yet",
        age: null,
      };
    }
    const meta = runOutcomeMeta(latest.outcome);
    return {
      glyph: meta.glyph,
      tone: meta.tone,
      label: meta.label,
      age: formatRelAge(latest.startedAt, now),
    };
  }

  function lastLabelTone(tone: StatusTone): string {
    if (tone === "fail") {
      return "text-status-fail-ink";
    }
    if (tone === "live") {
      return "text-status-live-ink";
    }
    return "text-ink-strong";
  }
</script>

<div class="@container flex flex-col gap-space-5" data-slot="routine-list">
  <!-- Quiet summary strip: live health and next upcoming run on your clock (T1, T3). -->
  <div
    class="mark-line flex flex-wrap items-center gap-x-space-3 gap-y-space-1 type-meta text-ink-muted"
    data-slot="routines-summary"
  >
    <span class="tabular-nums text-ink-strong">
      {routines.length}
      {routines.length === 1 ? "routine" : "routines"}
    </span>
    {#if stale}
      <span aria-hidden="true">·</span>
      <span class="text-status-attn-ink">
        Last read from hub · live counts paused
      </span>
    {:else}
      {#if attention.length > 0}
        <span aria-hidden="true">·</span>
        <span class="text-status-attn-ink tabular-nums">
          {attention.length}
          {attention.length === 1 ? "needs attention" : "need attention"}
        </span>
      {:else}
        <span aria-hidden="true">·</span>
        <span>All healthy</span>
      {/if}
      {#if runningCount > 0}
        <span aria-hidden="true">·</span>
        <span
          class="mark-line inline-flex items-center gap-space-1 text-status-live-ink"
          data-box
        >
          <LiveDot size="dot" tone="live" />
          <span class="tabular-nums">{runningCount} running now</span>
        </span>
      {/if}
      {#if soonest}
        <span aria-hidden="true">·</span>
        <span class="tabular-nums">
          Next up: {soonest.name} ({formatNextClock(soonest.at, now)})
        </span>
      {/if}
    {/if}
  </div>

  {#each sections as section (section.id)}
    <section
      aria-labelledby="routines-group-{section.id}"
      class="flex flex-col gap-space-2"
      data-routine-group={section.id}
    >
      <div class="mark-line flex items-center gap-space-2">
        <h2
          class="m-0 type-label text-ink-muted"
          id="routines-group-{section.id}"
        >
          {section.label}
        </h2>
        {#if !(stale && section.urgent)}
          <Badge
            data-box
            size="tally"
            variant={section.urgent ? "attn-count" : "secondary"}
          >
            <span>{section.rows.length}</span>
          </Badge>
        {/if}
      </div>

      <div
        class="overflow-hidden rounded-lg bg-surface-raised shadow-tile"
        data-slot="routine-ledger"
        style:--routine-cols={"var(--spacing-c-row-lead) minmax(0, 1fr) var(--spacing-c-routine-time-w) var(--spacing-c-routine-time-w) var(--spacing-c-btn-h-sm)"}
      >
        <!-- Column header band on wider containers so times align on fixed columns. -->
        <div
          aria-hidden="true"
          class="hidden border-b border-b-border-hairline bg-surface-recess px-space-3 py-space-2 type-meta text-ink-muted @table-576px:grid @table-576px:grid-cols-(--routine-cols) @table-576px:items-center @table-576px:gap-x-space-3"
        >
          <span></span>
          <span>Routine</span>
          <span>Last run</span>
          <span>Next run</span>
          <span></span>
        </div>

        <ul class="m-0 list-none p-0">
          {#each section.rows as routine (routine.id)}
            {@const status = routineStatusMeta(routine, now)}
            {@const last = lastRunBrief(routine)}
            {@const next = nextRunSummary(routine, now)}
            {@const selected = selectedId === routine.id}
            {@const unkeptAgent =
              routine.origin.by === "session" && !routine.origin.kept}
            <li
              class={[
                "group/row flex min-h-c-row-h items-start gap-space-3 border-b border-b-border-hairline px-space-3 py-space-3 transition-[background-color] duration-(--duration-control) ease-out last:border-b-0 @table-576px:grid @table-576px:grid-cols-(--routine-cols) @table-576px:items-center",
                selected ? "bg-selected-bg" : "hover:bg-surface-hover",
              ]}
              data-routine-row={routine.id}
              data-selected={selected || undefined}
            >
              <!-- Lead column: status glyph, never colour alone. -->
              <div
                class="flex w-c-row-lead flex-none items-center justify-center pt-space-1 @table-576px:pt-0"
                title={status.label}
              >
                <StatusGlyph glyph={status.glyph} tone={status.tone} />
              </div>

              <!-- Role 1 (name) + Role 2 (plain one-sentence description). Pressing text never opens. -->
              <div class="flex min-w-0 flex-1 flex-col gap-space-row">
                <div
                  class="mark-line flex flex-wrap items-center gap-x-space-2 gap-y-space-row"
                >
                  <span
                    class={[
                      "min-w-0 overflow-clip text-ellipsis whitespace-nowrap type-label",
                      selected ? "text-selected-ink" : "text-ink-strong",
                    ]}
                    data-slot="routine-name"
                  >
                    {routine.name}
                  </span>
                  {#if routine.builtIn}
                    <Badge data-box kind="meta" variant="secondary">
                      <span>Built-in</span>
                    </Badge>
                  {:else if unkeptAgent && routine.origin.expiresAt}
                    <Badge data-box variant="attn">
                      <span>
                        Turns off in {daysUntil(routine.origin.expiresAt, now)}d
                      </span>
                    </Badge>
                  {/if}
                </div>
                <p
                  class="m-0 type-meta text-ink-muted line-clamp-1 wrap-anywhere"
                  data-slot="routine-summary"
                >
                  {routine.summary}
                </p>

                <!-- Compact inline facts on narrow containers (phone & 600px dock). -->
                <div
                  class="mt-space-1 flex flex-wrap items-center gap-x-space-3 gap-y-space-1 type-meta text-ink-muted @table-576px:hidden"
                >
                  <span class="mark-line inline-flex items-center gap-space-1">
                    <StatusGlyph
                      glyph={last.glyph}
                      size="sm"
                      tone={last.tone}
                    />
                    <span class="tabular-nums">
                      {last.label}{last.age ? ` · ${last.age}` : ""}
                    </span>
                  </span>
                  <span
                    class={[
                      "tabular-nums",
                      next.blocked ? "text-ink-subtle" : "text-ink-muted",
                    ]}
                  >
                    {next.primary}
                  </span>
                  {#if unkeptAgent}
                    <Button
                      disabled={stale}
                      label="Keep"
                      onclick={() => onkeep(routine.id)}
                      size="xs"
                      variant="outline"
                    />
                  {/if}
                </div>
              </div>

              <!-- Role 3 (Last run) on wider screens. -->
              <div
                class="hidden min-w-0 flex-col gap-space-row @table-576px:flex"
                data-slot="routine-last"
              >
                <div class="mark-line flex items-center gap-space-1">
                  <StatusGlyph glyph={last.glyph} size="sm" tone={last.tone} />
                  <span
                    class={[
                      "min-w-0 overflow-clip text-ellipsis whitespace-nowrap type-meta",
                      lastLabelTone(last.tone),
                    ]}
                  >
                    {last.label}
                  </span>
                </div>
                {#if last.age}
                  <span class="type-meta text-ink-muted tabular-nums">
                    {last.age}
                  </span>
                {/if}
              </div>

              <!-- Role 4 (Next run on your clock, or why it won't fire) on wider screens. -->
              <div
                class="hidden min-w-0 flex-col gap-space-row @table-576px:flex"
                data-slot="routine-next"
                title={routine.schedule.nextAt
                  ? formatExactClock(routine.schedule.nextAt)
                  : undefined}
              >
                <span
                  class={[
                    "min-w-0 truncate type-meta tabular-nums",
                    next.blocked ? "text-ink-muted" : "text-ink-strong",
                  ]}
                >
                  {next.primary}
                </span>
                {#if next.secondary}
                  <span class="min-w-0 truncate type-meta text-ink-subtle">
                    {next.secondary}
                  </span>
                {/if}
              </div>

              <!-- Strict open control: IconExternal only, never clicking the row title. -->
              <div class="flex flex-none items-center justify-end">
                <Button
                  aria-label="Open {routine.name}"
                  data-open-routine={routine.id}
                  icon={IconExternal}
                  onclick={() => onopen(routine.id)}
                  size="icon-sm"
                  title="Open {routine.name}"
                  tone="quiet"
                  variant="ghost"
                />
              </div>
            </li>
          {/each}
        </ul>
      </div>
    </section>
  {/each}

  {#if routines.length === 0}
    <div
      class="mark-line flex items-center gap-space-2 type-body text-ink-muted"
    >
      <IconRepeat class="size-icon-md flex-none" />
      <span>No routines in this project yet.</span>
    </div>
  {/if}
</div>
