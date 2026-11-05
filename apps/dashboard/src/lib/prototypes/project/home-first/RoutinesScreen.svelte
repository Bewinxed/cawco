<script lang="ts">
  /**
   * Routines (TOM tasks 7 and 8), reached from Home's Coming up. First what
   * the routines and tasks proposed for the person's yes (approved actions:
   * the connection, account, exact call and time, where each came from),
   * named even when empty; then each routine as a ledger row: its schedule
   * in words on the person's clock with the zone it was set in, its last
   * run's outcome and how long ago, its next run, what fires it and whether
   * that source is failing. A failed routine comes first. A row opens the
   * routine in a pane: its instruction, recent runs, Run now, Pause, Change,
   * Delete. New routine offers by hand or Ask Caw; a new one runs once at
   * once as its test.
   */
  import { homeFirstWords as words } from "@cawco/core/words/proto-home-first";
  import { Button } from "#lib/components/ui/button/index.js";
  import Skeleton from "#lib/components/ui/skeleton/skeleton.svelte";
  import {
    IconAdd,
    IconChat,
    IconError,
    IconPause,
    IconPenLine,
    IconTick,
  } from "#lib/icons.js";
  import Group from "./Group.svelte";
  import type { Action, Routine } from "./model";
  import ProjectFrame from "./ProjectFrame.svelte";

  let {
    project,
    routines,
    actions,
    read = "live",
    staleAt,
    openRoutine,
    adding = false,
    onopen,
  }: {
    project: string;
    routines: Routine[];
    actions: Action[];
    read?: "live" | "loading" | "stale";
    staleAt?: string;
    /** The routine open in its pane, by id. */
    openRoutine?: string;
    /** New routine was pressed: its two ways stand at the page's head. */
    adding?: boolean;
    onopen?: (id: string | null) => void;
  } = $props();

  const stale = $derived(read === "stale");
  const at = $derived(stale ? staleAt : undefined);
  /** Failed first, then on, then off. */
  const ordered = $derived([
    ...routines.filter((r) => r.on && r.last?.outcome === "failed"),
    ...routines.filter((r) => r.on && r.last?.outcome !== "failed"),
    ...routines.filter((r) => !r.on),
  ]);
  const opened = $derived(routines.find((r) => r.id === openRoutine));

  const OUTCOME = {
    ok: {
      icon: IconTick,
      ink: "text-status-done-glyph",
      word: words.routines.outcome.ok,
    },
    failed: {
      icon: IconError,
      ink: "text-status-fail-glyph",
      word: words.routines.outcome.failed,
    },
    silent: {
      icon: IconPause,
      ink: "text-ink-muted",
      word: words.routines.outcome.silent,
    },
  } as const;
</script>

<ProjectFrame
  action={{ label: words.bar.newRoutine, icon: IconAdd, compact: true }}
  more={[words.more.configure, words.more.wiring]}
  onclosepane={() => onopen?.(null)}
  pane={opened ? routinePane : undefined}
  paneClose={words.taskPane.close}
  paneForm="over"
  paneTitle={opened?.name}
  {project}
  title={words.places.routines}
