<script lang="ts">
  /**
   * Read-only Project Passport body: Group 1 Standing policy (Who decides +
   * Review before done, Finished work, Account, Large-file storage), then
   * Group 2 Live fleet & mirror (every place at once, linked repositories,
   * and task mirror). Shares one set of left edges across the card: content
   * edge, list lead column, and one shared fact-line label/value column.
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

  /** Shared label/value columns for Finished work, Account, Large-file storage and Repositories. */
  const FACT_COLS = "calc(var(--spacing) * 28) minmax(0, 1fr)";

  const hubAway = $derived(reading.hubAwaySince !== null);
</script>

<div
  class="flex min-w-0 flex-col gap-space-3 px-space-4 py-space-3"
  style:--passport-fact-cols={FACT_COLS}
>
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

  <PassportPolicy {acts} {hubAway} {narrow} {reading} />

  <div class="border-t border-border-hairline"></div>

  <div class="flex min-w-0 flex-col gap-space-2">
    <PassportPlaces {acts} {hubAway} {narrow} {reading} />
    <TaskMirror {acts} {hubAway} {narrow} {reading} />
  </div>
</div>
