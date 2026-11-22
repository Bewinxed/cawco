<script lang="ts">
  /**
   * The project's routines as a ledger, one row each: the routine (its name
   * over one plain sentence of what it last did or is waiting for), when it
   * last ran, when it runs next on the person's clock, and a state column
   * that is empty unless the routine needs him, where the Needs you mark and
   * Fix with Caw stand. The open button at the row's end opens it; the
   * opened routine stands beside the ledger.
   *
   * The routines that need him lead, then the rest in the order they were
   * made, until he sorts by Routine, Last run or Next run (TanStack Table's
   * sort: a third press on a head goes back to this order). Under a 640px
   * ledger each row is one card: the routine, the mark when it needs him,
   * and its open button; the times and the fix are in the opened routine.
   */
  import {
    createSortedRowModel,
    createTable,
    rowSortingFeature,
    sortFn_basic,
    sortFn_text,
    tableFeatures,
  } from "@tanstack/svelte-table";
  import type { Snippet } from "svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import * as Table from "#lib/components/ui/table/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { IconMaximize, IconSparkles } from "#lib/icons.js";
  import {
    lastRunAt,
    nextRunAt,
    nextRunWords,
    type RoutineReading,
    readRoutine,
    upper,
  } from "./routine-format";
  import {
    formatExactClock,
    formatNextClock,
    formatRelAge,
    MOCK_NOW,
    type Routine,
  } from "./routines-data";
  import StatusGlyph from "./StatusGlyph.svelte";

  interface Props {
    headerAction?: Snippet;
    now?: number;
    /** Asks Caw to fix a routine, with the words that say what went wrong. */
    onfix: (prompt: string) => void;
    onopen: (id: string) => void;
    routines: Routine[];
    selectedRoutineId: string | null;
    stale?: boolean;
  }

  let {
    routines,
    selectedRoutineId,
    stale = false,
    now = MOCK_NOW,
    headerAction,
    onopen,
    onfix,
  }: Props = $props();

  interface Row {
    reading: RoutineReading;
    routine: Routine;
  }

  /** Those that need him first, then the order they were made in. */
  const rows = $derived(
    routines
      .map((routine) => ({ reading: readRoutine(routine), routine }))
      .sort((a, b) => Number(b.reading.needsYou) - Number(a.reading.needsYou))
  );

  const features = tableFeatures({
    rowSortingFeature,
    sortedRowModel: createSortedRowModel(),
    sortFns: { basic: sortFn_basic, text: sortFn_text },
  });
  /** A column the ledger holds in its own order. */
  const fixed = { enableSorting: false } as const;
  /** A time column; a routine with no such time sorts last either way. */
  const timed = {
    enableMultiSort: false,
    sortFn: "basic",
    sortUndefined: "last",
  } as const;
  const columns = [
    {
      accessorFn: (row: Row) => row.routine.name,
      enableMultiSort: false,
      header: "Routine",
      id: "routine",
      sortFn: "text",
    },
    {
      accessorFn: (row: Row) => lastRunAt(row.routine),
      header: "Last run",
      id: "last",
      sortDescFirst: true,
      ...timed,
    },
    {
      accessorFn: (row: Row) => nextRunAt(row.routine),
      header: "Next run",
      id: "next",
      sortDescFirst: false,
      ...timed,
    },
    { accessorFn: () => null, header: "Needs you", id: "state", ...fixed },
    { accessorFn: () => null, header: "Open", id: "open", ...fixed },
  ] as const;
  const table = createTable({
    columns,
    features,
    get data() {
      return rows;
    },
    getRowId: (row: Row) => row.routine.id,
  });

  /** Each column's width, its head's and its cells' alike; Routine takes the rest. */
  const COL_W: Record<string, string> = {
    last: "calc(var(--spacing) * 34)",
    next: "calc(var(--spacing) * 40)",
    open: "calc(var(--spacing) * 6 + 2 * var(--spacing-space-3))",
    state:
      "calc(var(--spacing-icon-md) + var(--spacing-space-2) + var(--spacing) * 28 + 2 * var(--spacing-space-3))",
  };
  /** The heads he sorts by say it; the state and open heads are read, not shown. */
  const HIDDEN_HEAD = new Set(["state", "open"]);
</script>

