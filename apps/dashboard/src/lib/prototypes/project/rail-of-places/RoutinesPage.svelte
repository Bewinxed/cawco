<script lang="ts">
  /**
   * Routines: first Proposed, the approved actions waiting on the person
   * (the exact call, its connection and account, when, where it came from,
   * Approve and Decline as peers; a failed one with its reason), named even
   * when empty; then every routine as a row, failed first, down fixed
   * columns: its outcome glyph, its name over its schedule in words with
   * the zone it was set in and what fires it, its last run, its next run,
   * on or off. A row opens the routine in its pane.
   */
  import { railOfPlacesWords as w } from "@cawco/core/words/rail-of-places";
  import { Button } from "#lib/components/ui/button/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import { Switch } from "#lib/components/ui/switch/index.js";
  import {
    IconAgent,
    IconCheck,
    IconClose,
    IconError,
    IconPause,
    IconRepeat,
    IconSuccess,
  } from "#lib/icons.js";
  import type { Project, Read, Routine } from "./model";
  import PageColumn from "./PageColumn.svelte";

  let {
    project,
    read,
    chosen = null,
    onopen,
    onaskcaw,
  }: {
    project: Project;
    read: Read;
    /** The routine open in the pane. */
    chosen?: string | null;
    onopen: (id: string) => void;
    onaskcaw: () => void;
  } = $props();

  let decided = $state<string[]>([]);
  const reading = $derived(read.status === "loading");

  function stateOf(routine: Routine): string {
    if (routine.last.outcome === "failed") {
      return w.outcomes.failed;
    }
    return routine.on ? w.on : w.off;
  }
  const stale = $derived(read.stale !== null);
  const proposed = $derived(
    project.proposed.filter((one) => !decided.includes(one.id))
  );
  const routines = $derived(
    [...project.routines].sort(
      (a, b) =>
        Number(b.last.outcome === "failed") -
        Number(a.last.outcome === "failed")
    )
  );
</script>

