<script lang="ts">
  import { Input } from "#lib/components/ui/input/index.js";
  import FieldSelect from "./FieldSelect.svelte";
  import {
    describeDraftSchedule,
    isScheduleUnit,
    type RoutineDraftSubmit,
    SCHEDULE_EVERY_OPTIONS,
    SCHEDULE_UNIT_OPTIONS,
    WEEKDAY_OPTIONS,
    ZONE_OPTIONS,
  } from "./routines-state";

  interface Props {
    badCron: boolean;
    draft: RoutineDraftSubmit;
  }

  let { badCron, draft = $bindable() }: Props = $props();

  const summary = $derived(describeDraftSchedule(draft));
  const showsEvery = $derived(
    draft.scheduleUnit === "minute" ||
      draft.scheduleUnit === "hour" ||
      draft.scheduleUnit === "day" ||
      draft.scheduleUnit === "week"
  );
  const showsTime = $derived(
    draft.scheduleUnit === "day" ||
      draft.scheduleUnit === "weekday" ||
      draft.scheduleUnit === "week"
  );
  const everyItems = $derived.by(() => {
    const val = String(draft.scheduleEvery);
    if (SCHEDULE_EVERY_OPTIONS.some((one) => one.id === val)) {
      return SCHEDULE_EVERY_OPTIONS;
    }
    return [{ id: val, text: val }, ...SCHEDULE_EVERY_OPTIONS];
  });
</script>

<section
  class="flex flex-col gap-space-3 border-t border-t-border-hairline pt-space-4"
>
  <span class="type-label text-ink-strong">When it runs</span>

  <div class="flex flex-wrap items-end gap-space-2">
    {#if showsEvery}
      <FieldSelect
        ariaLabel="Repeat count"
        items={everyItems}
        label="Every"
        onchange={(next) => {
          const parsed = Number.parseInt(next, 10);
          if (Number.isFinite(parsed) && parsed >= 1) {
            draft.scheduleEvery = parsed;
          }
        }}
        value={String(draft.scheduleEvery)}
      />
    {/if}

    <FieldSelect
      ariaLabel="Schedule unit"
      items={SCHEDULE_UNIT_OPTIONS}
      label={showsEvery ? "Unit" : "Trigger"}
      onchange={(next) => {
        if (isScheduleUnit(next)) {
          draft.scheduleUnit = next;
          if (next === "weekday" || next === "events" || next === "cron") {
            draft.scheduleEvery = 1;
          }
        }
      }}
      value={draft.scheduleUnit}
    />

    {#if draft.scheduleUnit === "week"}
      <FieldSelect
        ariaLabel="Weekday"
        items={WEEKDAY_OPTIONS}
        label="On"
        onchange={(next) => {
          draft.weekday = next;
        }}
        value={draft.weekday}
      />
    {/if}

    {#if showsTime}
      <div class="flex w-32 flex-col gap-space-1">
        <label class="type-meta text-ink-muted" for="rtn-time">At</label>
        <Input id="rtn-time" type="time" bind:value={draft.time} />
      </div>
    {/if}

    {#if draft.scheduleUnit !== "events"}
      <FieldSelect
        ariaLabel="Time zone"
        items={ZONE_OPTIONS}
        label="Time zone"
        onchange={(next) => {
          draft.timezone = next;
        }}
        value={draft.timezone}
      />
    {/if}
  </div>

  {#if draft.scheduleUnit === "cron"}
    <div class="flex flex-col gap-space-1">
      <label class="type-meta text-ink-muted" for="rtn-cron">
        Five-field cron
      </label>
      <Input
        aria-invalid={badCron || undefined}
        face="mono"
        id="rtn-cron"
        placeholder="*/15 * * * *"
        bind:value={draft.cron}
      />
    </div>
  {/if}

  <aside
    class="flex flex-col gap-space-row rounded-well border border-border-well bg-surface-well px-space-3 py-space-2"
    data-slot="schedule-readback"
  >
    <span class="type-label text-ink-strong">{summary.rhythm}</span>
    <span class="type-meta text-ink-muted tabular-nums">
      Next: {summary.nextLabel}
    </span>
  </aside>
</section>