>
  <div class="flex min-w-0 flex-col gap-space-5">
    {#if adding}
      <section
        class="flex flex-col gap-space-3 rounded-lg bg-surface-raised p-space-4 shadow-tile"
      >
        <p class="m-0 type-body text-ink-muted">{words.routines.firstRun}</p>
        <div class="flex flex-wrap gap-space-2">
          <Button data-icon="inline-start" size="sm" variant="outline">
            <IconChat aria-hidden="true" />
            <span>{words.routines.viaCaw}</span>
          </Button>
          <Button data-icon="inline-start" size="sm" variant="outline">
            <IconPenLine aria-hidden="true" />
            <span>{words.routines.byHand}</span>
          </Button>
        </div>
      </section>
    {/if}

    <Group
      count={actions.filter((a) => a.state === "waiting").length}
      staleAt={at}
      title={words.routines.proposed}
    >
      {#if read === "loading"}
        <div class="p-space-3"><Skeleton height="block" radius="tile" /></div>
      {:else if actions.length === 0}
        <p class="m-0 px-space-4 py-space-3 type-body text-ink-muted">
          {words.routines.proposedNone}
        </p>
      {:else}
        <ul class="m-0 list-none p-0">
          {#each actions as action (action.id)}
            <!-- mark-line: the glyph stands beside the head line; the call starts under it. -->
            <li
              class="flex flex-wrap items-start gap-x-space-3 gap-y-space-3 border-b border-b-border-hairline py-space-4 ps-space-3 pe-space-4 last:border-b-0"
            >
              <span
                class="grid h-lh w-c-row-lead flex-none place-items-center type-label"
                data-box
              >
                {#if action.state === "failed"}
                  <IconError
                    aria-label={words.work.state.failed}
                    class="size-icon-md text-status-fail-glyph"
                    role="img"
                  />
                {:else}
                  <span
                    aria-label={words.groups.needs}
                    class="size-(--status-dot-size) rounded-pill bg-status-attn-glyph"
                    role="img"
                  ></span>
                {/if}
              </span>
              <div class="flex min-w-0 flex-1 flex-col gap-space-1">
                <p
                  class="m-0 flex flex-wrap items-baseline gap-x-space-2 type-meta text-ink-muted"
                >
                  <span class="type-label text-ink-row"
                    >{action.connection} · {action.account}</span
                  >
                  <span class="tabular-nums">{action.when}</span>
                  <span>· {words.needs.from(action.from)}</span>
                </p>
                <code
                  class="block rounded-sm bg-code-bg px-space-3 py-space-2 font-mono type-code text-ink-strong wrap-anywhere"
                  >{action.call}</code
                >
                {#if action.why}
                  <p class="m-0 type-body text-status-fail-ink text-pretty">
                    {action.why}
                  </p>
                {/if}
              </div>
              <div
                class="flex w-full flex-none justify-between gap-space-8 ps-c-row-lead @min-desk/shell:w-c-need-answers-w @min-desk/shell:ps-0"
              >
                {#if action.state === "failed"}
                  <Button
                    disabled={stale}
                    label={words.needs.tryAgain}
                    size="sm"
                    variant="outline"
                  />
                {:else}
                  <Button
                    answer="approve-strong"
                    disabled={stale}
                    fit="prompt"
                    hit="always"
                    label={words.needs.approve}
                    size="sm"
                    variant="secondary"
                  />
                  <Button
                    answer="deny-strong"
                    disabled={stale}
                    fit="prompt"
                    hit="always"
                    label={words.needs.decline}
                    size="sm"
                    variant="secondary"
                  />
                {/if}
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </Group>

    <Group count={routines.length} staleAt={at} title={words.routines.list}>
      {#if read === "loading"}
        <div class="flex flex-col gap-space-3 p-space-3">
          {#each [0, 1, 2, 3] as i (i)}
            <Skeleton height="row" radius="tile" />
          {/each}
        </div>
      {:else if routines.length === 0}
        <p class="m-0 px-space-4 py-space-3 type-body text-ink-muted">
          {words.routines.none}
        </p>
      {:else}
        <div
          class="hidden h-c-ledger-band-h items-center gap-space-3 bg-surface-band ps-space-3 pe-space-4 type-caps text-ink-muted @min-wide/shell:flex"
          aria-hidden="true"
        >
          <span class="w-c-row-lead flex-none"></span>
          <span class="min-w-0 flex-1">{words.routines.columns.routine}</span>
          <span class="w-c-ledger-outcome-w flex-none"
            >{words.routines.columns.last}</span
          >
          <span class="w-c-routine-time-w flex-none"
            >{words.routines.columns.next}</span
          >
          <span class="w-c-ledger-outcome-w flex-none"
            >{words.routines.columns.source}</span
          >
        </div>
        <ul class="m-0 list-none p-0">
          {#each ordered as routine (routine.id)}
            {@const outcome = routine.last
              ? OUTCOME[routine.last.outcome]
              : undefined}
            <li class="border-b border-b-border-hairline last:border-b-0">
              <!-- mark-line: the outcome's glyph stands beside the name's line; the schedule starts under it. -->
              <button
                aria-current={routine.id === openRoutine ? "true" : undefined}
                class="press-tint flex w-full flex-wrap items-start gap-x-space-3 gap-y-space-1 py-space-3 ps-space-3 pe-space-4 text-start transition-control not-aria-current:hover:bg-surface-hover aria-current:bg-selected-bg"
                onclick={() => onopen?.(routine.id)}
                type="button"
              >
                <span
                  class="grid h-lh w-c-row-lead flex-none place-items-center type-label"
                  data-box
                >
                  {#if !routine.on}
                    <IconPause
                      aria-label={words.routines.off}
                      class="size-icon-md text-ink-muted"
                      role="img"
                    />
                  {:else if outcome}
                    <outcome.icon
                      aria-label={outcome.word}
                      class={["size-icon-md", outcome.ink]}
                      role="img"
                    />
                  {/if}
                </span>
                <span class="flex min-w-0 flex-1 flex-col gap-space-row">
                  <span
                    class={[
                      "type-label",
                      routine.on ? "text-ink-row" : "text-ink-muted",
                    ]}>{routine.name}</span
                  >
                  <span class="type-meta text-ink-muted">
                    {routine.schedule} · {routine.zone}{#if routine.expired}
                      · {words.routines.expired(routine.expired)}{/if}
                  </span>
                </span>
                <span
                  class="flex w-full flex-col gap-space-row ps-c-row-lead type-meta @min-wide/shell:w-c-ledger-outcome-w @min-wide/shell:flex-none @min-wide/shell:ps-0"
                >
                  {#if routine.last && outcome}
                    <span>
                      <span
                        class={[
                          "font-medium",
                          routine.last.outcome === "failed"
                            ? "text-status-fail-ink"
                            : "text-ink-strong",
                        ]}>{outcome.word}</span
                      >
                      <span class="text-ink-muted tabular-nums">
                        {routine.last.when}</span
                      >
                    </span>
                    <span class="text-ink-muted text-pretty"
                      >{routine.last.note}</span
                    >
                  {/if}
                </span>
                <span
                  class="hidden w-c-routine-time-w flex-none type-meta text-ink-strong tabular-nums @min-wide/shell:block"
                >
                  {routine.next ?? ""}
                </span>
                <span
                  class="hidden w-c-ledger-outcome-w flex-none type-meta text-ink-muted text-pretty @min-wide/shell:block"
                >
                  {routine.source}{#if routine.sourceFailing}
                    · <span class="font-medium text-status-fail-ink"
                      >{words.routines.sourceFailing}</span
                    >{/if}
                </span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </Group>
  </div>
</ProjectFrame>

{#snippet routinePane()}
  {#if opened}
    <div class="flex flex-col gap-space-5">
      <p class="m-0 type-meta text-ink-muted">
        {opened.schedule} · {opened.zone} · {words.routines.columns.next}
        {opened.next ?? ""}
      </p>
      <div class="flex flex-wrap gap-space-2">
        <Button
          disabled={stale}
          label={words.routines.runNow}
          size="sm"
          variant="outline"
        />
        <Button
          disabled={stale}
          label={words.routines.pause}
          size="sm"
          variant="outline"
        />
        <Button
          disabled={stale}
          label={words.routines.change}
          size="sm"
          variant="outline"
        />
      </div>
      {#if opened.instruction}
        <section class="flex flex-col gap-space-2">
          <h3 class="m-0 type-label text-ink-strong">
            {words.routines.instruction}
          </h3>
          <p class="m-0 type-body text-ink-strong text-pretty">
            {opened.instruction}
          </p>
        </section>
      {/if}
      {#if opened.runs}
        <section class="flex flex-col gap-space-2">
          <h3 class="m-0 type-label text-ink-strong">{words.routines.runs}</h3>
          <ul class="m-0 flex list-none flex-col p-0">
            {#each opened.runs as run (run.when)}
              {@const look = OUTCOME[run.outcome]}
              <li
                class="mark-line flex items-center gap-space-3 border-b border-b-border-hairline py-space-2 last:border-b-0"
              >
                <look.icon
                  aria-label={look.word}
                  class={["size-icon-md flex-none", look.ink]}
                  data-box
                  role="img"
                />
                <span
                  class="w-c-ledger-when-w flex-none type-meta text-ink-muted tabular-nums"
                  >{run.when}</span
                >
                <span class="min-w-0 flex-1 type-body text-ink-strong"
                  >{run.result}</span
                >
              </li>
            {/each}
          </ul>
          <div>
            <Button label={words.routines.openRun} size="xs" variant="ghost" />
          </div>
        </section>
      {/if}
      <div class="border-t border-t-border-hairline pt-space-4">
        <Button label={words.routines.remove} size="sm" variant="destructive" />
      </div>
    </div>
  {/if}
{/snippet}
