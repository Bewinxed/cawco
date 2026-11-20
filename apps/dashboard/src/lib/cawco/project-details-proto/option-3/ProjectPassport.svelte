<script lang="ts">
  /**
   * Read-only Project Passport body: Group 1 Standing policy (Who decides +
   * Review before done, Finished work, Account, Large-file storage), then
   * Group 2 Live fleet & mirror (every place at once, linked repositories,
   * and task mirror). Zero form controls, zero coral, inline faults only.
   */
  import { IconCloudCross } from "#lib/icons.js";
  import PassportPlaces from "./PassportPlaces.svelte";
  import PassportPolicy from "./PassportPolicy.svelte";
  import type { PassportActs, PassportReading } from "./records";
  import TaskMirror from "./TaskMirror.svelte";
  import { passportWords as words } from "./words";

  let {
    reading,
    acts,
    narrow = false,
  }: {
    reading: PassportReading;
    acts: PassportActs;
    narrow?: boolean;
  } = $props();

  const hubAway = $derived(reading.hubAwaySince !== null);
</script>

<div class="flex min-w-0 flex-col gap-space-3 px-space-4 py-space-3">
  {#if reading.hubAwaySince !== null}
    <div
      aria-live="polite"
      class="mark-line flex flex-wrap items-center justify-between gap-space-2 rounded-well border border-border-hairline bg-surface-recess px-space-3 py-space-1"
      role="status"
    >
      <div class="mark-line flex min-w-0 items-center gap-space-2" data-box>
        <IconCloudCross
          aria-hidden="true"
          class="size-icon-sm flex-none text-ink-muted"
        />
        <span class="type-meta font-medium text-ink-strong">
          {words.passport.hubAway(reading.hubAwaySince)}
        </span>
      </div>
      <span class="type-meta text-ink-muted">
        {words.passport.hubAwayDisabled}
      </span>
    </div>
  {/if}

  <PassportPolicy {acts} {hubAway} {reading} />

  <div class="border-t border-border-hairline"></div>

  <div class="flex min-w-0 flex-col gap-space-2">
    <PassportPlaces {acts} {hubAway} {narrow} {reading} />
    <TaskMirror {acts} {hubAway} {reading} />
  </div>
</div>
