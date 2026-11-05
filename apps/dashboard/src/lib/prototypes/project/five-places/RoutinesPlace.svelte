<script lang="ts">
  import { fivePlacesWords as words } from "@cawco/core/words/proto-five-places";
  /**
   * Routines: first the Proposed group (approved actions waiting on the
   * person, named even when empty: the exact call, its connection and
   * account, when, and the routine or task it came from, answered in the
   * row), then every routine with a failed one first: its schedule in words
   * with the zone it was set in, on or off, its last run and how long ago,
   * its next run and its source's health. A row opens the routine beside
   * the list (a bottom drawer on a phone).
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import EmptyState from "#lib/components/ui/empty/empty-state.svelte";
  import Skeleton from "#lib/components/ui/skeleton/skeleton.svelte";
  import {
    IconClose,
    IconPause,
    IconPen,
    IconPlay,
    IconRepeat,
    IconTick,
    IconTrash,
  } from "#lib/icons.js";
  import type { Read } from "./derive";
  import type { ApprovedAction, ProjectRecords, Routine } from "./records";
  import StatusGlyph from "./StatusGlyph.svelte";

  let {
    records,
    read,
    routine: routineArg = null,
    onaskcaw,
  }: {
    records: ProjectRecords;
    read: Read;
    /** The routine whose pane is open. */
    routine?: string | null;
    onaskcaw: (words: string) => void;
  } = $props();

  let openId = $derived(routineArg);
  /** Actions the person answered here; the hub's answer takes them off. */
  let answered = $state<string[]>([]);

  const live = $derived(read === "live");
  const routines = $derived(
    [...records.routines].sort(
      (a, b) =>
        Number(b.last?.outcome === "failed") -
          Number(a.last?.outcome === "failed") || Number(b.on) - Number(a.on)
    )
  );
  const actions = $derived(
    records.actions.filter((action) => !answered.includes(action.id))
  );
  const open = $derived(routines.find((one) => one.id === openId));

  const stateOf = (one: Routine) => {
    if (one.last?.outcome === "failed") {
      return "failed";
    }
    return one.on ? "on" : "paused";
  };
  const stateWord = (one: Routine) => {
    if (one.last?.outcome === "failed") {
      return words.attempt.failed;
    }
    return one.on ? words.on : words.off;
  };
  const lastSaid = (one: Routine) =>
    one.last
      ? words.lastRun(words.outcomes[one.last.outcome], one.last.ago)
      : "";
</script>

