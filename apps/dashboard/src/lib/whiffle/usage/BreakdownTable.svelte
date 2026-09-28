<script lang="ts">
  import { goto } from "$app/navigation";
  /**
   * The breakdown table (USAGE-SPEC.md §7.2.5). Tabs for Project / Model /
   * Session, driven from a search param like the tools page, plus a harness
   * filter so the cost column is always one currency — Claude's notional cost
   * and opencode's real spend never sit in the same total. Each (tab, harness)
   * pair is fetched once and cached, so switching back costs no request.
   */
  import { page } from "$app/state";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Dialog from "$lib/components/ui/dialog";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Table from "$lib/components/ui/table";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Tabs from "$lib/components/ui/tabs";
  import {
    compactNumber,
    totalTokensOf,
    type UsageSummary,
    type UsageSummaryRow,
    usd,
  } from "../usage";

  type TabId = "model" | "project" | "session";
  type Harness = "claude" | "opencode";

  const TAB_LIST = [
    { id: "model", label: "Model" },
    { id: "project", label: "Project" },
    { id: "session", label: "Session" },
  ] as const;

  const tab: TabId = $derived(
    (["model", "project", "session"] as const).find(
      (id) => id === page.url.searchParams.get("tab")
    ) ?? "model"
  );

  let harness = $state<Harness>("claude");

  const cache = new Map<string, UsageSummary>();
  let summary = $state<UsageSummary | null>(null);
  let loading = $state(true);
  let loadError = $state<string | null>(null);

  async function fetchTab(): Promise<void> {
    const key = `${tab}:${harness}`;
    const known = cache.get(key);
    if (known) {
      summary = known;
      loading = false;
      return;
    }
    loading = true;
    loadError = null;
    try {
      const response = await fetch(
        `/api/usage/summary?groupBy=${tab}&harness=${harness}`
      );
      if (!response.ok) {
        throw new Error(`the hub answered ${response.status}`);
      }
      const data = (await response.json()) as UsageSummary;
      cache.set(key, data);
      summary = data;
    } catch (cause) {
      loadError = cause instanceof Error ? cause.message : String(cause);
      summary = null;
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    // biome-ignore lint/complexity/noVoid: fire-and-forget — the effect reruns on tab/harness, fetchTab() manages its own loading/error state
    void fetchTab();
  });

  function switchTab(next: string): void {
    // biome-ignore lint/complexity/noVoid: fire-and-forget navigation — the URL param drives the $derived tab, not this promise
    void goto(`/usage?tab=${next}`, { noScroll: true, replaceState: true });
  }

  type SortKey =
    | "input"
    | "output"
    | "cacheCreation"
    | "cacheRead"
    | "total"
    | "costUsd"
    | "messages";

  interface Row extends UsageSummaryRow {
    total: number;
  }

  let sortBy = $state<SortKey>("total");
  let sortAsc = $state(false);

  const rows: Row[] = $derived.by(() => {
    const out = (summary?.rows ?? []).map((row) => ({
      ...row,
      total: totalTokensOf(row),
    }));
    out.sort((a, b) => {
      const cmp =
        typeof a[sortBy] === "number" && typeof b[sortBy] === "number"
          ? (a[sortBy] as number) - (b[sortBy] as number)
          : String(a[sortBy]).localeCompare(String(b[sortBy]));
      return sortAsc ? cmp : -cmp;
    });
    return out;
  });

  function sort(next: SortKey): void {
    if (sortBy === next) {
      sortAsc = !sortAsc;
    } else {
      sortBy = next;
      sortAsc = false;
    }
  }

  const COLUMNS: { key: SortKey; label: string }[] = $derived([
    { key: "input", label: "Input" },
    { key: "output", label: "Output" },
    { key: "cacheCreation", label: "Cache write" },
    { key: "cacheRead", label: "Cache read" },
    { key: "total", label: "Total" },
    { key: "messages", label: "Messages" },
    {
      key: "costUsd",
      label: harness === "claude" ? "Cost · would cost on API" : "Cost",
    },
  ]);

  const nameOf = (row: Row): string => String(row.key);

  let selected = $state<Row | null>(null);
  let dialogOpen = $state(false);

  function openSession(row: Row): void {
    selected = row;
    dialogOpen = true;
  }
