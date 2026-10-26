<script lang="ts">
  /**
   * Where it goes (owner pick f): one block, one
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
  import type {
    HarnessKind,
    UsageGroupBy,
    UsageSummary,
    UsageSummaryRow,
  } from "@cawco/core";
  import { detach } from "@cawco/core/detach";
  import { failureWords } from "#lib/cawco/hub-read.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import * as Tooltip from "#lib/components/ui/tooltip/index.js";
  import { cawco } from "../client.svelte";
  import { GroupRelay } from "../home/group-relay.svelte";
  import type { RelayLine } from "../home/relay-plan";
  import { conversationHref } from "../links";
  import { reveal, revealOut } from "../motion/curves.svelte";
  import { reflow } from "../motion/rows.svelte";
  import OsMark from "../OsMark.svelte";
  import { type SessionSpend, sessionsCsv } from "../session-export";
  import { compactNumber, money, summaryReader, totalTokensOf } from "../usage";
  import ReadFailed from "./ReadFailed.svelte";

  /** The harnesses this panel reads spend for. */
  type Harness = Extract<HarnessKind, "claude" | "opencode">;
  /** The folds a reader picks between, in the order offered. */
  type Grouping = Extract<UsageGroupBy, "session" | "model" | "machine">;
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

  const summaryOf = summaryReader();
  const keyOf = (h: Harness, g: Grouping, s: number) => `${h}:${g}:${s}`;
  /** What the list draws: the last view whose rows were read. */
  let view = $state.raw<View | null>(null);
  let failed = $state<string | null>(null);
  let latest = "";

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
        failed = failureWords(cause);
      }
    }
  }

  $effect(() => {
    detach(read(), "read");
  });

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

  /** What a change keeps of what is drawn, beyond its lines: the "more" line's words. */
  interface Kept {
    more: string | null;
  }
  /** The boxes whose heights a change drives: each group, and the "more" line's. */
  const BOXES =
    ':scope > [data-slot="group"], :scope > [data-slot="more-slot"]';

  const relayed = new GroupRelay<Item, Group, Line, Kept>({
    groups: () => groups,
    place,
    boxes: BOXES,
    screen: '[data-slot="group"], [data-slot="more-slot"]',
  });
  const plan = $derived(relayed.plan);
  const drawn = $derived(relayed.drawn);
  const { swap, enterAnim, leaveAnim, headAnim, headUnseen } = relayed;

  /** Shows `next`: in place for a new range, in a relay for a new list. */
  function show(next: View): void {
    const was = view;
    if (!(was && relayed.list)) {
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

  /** Changes what the list shows to `fresh`, as one relay: `apply` changes the state. */
  function relay(
    dir: number,
    fresh: Group[],
    freshMore: string | null,
    apply: () => void
  ): void {
    relayed.relay(dir, {
      fresh,
      more: [{ key: "more", box: "more", before: more, after: freshMore }],
      keep: { more },
      line: (line) => line,
      apply,
    });
  }

  /** "Show N more": the rest of the rows arrive in place, in the same relay. */
  function showAll(): void {
    relay(1, groupsOf(view, true), null, () => {
      all = true;
    });
  }

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
        if (!entry) {
          continue;
        }
        for (const row of entry.summary.rows) {
          spend.set(String(row.key), { harness: entry.h, row });
        }
      }
      return { name: "fleet-sessions.csv", body: await sessionsCsv(spend) };
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

<section
  data-slot="where-it-goes-card"
  aria-labelledby="where-title"
  class="flex flex-col gap-space-4 rounded-lg bg-surface-raised p-space-5 shadow-tile max-phone:p-space-4"
>
  <header
    data-slot="head"
    class="flex flex-wrap items-center justify-between gap-space-3"
  >
    <h2 data-slot="title" class="type-label text-ink-muted" id="where-title">
      Where it goes
    </h2>
    <div class="flex flex-wrap gap-space-2">
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
    <p data-slot="note" class="type-meta text-ink-muted">
      No 5-hour window is running for
      {harness === "claude" ? "Claude" : "opencode"}.
    </p>
  {:else if failed && !view}
    <ReadFailed {read} said="Could not read where it goes. {failed}" />
  {:else if !view}
    <div
      data-skeleton
      class="flex flex-col gap-space-2"
      data-slot="skeleton-rows"
      out:revealOut
    >
      {#each [0, 1, 2, 3, 4] as row (row)}
        <Skeleton class="w-full" height="line" />
      {/each}
    </div>
  {:else if empty && !plan}
    <p data-slot="note" class="type-meta text-ink-muted" in:reveal>
      Nothing recorded in this range.
    </p>
  {:else}
    <div
      data-slot="list"
      class="flex flex-col overflow-x-clip"
      bind:this={relayed.list}
      in:reveal
      {@attach reflow()}
    >
      {#each drawn as entry (entry.group.machineId)}
        {@const id = entry.group.machineId}
        <div
          data-slot="group"
          class="relative flex flex-col not-first:pt-space-2"
          data-flip={plan ? undefined : "box"}
          data-kind={entry.kind}
          data-machine={id}
        >
          {#if id !== FLAT}
            <!-- Where these ran, said once for the rows under it. -->
            <h3
              data-slot="machine"
              class="mark-line type-label m-0 flex items-center gap-space-2 py-space-1 text-ink-muted"
              data-key="head:{id}"
              style:animation={headAnim(entry.kind, id)}
              style:opacity={headUnseen(entry.kind, id) ? "0" : undefined}
            >
              <OsMark class="size-icon-md shrink-0" os={entry.group.os} />
              <span>{entry.group.name}</span>
            </h3>
          {/if}
          <div class="relative flex flex-col gap-space-1">
            {#if plan?.layered.has(id) && entry.gone.length}
              <!-- The rows this group had, leaving in the places the new
                   ones take, each new one arriving as its place clears. -->
              {@render leaving(entry.gone, true)}
            {/if}
            {#each entry.rows as item (`${swap.gen}:${item.id}`)}
              <div
                data-flip={plan ? undefined : ""}
                data-key={item.id}
                style:animation={enterAnim(item.id)}
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
        data-slot="more-slot"
        class="flex flex-col items-start pt-space-2 kind-gone:pt-0"
        data-kind={more ? "stay" : "gone"}
        data-machine="more"
      >
        {#if more}
          <span data-key="more" style:animation={enterAnim("more")}>
            <Button label={more} onclick={showAll} size="sm" variant="ghost" />
          </span>
        {:else if plan?.more}
          <span
            aria-hidden="true"
            class="type-label text-ink-muted"
            style:animation={leaveAnim("more")}>{plan.more}</span
          >
        {/if}
      </div>
    </div>
  {/if}

  {#if harness === "claude"}
    <p data-slot="note" class="type-meta text-ink-muted">
      ~ is the API price of work the plan already covers.
    </p>
  {/if}
</section>

{#snippet line(item: Item, live: boolean)}
  <div
    data-slot="row"
    class="grid min-h-(--row-compact-h) grid-cols-(--row-cols) items-center gap-space-3 max-phone:grid-cols-1 max-phone:gap-space-1 max-phone:py-space-1"
    style:--row-cols="minmax(0, 2fr) minmax(0, 3fr)"
  >
    {#if item.href && live}
      <a
        data-slot="name"
        class="type-body truncate text-ink-strong no-underline hover:underline"
        href={item.href}
        title={item.label}>{item.label}</a
      >
    {:else if item.os}
      <span
        data-slot="name"
        class="mark-line type-body flex items-center gap-space-2 truncate text-ink-strong"
      >
        <OsMark class="size-icon-md shrink-0" os={item.os} />
        <span>{item.label}</span>
      </span>
    {:else}
      <span
        data-slot="name"
        class="type-body truncate text-ink-strong"
        title={item.label}>{item.label}</span
      >
    {/if}
    {#if live}
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <span {...props} class="flex min-w-0 items-center gap-space-2">
              <span
                data-slot="fill"
                class="h-c-meter-bar-h w-(--fill-w) min-w-space-row flex-none rounded-hair bg-meter-share motion-safe:transition-[inline-size] motion-safe:duration-(--dur-morph) motion-safe:ease-drawer"
                style:--share={item.share}
                style:--fill-w={"calc(var(--share) * (100% - var(--c-usage-figure-w)))"}
              ></span>
              <span
                data-where-it-goes-value
                data-slot="num"
                class="type-meta num flex-none text-ink-strong"
                >{item.value}</span
              >
            </span>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content>{item.tip}</Tooltip.Content>
      </Tooltip.Root>
    {:else}
      <span class="flex min-w-0 items-center gap-space-2">
        <span
          data-slot="fill"
          class="h-c-meter-bar-h w-(--fill-w) min-w-space-row flex-none rounded-hair bg-meter-share motion-safe:transition-[inline-size] motion-safe:duration-(--dur-morph) motion-safe:ease-drawer"
          style:--share={item.share}
          style:--fill-w="calc(var(--share) * (100% - var(--c-usage-figure-w)))"
        ></span>
        <span
          data-where-it-goes-value
          data-slot="num"
          class="type-meta num flex-none text-ink-strong">{item.value}</span
        >
      </span>
    {/if}
  </div>
{/snippet}

{#snippet leaving(lines: Line[], layer: boolean)}
  <div
    data-layer={layer || undefined}
    aria-hidden="true"
    class="pointer-events-none flex flex-col gap-space-1 data-layer:absolute data-layer:inset-x-0 data-layer:top-0"
    data-leaving
    inert
  >
    {#each lines.filter((l) => l.row) as l (l.key)}
      <div style:animation={leaveAnim(l.key)}>
        {@render line(l.row as Item, false)}
      </div>
    {/each}
  </div>
{/snippet}