<PageColumn {read}>
  <section class="flex flex-col gap-space-2" aria-labelledby="proposed-head">
    <h2
      id="proposed-head"
      class="mark-line flex h-c-section-head-h items-center gap-space-2 px-space-3 type-label text-ink-strong"
    >
      <span>{w.proposedGroup}</span>
      {#if !(reading || stale) && proposed.some((one) => one.state === "waiting")}
        <span
          class="size-(--status-dot-size) rounded-pill bg-status-attn-glyph"
          data-box
          aria-hidden="true"
        ></span>
      {/if}
      {#if !reading && proposed.length > 0}
        <span class="type-meta num text-ink-muted">{proposed.length}</span>
      {/if}
    </h2>
    <div class="rounded-lg bg-surface-raised shadow-tile">
      {#if reading}
        <div class="p-space-3"><Skeleton height="block" radius="tile" /></div>
      {:else if proposed.length === 0}
        <p class="px-space-5 py-space-4 type-body text-ink-muted">
          {w.proposedEmpty}
        </p>
      {:else}
        <ul class="flex flex-col divide-y divide-border-hairline">
          {#each proposed as one (one.id)}
            <li class="flex gap-space-3 px-space-3 py-space-4" data-flip>
              <span
                class="mark-cell grid h-c-row-mark w-c-row-lead flex-none place-items-center"
                role="img"
                aria-label={one.state === "failed"
                  ? w.outcomes.failed
                  : w.needKinds.action}
              >
                {#if one.state === "failed"}
                  <IconError
                    class="size-icon-md text-status-fail-glyph"
                    aria-hidden="true"
                  />
                {:else}
                  <IconCheck
                    class="size-icon-md text-status-attn-glyph"
                    aria-hidden="true"
                  />
                {/if}
              </span>
              <div class="flex min-w-0 flex-1 flex-col gap-space-2">
                <div
                  class="mark-line flex min-w-0 flex-wrap items-center gap-x-space-3 gap-y-space-1"
                >
                  <span class="type-label text-ink-row"
                    >{one.connection} · {one.account}</span
                  >
                  <span class="type-meta num text-ink-muted">{one.when}</span>
                  <span
                    class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap type-meta text-ink-muted"
                    >{w.from(one.from)}</span
                  >
                </div>
                <code
                  class="block rounded-sm bg-code-bg px-space-3 py-space-2 type-code whitespace-pre-wrap break-word text-ink-strong"
                  >{one.call}</code
                >
                {#if one.state === "failed" && one.reason}
                  <p class="type-body text-status-fail-ink">{one.reason}</p>
                  <div>
                    <Button variant="outline" size="sm" disabled={stale}
                      >{w.tryAgain}</Button
                    >
                  </div>
                {:else}
                  <div class="mt-space-1 flex justify-between gap-space-8">
                    <Button
                      class="flex-none"
                      variant="secondary"
                      size="sm"
                      answer="approve-strong"
                      hit="always"
                      fit="prompt"
                      width="shrink"
                      icon={IconCheck}
                      label={w.approve}
                      disabled={stale}
                      onclick={() => {
                        decided = [...decided, one.id];
                      }}
                    />
                    <Button
                      class="flex-none"
                      variant="secondary"
                      size="sm"
                      answer="deny-strong"
                      hit="always"
                      fit="prompt"
                      width="shrink"
                      icon={IconClose}
                      label={w.decline}
                      disabled={stale}
                      onclick={() => {
                        decided = [...decided, one.id];
                      }}
                    />
                  </div>
                {/if}
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </section>

  <section class="flex flex-col gap-space-2" aria-labelledby="routines-head">
    <h2
      id="routines-head"
      class="mark-line flex h-c-section-head-h items-center gap-space-2 px-space-3 type-label text-ink-strong"
    >
      <span>{w.routinesGroup}</span>
      {#if !reading && routines.length > 0}
        <span class="type-meta num text-ink-muted">{routines.length}</span>
      {/if}
    </h2>
    <div class="@container/routines rounded-lg bg-surface-raised shadow-tile">
      {#if reading}
        <div class="flex flex-col gap-space-3 p-space-3">
          {#each [0, 1, 2, 3] as row (row)}
            <Skeleton height="row" radius="tile" />
          {/each}
        </div>
      {:else if routines.length === 0}
        <EmptyState
          icon={IconRepeat}
          title={w.noRoutinesTitle}
          line={w.noRoutinesWhy}
          pad="pane"
        >
          {#snippet action()}
            <Button
              size="sm"
              icon={IconAgent}
              label={w.askCaw}
              onclick={onaskcaw}
            />
          {/snippet}
        </EmptyState>
      {:else}
        <div
          class="hidden h-c-ledger-band-h items-center gap-space-3 border-b border-border-hairline bg-surface-band px-space-3 type-caps text-ink-muted @phone/routines:flex"
          aria-hidden="true"
        >
          <span class="w-c-row-lead flex-none"></span>
          <span class="min-w-0 flex-1">{w.routinesGroup}</span>
          <span class="w-c-ledger-outcome-w flex-none">{w.lastRun}</span>
          <span class="w-c-routine-time-w flex-none">{w.nextRunHead}</span>
          <span class="w-c-btn-h flex-none"></span>
        </div>
        <ul class="flex flex-col divide-y divide-border-hairline">
          {#each routines as routine (routine.id)}
            {@const failing = read.unread.includes(`source:${routine.id}`)
              ? w.sourceFailing(routine.source.name)
              : routine.source.failing}
            <!-- mark-line: the outcome glyph stands in its lead cell on the first line (mark-cell); the columns beside it wrap -->
            <li
              class="group/routine relative flex flex-wrap items-start gap-x-space-3 gap-y-space-1 px-space-3 py-space-3 data-chosen:bg-selected-bg data-stale:opacity-55"
              data-chosen={chosen === routine.id || undefined}
              data-stale={stale || undefined}
            >
              <button
                type="button"
                class="press-tint focus-inset absolute inset-0 hover:bg-surface-hover"
                aria-label="{w.open} {routine.name}"
                onclick={() => onopen(routine.id)}
              ></button>
              <span
                class="mark-cell pointer-events-none relative grid h-c-row-mark w-c-row-lead flex-none place-items-center"
                role="img"
                aria-label={stateOf(routine)}
              >
                {#if routine.last.outcome === "failed"}
                  <IconError
                    class="size-icon-md text-status-fail-glyph"
                    aria-hidden="true"
                  />
                {:else if !routine.on}
                  <IconPause
                    class="size-icon-md text-ink-muted"
                    aria-hidden="true"
                  />
                {:else}
                  <IconSuccess
                    class="size-icon-md text-status-done-glyph"
                    aria-hidden="true"
                  />
                {/if}
              </span>
              <span
                class="pointer-events-none relative flex min-w-0 flex-1 basis-48 flex-col gap-space-1"
              >
                <span class="type-label text-ink-row">{routine.name}</span>
                <span class="type-meta text-ink-muted"
                  >{routine.schedule} · {routine.zone}</span
                >
                {#if failing}
                  <span class="type-meta text-status-fail-ink">{failing}</span>
                {:else if routine.expires}
                  <span class="type-meta text-ink-muted"
                    >{w.expires(routine.expires)}</span
                  >
                {/if}
              </span>
              <span
                class="pointer-events-none relative flex w-c-ledger-outcome-w flex-none flex-col gap-space-1 max-phone:ms-c-row-lead max-phone:ps-space-3 max-phone:w-auto"
              >
                <span
                  class="type-meta data-[outcome=failed]:text-status-fail-ink"
                  data-outcome={routine.last.outcome}
                  >{w.outcomes[routine.last.outcome]} · {routine.last.ago}</span
                >
                {#if routine.last.reason}
                  <span class="line-clamp-2 type-meta text-ink-muted"
                    >{routine.last.reason}</span
                  >
                {/if}
              </span>
              <span
                class="pointer-events-none relative w-c-routine-time-w flex-none type-meta num text-ink-muted"
                >{routine.next}</span
              >
              <span class="relative w-c-btn-h flex-none">
                <Switch
                  checked={routine.on}
                  disabled={stale}
                  aria-label="{routine.name}: {routine.on ? w.on : w.off}"
                />
              </span>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </section>
</PageColumn>
