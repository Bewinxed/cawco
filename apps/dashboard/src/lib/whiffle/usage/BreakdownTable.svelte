<script lang="ts">
  /**
   * The breakdown table (USAGE-SPEC.md §7.2.5). Tabs for Project / Model /
   * Session, driven from a search param like the tools page, plus a harness
   * filter so the cost column is always one currency — Claude's notional cost
   * and opencode's real spend never sit in the same total. Each (tab, harness)
   * pair is fetched once and cached, so switching back costs no request.
   */
  import { untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { Button } from "$lib/components/ui/button";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Dialog from "$lib/components/ui/dialog";
  import { Skeleton } from "$lib/components/ui/skeleton";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Table from "$lib/components/ui/table";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Tabs from "$lib/components/ui/tabs";
  import { IconArrowDown, IconRefresh } from "$lib/icons";
  import { crossIn, crossOut } from "../motion/curves.svelte";
  import { morph } from "../motion/morph.svelte";
  import { tableReflow } from "../motion/rows.svelte";
  import { depart, land } from "../motion/share.svelte";
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
  /**
   * What the table's slot shows: a skeleton while a (tab, harness) pair is
   * read for the first time, the rows, or the error with a retry.
   */
  let status = $state<"loading" | "ready" | "error">("loading");
  let loadError = $state<string | null>(null);
  /** A retry is running: the button shows it, the error stays put. */
  let retrying = $state(false);

  async function fetchTab(): Promise<void> {
    const key = `${tab}:${harness}`;
    const known = cache.get(key);
    if (known) {
      summary = known;
      status = "ready";
      return;
    }
    if (!retrying) {
      status = "loading";
    }
    try {
      const response = await fetch(
        `/api/usage/summary?groupBy=${tab}&harness=${harness}`
      );
      if (!response.ok) {
        throw new Error(`The hub answered ${response.status}.`);
      }
      const data = (await response.json()) as UsageSummary;
      cache.set(key, data);
      if (key === `${tab}:${harness}`) {
        summary = data;
        status = "ready";
      }
    } catch (cause) {
      if (key === `${tab}:${harness}`) {
        loadError = cause instanceof Error ? cause.message : String(cause);
        status = "error";
      }
    }
  }

  $effect(() => {
    // biome-ignore lint/complexity/noVoid: fire-and-forget — the effect reruns on tab/harness, fetchTab() manages its own status
    void fetchTab();
  });

  async function retry(): Promise<void> {
    retrying = true;
    await fetchTab();
    retrying = false;
  }

  /**
   * The slot's content: one per (tab, harness) once read. A new one
   * cross-fades in over the old (motion/curves) while the slot's height
   * morphs to it (motion/morph).
   */
  const view = $derived(status === "ready" ? `${tab}:${harness}` : status);

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

  /**
   * A re-sort reflows the rows to their new places (motion/rows); a new
   * tab or harness is a new table, which cross-fades in instead.
   */
  let exitLayer = $state<HTMLElement | null>(null);
  let resorting = false;
  let sorted: UsageSummary | null = null;
  const reflowRows = tableReflow({
    layer: () => exitLayer,
    rows: "tbody tr[data-key]",
    enabled: () => resorting,
  });

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
    resorting = summary === sorted;
    sorted = summary;
    untrack(() => reflowRows(out.map((row) => String(row.key))));
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

  /** The token split: on a phone it is in the row's detail, not the row. */
  const SPLIT = new Set<SortKey>([
    "input",
    "output",
    "cacheCreation",
    "cacheRead",
  ]);
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

  /**
   * On a phone a row shows its name, cost, total and messages; the token
   * split is its detail, so there every row opens it, whatever the tab.
   */
  const phone = new MediaQuery("(max-width: 639px)");
  const opens = $derived(tab === "session" || phone.current);
  const DETAIL_TITLES: Record<TabId, string> = {
    model: "Model",
    project: "Project",
    session: "Session",
  };

  /** The row a detail opens from: the dialog grows out of it (motion/share). */
  const shareKey = (row: Row): string => `usage-row:${tab}:${nameOf(row)}`;

  function openSession(row: Row): void {
    selected = row;
    dialogOpen = true;
  }

  /** The kit dialog's frame, so the whole dialog lands, not its body. */
  const landDialog = (body: HTMLElement) =>
    land(() => (selected ? shareKey(selected) : undefined))(
      body.closest<HTMLElement>('[data-slot="dialog-content"]') ?? body
    );
</script>

<div class="flex flex-col gap-3">
  <div class="flex items-center justify-between gap-2">
    <div>
      <h2 class="text-title">Breakdown</h2>
      <p class="text-meta text-muted-foreground">Tokens and cost by {tab}.</p>
    </div>
    <Tabs.Root
      onValueChange={(next) => {
        harness = next as Harness;
      }}
      value={harness}
    >
      <Tabs.List aria-label="Harness">
        <Tabs.Trigger value="claude">Claude</Tabs.Trigger>
        <Tabs.Trigger value="opencode">opencode</Tabs.Trigger>
      </Tabs.List>
    </Tabs.Root>
  </div>

  <Tabs.Root onValueChange={switchTab} value={tab}>
    <Tabs.List class="w-full">
      {#each TAB_LIST as one (one.id)}
        <Tabs.Trigger value={one.id}>{one.label}</Tabs.Trigger>
      {/each}
    </Tabs.List>
  </Tabs.Root>

  <div class="slot" {@attach morph()}>
    {#key view}
      <div class="tbl" in:crossIn out:crossOut>
        {#if status === 'loading'}
          <div class="flex flex-col gap-2 py-2" data-slot="skeleton-rows">
            {#each [0, 1, 2, 3, 4] as row (row)}
              <Skeleton class="h-7 w-full" />
            {/each}
          </div>
        {:else if status === 'error'}
          <div
            class="flex flex-col items-start gap-3 rounded-[var(--radius-md)] bg-[var(--surface-recess)] p-5"
            role="alert"
          >
            <p class="text-meta text-muted-foreground">
              Could not read the breakdown. {loadError}
            </p>
            <Button
              icon={IconRefresh}
              label="Retry"
              onclick={retry}
              pending={retrying}
              pendingLabel="Retrying…"
              size="sm"
              variant="outline"
            />
          </div>
        {:else}
          <div aria-hidden="true" class="exits" bind:this={exitLayer}></div>
          <Table.Root class="q-break" ghostRows="tbody tr.clickable">
            <Table.Header>
              <Table.Row>
                <Table.Head class="name-head">Name</Table.Head>
                {#each COLUMNS as column (column.key)}
                  <Table.Head
                    class="num {SPLIT.has(column.key) ? 'split' : ''}"
                  >
                    <button
                      aria-pressed={sortBy === column.key}
                      class="sortbtn touch-hit"
                      onclick={() => sort(column.key)}
                      type="button"
                    >
                      {column.label}
                      <span
                        aria-hidden="true"
                        class="arrow"
                        class:on={sortBy === column.key}
                        class:up={sortBy === column.key && sortAsc}
                      >
                        <IconArrowDown />
                      </span>
                    </button>
                  </Table.Head>
                {/each}
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {#each rows as row (String(row.key))}
                <Table.Row
                  class={opens ? 'clickable' : ''}
                  data-key={String(row.key)}
                  data-share={opens ? shareKey(row) : undefined}
                  onclick={() => (opens ? openSession(row) : undefined)}
                  onkeydown={(event) => {
                    if (opens && (event.key === 'Enter' || event.key === ' ')) {
                      event.preventDefault();
                      depart(event.currentTarget);
                      openSession(row);
                    }
                  }}
                  role={opens ? 'button' : undefined}
                  tabindex={opens ? 0 : undefined}
                >
                  <Table.Cell
                    class="name lead {tab === 'model' || tab === 'session' ? 'mono' : ''}"
                    title={nameOf(row)}
                  >
                    {nameOf(row)}
                  </Table.Cell>
                  <Table.Cell class="num split" data-label="Input"
                    >{compactNumber(row.input)}</Table.Cell
                  >
                  <Table.Cell class="num split" data-label="Output"
                    >{compactNumber(row.output)}</Table.Cell
                  >
                  <Table.Cell class="num split" data-label="Cache write"
                    >{compactNumber(row.cacheCreation)}</Table.Cell
                  >
                  <Table.Cell class="num split" data-label="Cache read"
                    >{compactNumber(row.cacheRead)}</Table.Cell
                  >
                  <Table.Cell class="num strong total" data-label="Total"
                    >{compactNumber(row.total)}</Table.Cell
                  >
                  <Table.Cell class="num messages" data-label="Messages"
                    >{row.messages.toLocaleString()}</Table.Cell
                  >
                  <Table.Cell class="num strong cost"
                    >{usd(row.costUsd)}</Table.Cell
                  >
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
    {/key}
  </div>
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
    <Dialog.Header {@attach landDialog}>
      <Dialog.Title>{DETAIL_TITLES[tab]}</Dialog.Title>
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
  /* The table's slot: what leaves is pinned in it while what arrives
     takes its place (motion/curves crossOut), and its height morphs. */
  .slot {
    position: relative;
  }
  /* The box rows reflow in: the layer leaving rows close in sits at its
     corner (motion/rows). */
  .tbl {
    position: relative;
  }
  .exits {
    position: absolute;
    inset-block-start: 0;
    inset-inline-start: 0;
  }
  /* The sort arrow stands in the head's padding just before its label,
     out of the flow, so no head changes width when the sort moves; it
     fades in on the column sorted by, points down for descending and
     turns to point up. */
  .arrow {
    position: absolute;
    inset-inline-end: calc(100% + 2px);
    top: 50%;
    translate: 0 -50%;
    display: inline-flex;
    opacity: 0;
    @media (prefers-reduced-motion: no-preference) {
      transition:
        opacity var(--dur-control) var(--ease-out),
        rotate var(--dur-control) var(--ease-in-out);
    }
  }
  .arrow.on {
    opacity: 1;
  }
  .arrow.up {
    rotate: 180deg;
  }
  .arrow :global(svg) {
    width: 12px;
    height: 12px;
  }

  :global {
    .q-break {
      width: 100%;
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
    /* Under a laptop's width the heads wrap onto two lines, so eight
       columns fit the card rather than scroll inside it. */
    @media (max-width: 1023px) {
      .q-break thead th {
        white-space: normal;
      }
      .q-break .sortbtn {
        text-align: end;
      }
      .q-break td.name {
        white-space: normal;
        overflow-wrap: anywhere;
      }
    }
    .q-break .sortbtn {
      position: relative;
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

    /* A phone has no room for eight columns. Each row is two lines: the
       name with its cost, then its total and messages as meta. The token
       split is the row's detail, a press away. The column heads left wrap
       into one row of sort buttons. */
    @media (max-width: 639px) {
      .q-break {
        display: block;
        min-width: 0;
      }
      .q-break thead,
      .q-break tbody {
        display: block;
      }
      /* biome-ignore lint/style/noDescendingSpecificity: the phone layout sets display, gap and the meta role; the more specific base rules above set other properties, so their order does not decide anything. */
      .q-break thead tr {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-1) var(--space-3);
        padding-block: var(--space-2);
        border-bottom: 1px solid var(--border-hairline);
      }
      .q-break thead th {
        display: block;
        padding: 0;
        border-bottom: 0;
      }
      .q-break thead th.name-head,
      .q-break th.split,
      .q-break td.split {
        display: none;
      }
      /* biome-ignore lint/style/noDescendingSpecificity: the phone layout sets display, gap and the meta role; the more specific base rules above set other properties, so their order does not decide anything. */
      .q-break tbody tr {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: var(--space-1) var(--space-3);
        padding-block: var(--space-2);
        border-bottom: 1px solid var(--border-hairline);
      }
      .q-break tbody tr:last-child {
        border-bottom: 0;
      }
      /* biome-ignore lint/style/noDescendingSpecificity: the phone layout sets display, gap and the meta role; the more specific base rules above set other properties, so their order does not decide anything. */
      .q-break tbody td {
        display: block;
        padding: 0;
        border-bottom: 0;
        font: var(--type-meta);
      }
      .q-break td.lead {
        max-width: none;
        font: var(--type-label);
      }
      .q-break td.lead.mono {
        font-family: var(--font-mono);
      }
      .q-break td.lead {
        grid-area: 1 / 1;
      }
      .q-break td.cost {
        grid-area: 1 / 2;
        font: var(--type-label);
      }
      .q-break td.total {
        grid-area: 2 / 1;
        text-align: start;
      }
      .q-break td.messages {
        grid-area: 2 / 2;
      }
      .q-break td.empty {
        grid-column: 1 / -1;
        padding-block: var(--space-6);
      }
      .q-break td[data-label]::before {
        content: attr(data-label) " ";
        color: var(--ink-muted);
      }
    }
  }
</style>
