<script lang="ts">
  import { Input } from "#lib/components/ui/input/index.js";
  import {
    OptionGroup,
    OptionGroupItem,
  } from "#lib/components/ui/option-group/index.js";
  import FieldSelect from "./FieldSelect.svelte";
  import {
    CADENCES,
    describeDraftSchedule,
    isCadence,
    type RoutineDraftSubmit,
    WEEKDAY_OPTIONS,
    ZONE_OPTIONS,
  } from "./routines-state";

  interface Props {
    badCron: boolean;
    draft: RoutineDraftSubmit;
  }

  let { badCron, draft = $bindable() }: Props = $props();

  const summary = $derived(describeDraftSchedule(draft));
</script>

<section
  class="flex flex-col gap-space-3 border-t border-t-border-hairline pt-space-4"
>
  <fieldset class="m-0 flex flex-col gap-space-2 border-0 p-0">
    <legend class="type-label text-ink-strong">When it runs</legend>
    <OptionGroup
      aria-label="Schedule cadence"
      bind:value={
        () => [draft.cadence],
        (next) => {
          const [picked] = next;
          if (isCadence(picked)) {
            draft.cadence = picked;
          }
        }
      }
    >
      {#each CADENCES as opt (opt.value)}
        <OptionGroupItem value={opt.value}>{opt.label}</OptionGroupItem>
      {/each}
    </OptionGroup>
  </fieldset>

  {#if draft.cadence !== "events"}
    <div class="flex flex-wrap items-end gap-space-3">
      {#if draft.cadence === "weekly"}
        <FieldSelect
          ariaLabel="Weekday"
          items={WEEKDAY_OPTIONS}
          label="Day"
          onchange={(next) => {
            draft.weekday = next;
          }}
          value={draft.weekday}
        />
      {/if}

      {#if draft.cadence === "daily" || draft.cadence === "weekdays" || draft.cadence === "weekly"}
        <div class="flex w-32 flex-col gap-space-1">
          <label class="type-meta text-ink-muted" for="rtn-time">Time</label>
          <Input id="rtn-time" type="time" bind:value={draft.time} />
        </div>
      {/if}

      {#if draft.cadence === "custom"}
        <div class="flex flex-1 flex-col gap-space-1">
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

      <FieldSelect
        ariaLabel="Time zone"
        items={ZONE_OPTIONS}
        label="Time zone"
        onchange={(next) => {
          draft.timezone = next;
        }}
        value={draft.timezone}
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