{#snippet actionRow(action: ApprovedAction)}
  <li
    class="grid grid-cols-1 gap-space-3 rounded-lg bg-surface-raised p-space-4 shadow-tile @desk/five:grid-cols-fluid-auto @desk/five:items-center"
  >
    <div class="flex min-w-0 flex-col gap-space-1">
      <p
        class="mark-line flex flex-wrap items-center gap-x-space-2 type-label text-ink-row"
      >
        <span
          aria-hidden="true"
          class="size-(--status-dot-size) flex-none rounded-pill bg-status-attn-glyph"
          data-box
        ></span>
        <span>{action.call}</span>
        <span class="type-meta text-ink-muted"
          >{action.connection} · {action.account} · {action.when}</span
        >
      </p>
      <p class="max-w-c-measure type-body text-ink-strong text-pretty">
        {action.arguments}
      </p>
      <p class="type-meta text-ink-muted">{action.from}</p>
    </div>
    <div
      class="flex items-center justify-between gap-space-8 @desk/five:justify-end"
    >
      <Button
        disabled={!live}
        hit="always"
        icon={IconClose}
        label={words.decline}
        onclick={() => {
          answered = [...answered, action.id];
        }}
        size="sm"
        variant="secondary"
      />
      <Button
        disabled={!live}
        hit="always"
        icon={IconTick}
        label={words.approve}
        onclick={() => {
          answered = [...answered, action.id];
        }}
        size="sm"
        variant="secondary"
      />
    </div>
  </li>
{/snippet}

<section
  aria-label={words.places.routines}
  class="relative flex min-h-0 flex-1 flex-col gap-space-5 overflow-y-auto"
>
  <section aria-labelledby="proposed-head" class="flex flex-col gap-space-2">
    <h3
      class="mark-line flex h-c-btn-h-sm items-center gap-space-2 type-label text-ink-strong"
      id="proposed-head"
    >
      {words.proposed}
      {#if live && actions.length > 0}<span class="type-meta text-ink-muted num"
          >{actions.length}</span
        >{/if}
    </h3>
    {#if read === "loading"}
      <Skeleton height="block" radius="card" />
    {:else if actions.length > 0}
      <ul class="flex flex-col gap-space-2">
        {#each actions as action (action.id)}
          {@render actionRow(action)}
        {/each}
      </ul>
    {:else}
      <p class="type-meta text-ink-muted">{words.proposedNone}</p>
    {/if}
  </section>

  <div class="flex min-h-0 flex-1 gap-space-5">
    <section
      aria-labelledby="routines-head"
      class="flex min-w-0 flex-1 flex-col gap-space-2"
    >
      <h3
        class="mark-line flex h-c-btn-h-sm items-center gap-space-2 type-label text-ink-strong"
        id="routines-head"
      >
        {words.routinesHead}
        {#if routines.length > 0}<span class="type-meta text-ink-muted num"
            >{routines.length}</span
          >{/if}
      </h3>
      {#if read === "loading"}
        {#each [0, 1, 2] as row (row)}
          <Skeleton height="row" radius="card" />
        {/each}
      {:else if routines.length === 0}
        <EmptyState
          icon={IconRepeat}
          line={words.noRoutinesLine}
          title={words.noRoutinesTitle}
        >
          {#snippet action()}
            <Button
              label={words.askCawRoutine}
              onclick={() => onaskcaw(words.askCawRoutine)}
              variant="outline"
            />
          {/snippet}
        </EmptyState>
      {:else}
        <ul
          class="flex flex-col overflow-hidden rounded-lg bg-surface-raised shadow-tile"
        >
          {#each routines as one (one.id)}
            <li class="border-b border-border-hairline last:border-b-0">
              <button
                aria-current={openId === one.id ? "true" : undefined}
                class="press-tint mark-line grid w-full grid-cols-lead-fluid items-start gap-x-space-3 p-space-3 text-start can-hover:not-aria-current:hover:bg-surface-hover aria-current:bg-selected-bg"
                onclick={() => {
                  openId = openId === one.id ? null : one.id;
                }}
                type="button"
              >
                <span class="flex justify-center" data-box
                  ><StatusGlyph
                    status={stateOf(one)}
                    word={stateWord(one)}
                    wordless
                  /></span
                >
                <span
                  class="flex min-w-0 flex-col gap-space-1 @desk/five:flex-row @desk/five:items-start @desk/five:gap-space-3"
                  data-box
                >
                  <span class="flex min-w-0 flex-1 flex-col gap-space-row">
                    <span class="type-label text-ink-row">{one.name}</span>
                    <span class="type-meta text-ink-muted"
                      >{one.schedule} · {one.zone}</span
                    >
                    {#if one.sourceFailing}
                      <span class="type-meta text-status-fail-ink"
                        >{one.source}: {one.sourceFailing}</span
                      >
                    {/if}
                  </span>
                  <span
                    class={[
                      "type-meta @desk/five:w-c-ledger-outcome-w @desk/five:flex-none",
                      one.last?.outcome === "failed"
                        ? "text-status-fail-ink"
                        : "text-ink-muted",
                    ]}>{lastSaid(one)}</span
                  >
                  <span
                    class="type-meta text-ink-muted num @desk/five:w-c-routine-time-w @desk/five:flex-none"
                    >{one.next && one.on
                      ? words.nextRun(one.next)
                      : words.off}</span
                  >
                </span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    {#if open}
      <!-- The routine opens beside the list; under 900 it rises from the foot. -->
      <aside
        aria-label={`${words.routinePane}: ${open.name}`}
        class="absolute inset-x-0 bottom-0 z-1 flex max-h-5/6 flex-col gap-space-4 overflow-y-auto rounded-t-lg bg-surface-raised p-space-5 shadow-drawer @desk/five:static @desk/five:max-h-none @desk/five:w-2/5 @desk/five:flex-none @desk/five:rounded-lg @desk/five:shadow-tile"
      >
        <div class="flex items-start gap-space-3">
          <div class="flex min-w-0 flex-1 flex-col gap-space-1">
            <h3 class="type-title text-ink-strong text-balance">{open.name}</h3>
            <p class="type-meta text-ink-muted">
              {open.schedule} · {open.zone} · {open.source}
            </p>
          </div>
          <Button
            aria-label={words.close}
            icon={IconClose}
            onclick={() => {
              openId = null;
            }}
            size="icon-sm"
            tone="quiet"
            variant="ghost"
          />
        </div>
        {#if open.last?.reason}
          <p
            class="rounded-md bg-status-fail-bg p-space-3 type-body text-status-fail-ink"
          >
            {open.last.reason}
          </p>
        {/if}
        <div class="flex flex-wrap gap-space-2">
          <Button
            disabled={!live}
            icon={IconPlay}
            label={words.runNow}
            size="sm"
            variant="outline"
          />
          <Button
            disabled={!live}
            icon={IconPause}
            label={open.on ? words.pause : words.resume}
            size="sm"
            variant="outline"
          />
          <Button
            disabled={!live}
            icon={IconPen}
            label={words.change}
            size="sm"
            variant="outline"
          />
          <Button
            class="ms-auto"
            disabled={!live}
            icon={IconTrash}
            label={words.deleteRoutine}
            size="sm"
            variant="destructive"
          />
        </div>
        <section class="flex flex-col gap-space-1">
          <h4 class="type-label text-ink-strong">{words.instruction}</h4>
          <p class="max-w-c-measure type-body text-ink-strong text-pretty">
            {open.instruction}
          </p>
        </section>
        <section class="flex flex-col gap-space-2">
          <h4 class="type-label text-ink-strong">{words.recentRuns}</h4>
          <ul class="flex flex-col gap-space-3">
            {#each open.runs as run (run.when)}
              <li class="flex flex-col gap-space-row">
                <span class="type-meta text-ink-muted"
                  ><span class="num">{run.when}</span> · {run.outcome} · {run.session}</span
                >
                <span class="type-body text-ink-strong text-pretty"
                  >{run.result}</span
                >
              </li>
            {/each}
          </ul>
        </section>
      </aside>
    {/if}
  </div>
</section>