<div class="flex flex-col gap-space-3" data-slot="routine-table-view">
  <header
    class="flex flex-wrap items-center justify-between gap-space-2"
    data-slot="routines-header"
  >
    <h2 class="m-0 type-label text-ink-strong">Routines</h2>
    {@render headerAction?.()}
  </header>

  <div
    class="overflow-hidden rounded-lg bg-surface-raised shadow-tile"
    data-slot="ledger"
    style:--card-cols="minmax(0, 1fr) auto auto"
  >
    <Table.Root
      data-routines
      ghostRows="tbody tr"
      layout="ledger"
      stacks="phone"
    >
      <Table.Header>
        <!-- One band: the routines' columns stand in one header row. -->
        <Table.Row variant="band">
          {#each table.getLeafHeaders() as { column } (column.id)}
            <Table.Head
              class="w-(--col-w)"
              data-routine-table-col={column.id}
              sorted={column.getIsSorted()}
              style="--col-w: {COL_W[column.id] ?? ''}"
              variant="band"
            >
              {#if HIDDEN_HEAD.has(column.id)}
                <span class="sr-only">{column.columnDef.header}</span>
              {:else}
                <Table.Sort {column} label={String(column.columnDef.header)} />
              {/if}
            </Table.Head>
          {/each}
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {#each table.getRowModel().rows as row (row.id)}
          {@const { routine, reading } = row.original}
          {@const picked = selectedRoutineId === routine.id}
          {@const last = lastRunAt(routine)}
          {@const next = nextRunAt(routine)}
          <Table.Row
            class="group/row"
            data-needs-you={reading.needsYou || undefined}
            data-picked={picked || undefined}
            data-routine-row={routine.id}
            variant="picks-stacks"
          >
            <Table.Cell
              data-routine-table-col="routine"
              variant="ledger-picks-stacks-lead"
            >
              <div class="flex w-full min-w-0 flex-col text-start">
                <span
                  class={[
                    "min-w-0 truncate type-label",
                    picked ? "text-selected-ink" : "text-ink-row",
                  ]}
                  title={routine.name}>{routine.name}</span
                >
                <span
                  class={[
                    "mark-line flex min-w-0 items-start gap-space-2 type-meta",
                    reading.needsYou ? "text-ink-strong" : "text-ink-muted",
                  ]}
                  data-slot="routine-sentence"
                  title={reading.sentence}
                >
                  {#if reading.running}
                    <span
                      class="inline-flex h-lh flex-none items-center"
                      data-box
                    >
                      <LiveDot size="row" tone="live" />
                    </span>
                  {/if}
                  <span class="line-clamp-2 min-w-0 text-pretty wrap-anywhere"
                    >{reading.sentence}</span
                  >
                </span>
              </div>
            </Table.Cell>
            <Table.Cell
              class="w-(--col-w)"
              data-routine-table-col="last"
              inCard="drops"
              style="--col-w: {COL_W.last}"
              variant="ledger-picks-stacks"
            >
              {#if last !== undefined}
                <time
                  datetime={new Date(last).toISOString()}
                  title={formatExactClock(last)}
                  >{upper(formatRelAge(last, now))}</time
                >
              {:else}
                <span aria-hidden="true">—</span>
                <span class="sr-only">Hasn't run yet</span>
              {/if}
            </Table.Cell>
            <Table.Cell
              class="w-(--col-w)"
              data-routine-table-col="next"
              inCard="drops"
              style="--col-w: {COL_W.next}"
              variant="ledger-picks-stacks"
            >
              {#if next !== undefined}
                <time
                  datetime={new Date(next).toISOString()}
                  title={formatExactClock(next)}
                  >{upper(formatNextClock(next, now))}</time
                >
              {:else}
                <span aria-hidden="true" title={nextRunWords(routine, now)}
                  >—</span
                >
                <span class="sr-only">{nextRunWords(routine, now)}</span>
              {/if}
            </Table.Cell>
            <Table.Cell
              class="w-(--col-w) @max-phone/table:col-start-2"
              data-routine-table-col="state"
              inCard="drops-empty"
              style="--col-w: {COL_W.state}"
              variant="ledger-picks-stacks"
            >
              {#if reading.needsYou}
                <span class="flex items-center gap-space-2">
                  <span
                    aria-label="Needs you"
                    class="inline-flex flex-none items-center"
                    data-box
                    role="img"
                    title="Needs you"
                  >
                    <StatusGlyph glyph="needs-you" tone="attn" />
                  </span>
                  {#if reading.fixPrompt}
                    {@const prompt = reading.fixPrompt}
                    <!-- The opened routine holds it on a phone. -->
                    <span class="@max-phone/table:hidden">
                      <Button
                        aria-label="Fix {routine.name} with Caw"
                        disabled={stale}
                        icon={IconSparkles}
                        label="Fix with Caw"
                        onclick={() => onfix(prompt)}
                        size="xs"
                        variant="outline"
                      />
                    </span>
                  {/if}
                </span>
              {/if}
            </Table.Cell>
            <Table.Cell
              class="w-(--col-w) @max-phone/table:col-start-3"
              data-routine-table-col="open"
              edge="end"
              style="--col-w: {COL_W.open}"
              variant="ledger-picks-stacks"
            >
              <!-- The routine opens only here, as everywhere in the dashboard. -->
              <Tip label="Open">
                {#snippet children(tip)}
                  <Button
                    {...tip}
                    aria-label="Open {routine.name}"
                    data-open-routine={routine.id}
                    icon={IconMaximize}
                    onclick={() => onopen(routine.id)}
                    size="icon-xs"
                    tone="muted"
                    variant="ghost"
                  />
                {/snippet}
              </Tip>
            </Table.Cell>
          </Table.Row>
        {/each}
      </Table.Body>
    </Table.Root>
  </div>
</div>
