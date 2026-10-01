<script lang="ts">
  /**
   * Where it goes (design/usage-tracker.md §3, owner pick f): one block, one
   * harness at a time, by session, model or machine, over the page's range.
   * One neutral bar per row with its value at the tip, the top eight, then
   * the rest a press away. Sessions stand under the machine that ran them,
   * named once, and each opens its conversation.
   *
   * Two currencies never share a list: Claude's figures are the API price of
   * work the plan covers (`~`), opencode's are what it recorded spending.
   *
   * A new range keeps the rows and moves them: they reflow to their new
   * order and their bars tween once (motion/rows `reflow`). A new harness or
   * grouping is a new list.
   */
  import type { UsageSummary, UsageSummaryRow } from "@whiffle/core";
  import { Button } from "$lib/components/ui/button";
  import { TabItem, Tabs, TabsList } from "$lib/components/ui/fluid-tabs";
  import { Skeleton } from "$lib/components/ui/skeleton";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Tooltip from "$lib/components/ui/tooltip";
  import { IconRefresh } from "$lib/icons";
  import { whiffle } from "../client.svelte";
  import { conversationHref } from "../links";
  import { reflow } from "../motion/rows.svelte";
  import OsMark from "../OsMark.svelte";
  import { compactNumber, money, totalTokensOf } from "../usage";

  type Harness = "claude" | "opencode";
  type Grouping = "session" | "model" | "machine";

  let {
    since,
  }: {
    /**
     * Where the range starts for each harness: null when it has no such
     * window, undefined while that is not known yet.
     */
    since: Record<Harness, number | null | undefined>;
  } = $props();

  let harness = $state<Harness>("claude");
  let grouping = $state<Grouping>("session");
  let expanded = $state(false);

  const start = $derived(since[harness]);
  const key = $derived(`${harness}:${grouping}:${start}`);

  const cache = new Map<string, UsageSummary>();
  /** What the list shows: the newest read for this harness and grouping. */
  let shown = $state<{ list: string; summary: UsageSummary } | null>(null);
  let failed = $state<string | null>(null);
  let retrying = $state(false);
  let latest = "";

  async function read(): Promise<void> {
    const want = key;
    const list = `${harness}:${grouping}`;
    latest = want;
    failed = null;
    const known = cache.get(want);
    if (known) {
      shown = { list, summary: known };
      return;
    }
    if (start === undefined || start === null) {
      return;
    }
    try {
      const response = await fetch(
        `/api/usage/summary?harness=${harness}&groupBy=${grouping}&since=${start}`
      );
      if (!response.ok) {
        throw new Error(`The hub answered ${response.status}.`);
      }
      const summary = (await response.json()) as UsageSummary;
      cache.set(want, summary);
      if (latest === want) {
        shown = { list, summary };
      }
    } catch (cause) {
      if (latest === want) {
        failed = cause instanceof Error ? cause.message : String(cause);
      }
    }
  }

  $effect(() => {
    // biome-ignore lint/complexity/noVoid: fire-and-forget — read() reads the key before it awaits, so the effect reruns on it, and it owns its own state
    void read();
  });

  async function retry(): Promise<void> {
    retrying = true;
    await read();
    retrying = false;
  }

  /** The list on screen belongs to this harness and grouping. */
  const current = $derived(
    shown && shown.list === `${harness}:${grouping}` ? shown.summary : null
  );
  const ranked = $derived(
    [...(current?.rows ?? [])].sort((a, b) => b.costUsd - a.costUsd)
  );
  const total = $derived(current?.totals.costUsd ?? 0);
  const TOP = 8;
  const visible = $derived(expanded ? ranked : ranked.slice(0, TOP));
  const rest = $derived(ranked.length - visible.length);

  /** Sessions under their machine, machines in the order their best row ranks. */
  const sections = $derived.by(() => {
    if (grouping !== "session") {
      return [{ machine: null, rows: visible }];
    }
    const out: {
      machine: UsageSummaryRow["machine"];
      rows: UsageSummaryRow[];
    }[] = [];
    for (const row of visible) {
      const at = out.find((s) => s.machine?.id === row.machine?.id);
      if (at) {
        at.rows.push(row);
      } else {
        out.push({ machine: row.machine, rows: [row] });
      }
    }
    return out;
  });

  const approx = $derived(harness === "claude" ? "~" : "");
  const share = (row: UsageSummaryRow) => (total > 0 ? row.costUsd / total : 0);
  const pct = (row: UsageSummaryRow) => `${Math.round(share(row) * 100)}%`;
  const href = (row: UsageSummaryRow) =>
    grouping === "session"
      ? conversationHref(
          row.instanceId ?? String(row.key),
          whiffle.instanceIndex
        )
      : undefined;

  /** The list as a file: every row of the harness, grouping and range on screen. */
  export function csv(): { name: string; body: string } {
    const cell = (value: string) => `"${value.replaceAll('"', '""')}"`;
    const head = [
      { session: "Session", model: "Model", machine: "Machine" }[grouping],
      ...(grouping === "session" ? ["Machine"] : []),
      harness === "claude" ? "API price (USD)" : "Spend (USD)",
      "Input",
      "Output",
      "Cache write",
      "Cache read",
      "Messages",
    ];
    const lines = ranked.map((row) =>
      [
        row.label,
        ...(grouping === "session" ? [row.machine?.hostname ?? ""] : []),
        row.costUsd.toFixed(2),
        String(row.input),
        String(row.output),
        String(row.cacheCreation),
        String(row.cacheRead),
        String(row.messages),
      ]
        .map(cell)
        .join(",")
    );
    return {
      name: `usage-${harness}-${grouping}.csv`,
      body: [head.map(cell).join(","), ...lines].join("\n"),
    };
  }
