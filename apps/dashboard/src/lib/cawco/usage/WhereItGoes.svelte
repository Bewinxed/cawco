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
   * order and their bars tween once (motion/rows `reflow`), nothing staggers.
   *
   * A new harness or grouping swaps the rows in a relay (motion/list-swap,
   * the home's Working/Finished one): the old rows leave top down toward the
   * side away from the choice, and each new row arrives the moment the old
   * row in its place has gone. What both lists share stays: the block's
   * header and footnote, and a machine's header in Sessions when that
   * machine ran sessions of both. Each group's height is driven
   * (motion/relay-boxes) so an old row never overflows into the group below.
   */
  import type { UsageSummary, UsageSummaryRow } from "@cawco/core";
  import { flushSync } from "svelte";
  import { Button } from "$lib/components/ui/button";
  import { TabItem, Tabs, TabsList } from "$lib/components/ui/fluid-tabs";
  import { Skeleton } from "$lib/components/ui/skeleton";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Tooltip from "$lib/components/ui/tooltip";
  import { IconRefresh } from "$lib/icons";
  import { cawco } from "../client.svelte";
  import { type Arrival, planRelay, type RelayLine } from "../home/relay-plan";
  import { conversationHref } from "../links";
  import { dur, motionOk } from "../motion/curves.svelte";
  import { IN_MS, ListSwap } from "../motion/list-swap.svelte";
  import {
    boxHeights,
    driveHeights,
    onScreen,
    waitForBoxes,
  } from "../motion/relay-boxes";
  import { reflow, reflowsFrom, reread } from "../motion/rows.svelte";
  import OsMark from "../OsMark.svelte";
  import { type SessionSpend, sessionsCsv } from "../session-export";
  import { compactNumber, money, totalTokensOf } from "../usage";

  type Harness = "claude" | "opencode";
  type Grouping = "session" | "model" | "machine";
  const HARNESSES: Harness[] = ["claude", "opencode"];
  const GROUPINGS: Grouping[] = ["session", "model", "machine"];

  let {
    since,
  }: {
    /**
     * Where the range starts for each harness: null when it has no such
     * window, undefined while that is not known yet.
     */
    since: Record<Harness, number | null | undefined>;
  } = $props();

  /** The switches as chosen; the list follows once their rows are read. */
  let harness = $state<Harness>("claude");
  let grouping = $state<Grouping>("session");
  /** The list shows every row rather than the first eight. */
  let all = $state(false);

  const start = $derived(since[harness]);

  /** One read, and what it was read for. */
  interface View {
    grouping: Grouping;
    harness: Harness;
    start: number;
    summary: UsageSummary;
  }

  const cache = new Map<string, UsageSummary>();
  const keyOf = (h: Harness, g: Grouping, s: number) => `${h}:${g}:${s}`;
  /** What the list draws: the last view whose rows were read. */
  let view = $state.raw<View | null>(null);
  let failed = $state<string | null>(null);
  let retrying = $state(false);
  let latest = "";

  async function summaryOf(
    h: Harness,
    g: Grouping,
    s: number
  ): Promise<UsageSummary> {
    const key = keyOf(h, g, s);
    const known = cache.get(key);
    if (known) {
      return known;
    }
    const response = await fetch(
      `/api/usage/summary?harness=${h}&groupBy=${g}&since=${s}`
    );
    if (!response.ok) {
      throw new Error(`The hub answered ${response.status}.`);
    }
    const summary = (await response.json()) as UsageSummary;
    cache.set(key, summary);
    return summary;
  }

  /** Reads what the switches chose, then shows it: in place, or in a relay. */
  async function read(): Promise<void> {
    const h = harness;
    const g = grouping;
    const s = start;
    failed = null;
    if (s === undefined || s === null) {
      latest = "";
      return;
    }
    const want = keyOf(h, g, s);
    latest = want;
    try {
      const summary = await summaryOf(h, g, s);
      if (latest !== want) {
        return;
      }
      // Out of the effect that asked: the relay flushes the DOM itself.
      queueMicrotask(() =>
        show({ harness: h, grouping: g, start: s, summary })
      );
    } catch (cause) {
      if (latest === want) {
        failed = cause instanceof Error ? cause.message : String(cause);
      }
    }
  }

  $effect(() => {
    // biome-ignore lint/complexity/noVoid: fire-and-forget — read() reads the switches before it awaits, so the effect reruns on them, and it owns its own state
    void read();
  });

  async function retry(): Promise<void> {
    retrying = true;
    await read();
    retrying = false;
  }

  /* ---- What a view draws -------------------------------------------- */

  /** A drawn row: everything it shows, so a leaving copy draws as it was. */
  interface Item {
    href?: string;
    id: string;
    label: string;
    machineId: string;
    /** The machine row's OS mark. */
    os?: string;
    share: number;
    tip: string;
    value: string;
  }
  interface Group {
    machineId: string;
    name: string;
    os: string;
    rows: Item[];
  }
  type Line = RelayLine<Item>;

  /** Rows a list shows before "Show N more". */
  const TOP = 8;
  /** The one group of a list that has no machine headers. */
  const FLAT = "all";

  const rankedOf = (v: View) =>
    [...v.summary.rows].sort((a, b) => b.costUsd - a.costUsd);

  function itemOf(v: View, row: UsageSummaryRow): Item {
    const total = v.summary.totals.costUsd;
    const share = total > 0 ? row.costUsd / total : 0;
    const approx = v.harness === "claude" ? "~" : "";
    return {
      id: `${v.grouping}:${String(row.key)}`,
      machineId: v.grouping === "session" ? (row.machine?.id ?? "") : FLAT,
      label: row.label,
      href:
        v.grouping === "session"
          ? conversationHref(
              row.instanceId ?? String(row.key),
              cawco.instanceIndex
            )
          : undefined,
      os: v.grouping === "machine" ? row.machine?.os : undefined,
      share,
      value: `${approx}${money(row.costUsd)}`,
      tip: `${Math.round(share * 100)}% of the total · ${compactNumber(totalTokensOf(row))} tokens · ${row.messages.toLocaleString()} messages`,
    };
  }

  /** The machines' order, the one every list keeps; a flat list first. */
  const place = (id: string): number => {
    if (id === FLAT) {
      return -1;
    }
    const at = cawco.machines.findIndex((m) => m.machineId === id);
    return at === -1 ? Number.MAX_SAFE_INTEGER : at;
  };

  /** A view's groups: sessions under their machine, else one flat list. */
  function groupsOf(v: View | null, every: boolean): Group[] {
    if (!v) {
      return [];
    }
    const ranked = rankedOf(v);
    const rows = every ? ranked : ranked.slice(0, TOP);
    const groups = new Map<string, Group>();
    for (const row of rows) {
      const item = itemOf(v, row);
      const group = groups.get(item.machineId) ?? {
        machineId: item.machineId,
        name: row.machine?.hostname ?? "",
        os: row.machine?.os ?? "",
        rows: [],
      };
      group.rows.push(item);
      groups.set(item.machineId, group);
    }
    return [...groups.values()].sort(
      (a, b) => place(a.machineId) - place(b.machineId)
    );
  }

  /** The words on the line under the list: "Show N more", or none. */
  function moreOf(v: View | null, every: boolean): string | null {
    const count = v?.summary.rows.length ?? 0;
    return !every && count > TOP ? `Show ${count - TOP} more` : null;
  }

  const groups = $derived(groupsOf(view, all));
  const more = $derived(moreOf(view, all));
  const empty = $derived(view !== null && view.summary.rows.length === 0);

  /* ---- The relay ---------------------------------------------------- */

  /** One change of the rows in flight: what leaves, what arrives, when. */
  interface Plan {
    enter: Map<string, Arrival>;
    layered: Set<string>;
    leave: Map<string, number>;
    more: string | null;
    old: Group[];
  }
  /** The boxes whose heights a change drives: each group, and the "more" line's. */
  const BOXES = ":scope > .group, :scope > .more-slot";

  let plan = $state.raw<Plan | null>(null);
  const swap = new ListSwap<Line>();
  let listEl = $state<HTMLElement>();
  let heights: Animation[] = [];
  let settle: ReturnType<typeof setTimeout> | undefined;

  /** Every machine either side of a change, in one order. */
  const drawn = $derived.by(() => {
    const live = new Map(groups.map((g) => [g.machineId, g]));
    const old = new Map((plan?.old ?? []).map((g) => [g.machineId, g]));
    const ids = [...new Set([...old.keys(), ...live.keys()])].sort(
      (a, b) => place(a) - place(b)
    );
    return ids.map((id) => {
      const fresh = live.get(id);
      const was = old.get(id);
      let kind: "stay" | "new" | "gone" = "stay";
      if (plan && !was) {
        kind = "new";
      } else if (!fresh) {
        kind = "gone";
      }
      return {
        group: (fresh ?? was) as Group,
        rows: fresh?.rows ?? [],
        gone: swap.leaving.filter((line) => line.machineId === id),
        kind,
      };
    });
  });

  /** Shows `next`: in place for a new range, in a relay for a new list. */
  function show(next: View): void {
    const was = view;
    if (!(was && listEl)) {
      view = next;
      return;
    }
    if (was.harness === next.harness && was.grouping === next.grouping) {
      view = next;
      return;
    }
    const dir =
      was.harness === next.harness
        ? GROUPINGS.indexOf(next.grouping) - GROUPINGS.indexOf(was.grouping)
        : HARNESSES.indexOf(next.harness) - HARNESSES.indexOf(was.harness);
    relay(dir, groupsOf(next, false), moreOf(next, false), () => {
      view = next;
      all = false;
    });
  }

  /**
   * Changes what the list shows, as one relay: `apply` changes the state,
   * and every line, header and height moves from what is drawn this frame
   * to what that state draws.
   */
  function relay(
    dir: number,
    fresh: Group[],
    freshMore: string | null,
    apply: () => void
  ): void {
    const list = listEl;
    const before = list ? boxHeights(list, BOXES) : new Map<string, number>();
    // Mid-change, only what is on screen this frame has anything to leave.
    const seen = plan && list ? onScreen(list, ".group, .more-slot") : null;
    const drawnNow = (key: string) => !seen || seen.has(key);
    const old: Group[] = drawn
      .filter((entry) => entry.kind !== "gone")
      .map((entry) => ({
        ...entry.group,
        rows: entry.rows.filter((row) => drawnNow(row.id)),
      }));
    for (const run of heights) {
      run.cancel();
    }
    heights = [];

    const relayed = planRelay(
      old,
      fresh,
      [{ key: "more", box: "more", before: more, after: freshMore }],
      drawnNow
    );
    const base = {
      layered: relayed.layered,
      leave: relayed.leave,
      more,
      old,
    };
    const moving = motionOk.current;

    reread(reflowsFrom(list ?? null));
    flushSync(() => {
      plan = { ...base, enter: relayed.enter };
      swap.swap(relayed.lines, dir, { keep: relayed.lines.length });
      apply();
    });

    let done = dur("--dur-panel");
    if (list && moving) {
      const driven = driveHeights(list, BOXES, before, relayed.lastOut);
      heights = driven.runs;
      const enter = waitForBoxes(driven.opened, relayed.enter);
      done = Math.max(
        driven.done,
        ...relayed.lastOut.values(),
        ...[...enter.values()].map(
          (at) => ListSwap.enterAt(at.i, at.notBefore) + IN_MS
        )
      );
      flushSync(() => {
        plan = { ...base, enter };
      });
    }

    swap.hold(moving ? done : 0);
    clearTimeout(settle);
    settle = setTimeout(
      () => {
        flushSync(() => {
          plan = null;
        });
        for (const run of heights) {
          run.cancel();
        }
        heights = [];
        reread(reflowsFrom(listEl ?? null));
      },
      moving ? done : 0
    );
  }

  /** "Show N more": the rest of the rows arrive in place, in the same relay. */
  function showAll(): void {
    relay(1, groupsOf(view, true), null, () => {
      all = true;
    });
  }

  const enterAnim = (key: string): string => {
    const at = plan?.enter.get(key);
    return at ? `animation:${swap.rowAnim(at.i, at.notBefore)}` : "";
  };
  const leaveAnim = (key: string): string => {
    const at = plan?.leave.get(key);
    return at === undefined ? "" : `animation:${swap.leaveAnim(at)}`;
  };
  /** A header arriving with a new machine, leaving with a gone one, or unseen. */
  const headStyle = (kind: "stay" | "new" | "gone", id: string): string => {
    const key = `head:${id}`;
    if (kind !== "gone") {
      return enterAnim(key);
    }
    return plan?.leave.has(key) ? leaveAnim(key) : "opacity:0";
  };

  /* ---- Export ------------------------------------------------------- */

  /**
   * The list as a file. Sessions is the fleet's session ledger (every
   * session, live and stored) with the range's spend for both harnesses;
   * Models and Machines are the rows of the harness and range on screen.
   */
  export async function csv(): Promise<{ name: string; body: string }> {
    const v = view;
    if (!v) {
      return { name: "usage.csv", body: "" };
    }
    if (v.grouping === "session") {
      const reads = await Promise.all(
        HARNESSES.map(async (h) => {
          const s = since[h];
          return s === undefined || s === null
            ? null
            : { h, summary: await summaryOf(h, "session", s) };
        })
      );
      const spend: SessionSpend = new Map();
      for (const entry of reads) {
        for (const row of entry?.summary.rows ?? []) {
          spend.set(String(row.key), { harness: entry?.h ?? "claude", row });
        }
      }
      return { name: "fleet-sessions.csv", body: sessionsCsv(spend) };
    }
    const cell = (value: string) => `"${value.replaceAll('"', '""')}"`;
    const head = [
      v.grouping === "model" ? "Model" : "Machine",
      v.harness === "claude" ? "API price (USD)" : "Spend (USD)",
      "Input",
      "Output",
      "Cache write",
      "Cache read",
      "Messages",
    ];
    const lines = rankedOf(v).map((row) =>
      [
        row.label,
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
      name: `usage-${v.harness}-${v.grouping}.csv`,
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
  {:else if failed && !view}
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
  {:else if !view}
    <div class="skeleton" data-slot="skeleton-rows">
      {#each [0, 1, 2, 3, 4] as row (row)}
        <Skeleton class="h-6 w-full" />
      {/each}
    </div>
  {:else if empty && !plan}
    <p class="note">Nothing recorded in this range.</p>
  {:else}
    <div class="list" bind:this={listEl} {@attach reflow()}>
      {#each drawn as entry (entry.group.machineId)}
        {@const id = entry.group.machineId}
        <div
          class="group"
          data-flip={plan ? undefined : 'box'}
          data-kind={entry.kind}
          data-machine={id}
        >
          {#if id !== FLAT}
            <!-- Where these ran, said once for the rows under it. -->
            <h3
              class="machine"
              data-key="head:{id}"
              style={headStyle(entry.kind, id)}
            >
              <OsMark class="size-4 shrink-0" os={entry.group.os} />
              {entry.group.name}
            </h3>
          {/if}
          <div class="rows">
            {#if plan?.layered.has(id) && entry.gone.length}
              <!-- The rows this group had, leaving in the places the new
                   ones take, each new one arriving as its place clears. -->
              {@render leaving(entry.gone, true)}
            {/if}
            {#each entry.rows as item (`${swap.gen}:${item.id}`)}
              <div
                data-flip={plan ? undefined : ''}
                data-key={item.id}
                style={enterAnim(item.id)}
              >
                {@render line(item, true)}
              </div>
            {/each}
            {#if !plan?.layered.has(id) && entry.gone.length}
              {@render leaving(entry.gone, false)}
            {/if}
          </div>
        </div>
      {/each}
      <!-- The list's last line: the rest of the rows. It comes and goes in
           the relay like any other line. -->
      <div
        class="more-slot"
        data-kind={more ? 'stay' : 'gone'}
        data-machine="more"
      >
        {#if more}
          <span data-key="more" style={enterAnim('more')}>
            <Button label={more} onclick={showAll} size="sm" variant="ghost" />
          </span>
        {:else if plan?.more}
          <span aria-hidden="true" class="more-gone" style={leaveAnim('more')}
            >{plan.more}</span
          >
        {/if}
      </div>
    </div>
  {/if}

  {#if harness === 'claude'}
    <p class="note">~ is the API price of work the plan already covers.</p>
  {/if}
</section>

{#snippet line(item: Item, live: boolean)}
  <div class="row">
    {#if item.href && live}
      <a class="name" href={item.href} title={item.label}>{item.label}</a>
    {:else if item.os}
      <span class="name machine-name">
        <OsMark class="size-4 shrink-0" os={item.os} />
        {item.label}
      </span>
    {:else}
      <span class="name" title={item.label}>{item.label}</span>
    {/if}
    {#if live}
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <span {...props} class="measure">
              <span class="fill" style:--share={item.share}></span>
              <span class="value num">{item.value}</span>
            </span>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content>{item.tip}</Tooltip.Content>
      </Tooltip.Root>
    {:else}
      <span class="measure">
        <span class="fill" style:--share={item.share}></span>
        <span class="value num">{item.value}</span>
      </span>
    {/if}
  </div>
{/snippet}

{#snippet leaving(lines: Line[], layer: boolean)}
  <div
    aria-hidden="true"
    class={layer ? 'leaving layer' : 'leaving'}
    data-leaving
    inert
  >
    {#each lines.filter((l) => l.row) as l (l.key)}
      <div style={leaveAnim(l.key)}>
        {@render line(l.row as Item, false)}
      </div>
    {/each}
  </div>
{/snippet}

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
  .skeleton {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  /* The groups stand flush: each is one box whose height a relay drives,
     its header and rows inside it, so a group closing takes its room with
     it and nothing else moves except on the layout. */
  .list {
    display: flex;
    flex-direction: column;
    overflow-x: clip;
  }
  .group {
    position: relative;
    display: flex;
    flex-direction: column;
  }
  .group + .group {
    padding-block-start: var(--space-2);
  }
  .rows {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .leaving {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    pointer-events: none;
  }
  /* Over the rows' top: each old row in the place its successor takes. */
  .leaving.layer {
    position: absolute;
    inset: 0 0 auto;
  }
  .machine {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin: 0;
    padding-block: var(--space-1);
    font: var(--type-label);
    color: var(--ink-muted);
  }
  .more-slot {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    padding-block-start: var(--space-2);
  }
  .more-slot[data-kind="gone"] {
    padding-block-start: 0;
  }
  .more-gone {
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