</script>

<div class="flex flex-col gap-3">
  <div class="flex items-center justify-between gap-2">
    <div>
      <h2 class="text-title">Breakdown</h2>
      <p class="text-meta text-muted-foreground">Tokens and cost by {tab}.</p>
    </div>
    <!-- biome-ignore lint/a11y/useSemanticElements: a fieldset's default border/padding and legend semantics don't fit this toolbar; role="group" already conveys it to AT -->
    <div
      aria-label="Harness"
      class="flex gap-1 rounded-[var(--radius-sm)] bg-[var(--surface-recess-deep)] p-0.5"
      role="group"
    >
      <button
        aria-pressed={harness === 'claude'}
        class="touch-hit rounded-[var(--radius-xs)] px-2.5 py-1 [--hit-gap-x:4px] text-label transition-colors duration-150 ease-out
               {harness === 'claude'
          ? 'bg-[var(--surface-lift)] text-foreground shadow-[var(--shadow-raised)]'
          : 'text-muted-foreground hover:text-foreground'}"
        onclick={() => {
          harness = 'claude';
        }}
        type="button"
      >
        Claude
      </button>
      <button
        aria-pressed={harness === 'opencode'}
        class="touch-hit rounded-[var(--radius-xs)] px-2.5 py-1 [--hit-gap-x:4px] text-label transition-colors duration-150 ease-out
               {harness === 'opencode'
          ? 'bg-[var(--surface-lift)] text-foreground shadow-[var(--shadow-raised)]'
          : 'text-muted-foreground hover:text-foreground'}"
        onclick={() => {
          harness = 'opencode';
        }}
        type="button"
      >
        opencode
      </button>
    </div>
  </div>

  <Tabs.Root onValueChange={switchTab} value={tab}>
    <Tabs.List class="w-full">
      {#each TAB_LIST as one (one.id)}
        <Tabs.Trigger value={one.id}>{one.label}</Tabs.Trigger>
      {/each}
    </Tabs.List>
  </Tabs.Root>

  {#if loadError}
    <p class="text-meta text-error" role="alert">{loadError}</p>
  {:else if loading}
    <div class="h-40 w-full rounded-[var(--radius-md)] bg-muted/40"></div>
  {:else}
    <Table.Root class="q-break" ghostRows="tbody tr.clickable">
      <Table.Header>
        <Table.Row>
          <Table.Head>Name</Table.Head>
          {#each COLUMNS as column (column.key)}
            <Table.Head class="num">
              <button
                aria-pressed={sortBy === column.key}
                class="sortbtn touch-hit"
                onclick={() => sort(column.key)}
                type="button"
              >
                {column.label}
                {#if sortBy === column.key}
                  <span aria-hidden="true">{sortAsc ? '↑' : '↓'}</span>
                {/if}
              </button>
            </Table.Head>
          {/each}
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {#each rows as row (String(row.key))}
          <Table.Row
            class={tab === 'session' ? 'clickable' : ''}
            onclick={() => (tab === 'session' ? openSession(row) : undefined)}
            onkeydown={(event) => {
              if (tab === 'session' && (event.key === 'Enter' || event.key === ' ')) {
                event.preventDefault();
                openSession(row);
              }
            }}
            role={tab === 'session' ? 'button' : undefined}
            tabindex={tab === 'session' ? 0 : undefined}
          >
            <Table.Cell
              class="name {tab === 'model' || tab === 'session' ? 'mono' : ''}"
              title={nameOf(row)}
            >
              {nameOf(row)}
            </Table.Cell>
            <Table.Cell class="num">{compactNumber(row.input)}</Table.Cell>
            <Table.Cell class="num">{compactNumber(row.output)}</Table.Cell>
            <Table.Cell class="num"
              >{compactNumber(row.cacheCreation)}</Table.Cell
            >
            <Table.Cell class="num">{compactNumber(row.cacheRead)}</Table.Cell>
            <Table.Cell class="num strong"
              >{compactNumber(row.total)}</Table.Cell
            >
            <Table.Cell class="num">{row.messages.toLocaleString()}</Table.Cell>
            <Table.Cell class="num strong">{usd(row.costUsd)}</Table.Cell>
          </Table.Row>
        {/each}
        {#if rows.length === 0}
          <Table.Row>
            <Table.Cell class="empty" colspan={8}>
              Nothing recorded for this harness yet.
            </Table.Cell>
          </Table.Row>
        {/if}
      </Table.Body>
    </Table.Root>
  {/if}
</div>

<Dialog.Root
  onOpenChange={(open) => {
    if (!open) {
      selected = null;
    }
  }}
  bind:open={dialogOpen}
>
  <Dialog.Content class="max-w-md">
    <Dialog.Header>
      <Dialog.Title>Session</Dialog.Title>
      <Dialog.Description class="font-mono text-label"
        >{selected?.key}</Dialog.Description
      >
    </Dialog.Header>
    {#if selected}
      <dl class="grid grid-cols-2 gap-2 text-meta text-muted-foreground">
        <div>
          <dt class="text-muted-foreground">Input</dt>
          <dd class="num">{selected.input.toLocaleString()}</dd>
        </div>
        <div>
          <dt class="text-muted-foreground">Output</dt>
          <dd class="num">{selected.output.toLocaleString()}</dd>
        </div>
        <div>
          <dt class="text-muted-foreground">Cache write</dt>
          <dd class="num">
            {selected.cacheCreation.toLocaleString()}
          </dd>
        </div>
        <div>
          <dt class="text-muted-foreground">Cache read</dt>
          <dd class="num">{selected.cacheRead.toLocaleString()}</dd>
        </div>
        <div>
          <dt class="text-muted-foreground">Total</dt>
          <dd class="num">{selected.total.toLocaleString()}</dd>
        </div>
        <div>
          <dt class="text-muted-foreground">Cost</dt>
          <dd class="num">{usd(selected.costUsd)}</dd>
        </div>
      </dl>
    {/if}
  </Dialog.Content>
</Dialog.Root>

<style>
  /* The breakdown table: shadcn Table primitives dressed in Quiet Ledger tokens
     — hairline dividers, uppercase micro-label header, tabular numerics, on the
     --space ladder (never shadcn's 8/12/16). Addressed globally because the
     classes ride on child-component elements. */
  :global {
    .q-break {
      width: 100%;
      min-width: max-content;
      border-collapse: collapse;
      font-variant-numeric: normal;
    }
    .q-break tr {
      border: 0;
    }
    .q-break thead th {
      height: auto;
      padding: var(--space-2) var(--space-3);
      border-bottom: 1px solid var(--border-hairline);
      text-align: left;
      white-space: nowrap;
    }
    .q-break thead th.num {
      text-align: right;
    }
    .q-break .sortbtn {
      display: inline-flex;
      align-items: center;
      gap: var(--space-1);
      margin-left: auto;
      font-size: var(--text-label);
      font-weight: var(--weight-strong);
      text-transform: uppercase;
      letter-spacing: var(--track-caps);
      color: var(--ink-muted);
      transition: color var(--dur-control) var(--ease-in-out);
      cursor: pointer;
    }
    .q-break thead th:not(.num) .sortbtn {
      margin-left: 0;
    }
    .q-break .sortbtn:hover {
      color: var(--ink-strong);
    }
    .q-break td {
      font-size: var(--text-body);
      font-weight: var(--weight-body);
      color: var(--ink-strong);
      padding: var(--space-2) var(--space-3);
      border-bottom: 1px solid var(--border-hairline);
      vertical-align: middle;
      white-space: nowrap;
    }
    .q-break tbody tr:last-child td {
      border-bottom: 0;
    }
    .q-break tbody tr.clickable {
      cursor: pointer;
    }
    .q-break td.num {
      text-align: right;
    }
    .q-break td.strong {
      color: var(--ink-strong);
    }
    .q-break td.name {
      max-width: 14rem;
      overflow: hidden;
      text-overflow: ellipsis;
      color: var(--ink-strong);
    }
    .q-break td.name.mono {
      font-family: var(--font-mono);
    }
    .q-break td.empty {
      text-align: center;
      padding: var(--space-6) var(--space-3);
      color: var(--ink-muted);
      white-space: normal;
    }
  }
</style>