</script>

<section aria-labelledby="where-title" class="card">
  <header class="head">
    <h2 class="title" id="where-title">Where it goes</h2>
    <div class="switches">
      <Tabs
        onValueChange={(next) => {
          harness = next as Harness;
          expanded = false;
        }}
        value={harness}
      >
        <TabsList aria-label="Harness">
          <TabItem label="Claude" value="claude" />
          <TabItem label="opencode" value="opencode" />
        </TabsList>
      </Tabs>
      <Tabs
        onValueChange={(next) => {
          grouping = next as Grouping;
          expanded = false;
        }}
        value={grouping}
      >
        <TabsList aria-label="Group by">
          <TabItem label="Sessions" value="session" />
          <TabItem label="Models" value="model" />
          <TabItem label="Machines" value="machine" />
        </TabsList>
      </Tabs>
    </div>
  </header>

  {#if start === null}
    <p class="note">
      No 5-hour window is running for
      {harness === 'claude' ? 'Claude' : 'opencode'}.
    </p>
  {:else if failed && !current}
    <div class="failed" role="alert">
      <p class="note">Could not read where it goes. {failed}</p>
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
  {:else if !current}
    <div class="rows" data-slot="skeleton-rows">
      {#each [0, 1, 2, 3, 4] as row (row)}
        <Skeleton class="h-6 w-full" />
      {/each}
    </div>
  {:else if ranked.length === 0}
    <p class="note">Nothing recorded in this range.</p>
  {:else}
    {#key `${harness}:${grouping}`}
      <div class="rows" {@attach reflow()}>
        {#each sections as section (section.machine?.id ?? 'all')}
          <div class="section" data-flip>
            {#if section.machine}
              <div class="machine">
                <OsMark class="size-4 shrink-0" os={section.machine.os} />
                {section.machine.hostname}
              </div>
            {/if}
            {#each section.rows as row (String(row.key))}
              <div class="row" data-flip>
                {#if href(row)}
                  <a class="name" href={href(row)} title={row.label}
                    >{row.label}</a
                  >
                {:else if grouping === 'machine' && row.machine}
                  <span class="name machine-name">
                    <OsMark class="size-4 shrink-0" os={row.machine.os} />
                    {row.label}
                  </span>
                {:else}
                  <span class="name" title={row.label}>{row.label}</span>
                {/if}
                <Tooltip.Root>
                  <Tooltip.Trigger>
                    {#snippet child({ props })}
                      <span {...props} class="measure">
                        <span class="fill" style:--share={share(row)}></span>
                        <span class="value num"
                          >{approx}{money(row.costUsd)}</span
                        >
                      </span>
                    {/snippet}
                  </Tooltip.Trigger>
                  <Tooltip.Content>
                    {pct(row)}
                    of the total · {compactNumber(totalTokensOf(row))}
                    tokens · {row.messages.toLocaleString()} messages
                  </Tooltip.Content>
                </Tooltip.Root>
              </div>
            {/each}
          </div>
        {/each}
      </div>
    {/key}
    {#if rest > 0}
      <div>
        <Button
          label="Show {rest} more"
          onclick={() => {
            expanded = true;
          }}
          size="sm"
          variant="ghost"
        />
      </div>
    {/if}
  {/if}

  {#if harness === 'claude'}
    <p class="note">~ is the API price of work the plan already covers.</p>
  {/if}
</section>

<style>
  .card {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-5);
    border-radius: var(--radius-lg);
    background: var(--surface-raised);
    box-shadow: var(--shadow-tile);
  }
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }
  .title {
    font: var(--type-label);
    color: var(--ink-muted);
  }
  .switches {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .note {
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .failed {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
  }
  .rows {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .section {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .machine {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding-block: var(--space-1);
    font: var(--type-label);
    color: var(--ink-muted);
  }
  .row {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
    align-items: center;
    gap: var(--space-3);
    min-block-size: 28px;
  }
  .name {
    overflow: hidden;
    font: var(--type-body);
    color: var(--ink-strong);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  a.name {
    text-decoration: none;
  }
  a.name:hover {
    text-decoration: underline;
  }
  .machine-name {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  /* The bar and its value: the fill takes its share of the room the value
     leaves, and the value stands at its tip. */
  .measure {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-inline-size: 0;
  }
  .fill {
    flex: 0 0 auto;
    inline-size: calc(var(--share) * (100% - 5.5rem));
    min-inline-size: 2px;
    block-size: 8px;
    border-radius: var(--radius-hair);
    background: var(--meter-share);

    @media (prefers-reduced-motion: no-preference) {
      transition: inline-size var(--dur-morph) var(--ease-drawer);
    }
  }
  .value {
    flex: 0 0 auto;
    font: var(--type-meta);
    color: var(--ink-strong);
  }

  @media (max-width: 639px) {
    .card {
      padding: var(--space-4);
    }
    .row {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--space-1);
      padding-block: var(--space-1);
    }
  }
</style>
