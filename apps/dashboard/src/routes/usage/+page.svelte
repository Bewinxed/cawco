<script lang="ts">
  import type { LimitWindow } from "@whiffle/core";
  import { REMOVED_MACHINE } from "@whiffle/core";
  import { invalidateAll } from "$app/navigation";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Card from "$lib/components/ui/card";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Table from "$lib/components/ui/table";
  import { IconRefresh } from "$lib/icons";
  import { whiffle } from "$lib/whiffle/client.svelte";
  import HarnessGlyph from "$lib/whiffle/HarnessGlyph.svelte";
  import { conversationHref } from "$lib/whiffle/links";
  import StatTile from "$lib/whiffle/StatTile.svelte";
  import { compactNumber, type UsageSummaryRow, usd } from "$lib/whiffle/usage";
  import BreakdownTable from "$lib/whiffle/usage/BreakdownTable.svelte";
  import DailyChart from "$lib/whiffle/usage/DailyChart.svelte";
  import Figure from "$lib/whiffle/usage/Figure.svelte";
  /**
   * The usage surface: "am I about to blow the budget?" as a glance against a
   * threshold, not as a calculation.
   *
   * JOURNEY.md content blocks (in order):
   *   1. Connection band — handled by Shell.svelte (skip)
   *   2. Spend against threshold — the lead visual
   *   3. Limit windows — per-window reading with age
   *   4. Spend by session — ordered by cost, top-spend drills in
   *   5. Unpriced models — what the total cannot account for
   *
   * Structure locked by the user (2026-08-16): split by harness. The two
   * harnesses never merge into one total, because they are not the same kind of
   * number — Claude is a subscription whose real constraint is a percentage, and
   * opencode is real money. Making that the layout means the page cannot lie by
   * addition.
   */
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  /** The hub could not be read: reading it again, shown on the button. */
  let rereading = $state(false);
  async function reread(): Promise<void> {
    rereading = true;
    await invalidateAll();
    rereading = false;
  }

  /**
   * Limits are account-scoped, not machine-scoped: every host signed in to the
   * same account reads the same numbers. So the first machine with a real
   * reading speaks for all of them.
   */
  const reading = $derived(
    data.limits?.machines.find((m) => m.limits.error === null)?.limits ??
      // A stale reading beats an empty room: backoff keeps the last good
      // windows with the error attached, and old numbers outrank "HTTP 429".
      data.limits?.machines.find(
        (m) => m.limits.stale && m.limits.windows.length > 0
      )?.limits ??
      null
  );
  const readingError = $derived(
    reading === null ? (data.limits?.machines[0]?.limits.error ?? null) : null
  );

  const readingErrorMessage = $derived.by(() => {
    if (readingError === "not signed in") {
      return "This machine is not signed in to Claude, so there is no limit to read. Sign in on the machine to restore this reading.";
    }
    if (readingError === "token expired") {
      return "The Claude login on this machine has expired. Claude Code owns that file — signing in there restores this reading.";
    }
    return readingError;
  });

  const windows = $derived(reading?.windows ?? []);
  /** Session first, then the weekly windows fullest-first: worst news nearest the top. */
  const orderedWindows = $derived([
    ...windows.filter((w) => w.group === "session"),
    ...windows
      .filter((w) => w.group === "weekly")
      .sort((a, b) => b.percent - a.percent),
    ...windows.filter((w) => w.group !== "session" && w.group !== "weekly"),
  ]);
  const binding = $derived(
    orderedWindows.find((w) => w.isActive) ?? orderedWindows[0] ?? null
  );

  const band = (pct: number): "ok" | "warn" | "bad" => {
    if (pct >= 90) {
      return "bad";
    }
    return pct >= 70 ? "warn" : "ok";
  };

  const windowLabel = (w: LimitWindow): string => {
    if (w.group === "session") {
      return "5-hour";
    }
    return w.scopeLabel ? `Weekly · ${w.scopeLabel}` : "Weekly";
  };

  /** A live clock; the countdowns only ever show minutes. */
  let now = $state(Date.now());
  $effect(() => {
    const timer = setInterval(() => {
      now = Date.now();
    }, 30_000);
    return () => clearInterval(timer);
  });

  function resetsIn(resetsAt: string | null, at: number): string {
    if (!resetsAt) {
      return "";
    }
    const diff = new Date(resetsAt).getTime() - at;
    if (diff <= 0) {
      return "resetting";
    }
    const mins = Math.floor(diff / 60_000);
    const h = Math.floor(mins / 60);
    return h > 0 ? `${h}h ${mins % 60}m` : `${mins}m`;
  }

  const planLabel = $derived(
    reading?.planTier
      ? reading.planTier
          .replace(/^default_claude_/, "")
          .replace(/_/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase())
      : null
  );

  /** Spend against threshold — the lead visual per JOURNEY.md block 2. */
  const spendUsed = $derived(reading?.spendUsed ?? null);
  const spendLimit = $derived(reading?.spendLimit ?? null);
  const spendPct = $derived(
    spendUsed !== null && spendLimit !== null && spendLimit > 0
      ? Math.min((spendUsed / spendLimit) * 100, 100)
      : null
  );
  const spendBand = $derived(spendPct === null ? "ok" : band(spendPct));

  /** How long ago the reading was fetched. */
  const readingAge = $derived.by(() => {
    if (!reading?.fetchedAt) {
      return null;
    }
    const diff = now - reading.fetchedAt;
    if (diff < 60_000) {
      return "just now";
    }
    const mins = Math.floor(diff / 60_000);
    if (mins < 60) {
      return `${mins}m ago`;
    }
    const h = Math.floor(mins / 60);
    return `${h}h ${mins % 60}m ago`;
  });

  /** Top models by spend; the tail is noise on a glance surface. */
  const topRows = (
    rows: UsageSummaryRow[] | undefined,
    n: number
  ): UsageSummaryRow[] =>
    [...(rows ?? [])].sort((a, b) => b.costUsd - a.costUsd).slice(0, n);

  const claudeRows = $derived(topRows(data.claude?.rows, 6));
  const openCodeRows = $derived(topRows(data.opencode?.rows, 6));
  const claudeTotals = $derived(data.claude?.totals ?? null);
  const openCodeTotals = $derived(data.opencode?.totals ?? null);

  const missing = $derived([
    ...new Set([
      ...(data.claude?.missingPricing ?? []),
      ...(data.opencode?.missingPricing ?? []),
    ]),
  ]);

  /**
   * Sessions by spend — JOURNEY.md block 4. Derived from live instances whose
   * stats this browser has, ordered by cost descending, capped at 10 rows.
   */
  const sessionsBySpend = $derived.by(() => {
    const rows: {
      id: string;
      label: string;
      machine: string;
      harness: string | null | undefined;
      cost: number;
      contextPct: number | null;
    }[] = [];
    for (const instance of whiffle.runningInstances) {
      const stats = whiffle.statsOf(instance.id);
      if (stats.cost === null) {
        continue;
      }
      const machine = whiffle.machines.find(
        (m) => m.machineId === instance.machineId
      );
      rows.push({
        id: instance.id,
        label:
          instance.title ??
          instance.derivedTitle ??
          instance.cwd.split("/").pop() ??
          instance.id,
        machine: machine?.hostname ?? REMOVED_MACHINE,
        harness: instance.harness,
        cost: stats.cost,
        contextPct: stats.contextPct,
      });
    }
    rows.sort((a, b) => b.cost - a.cost);
    return rows.slice(0, 10);
  });

  /** Blocks, newest first, grouped under the day they started. */
  const allBlocks = $derived(
    [
      ...data.blocksClaude.map((b) => ({ ...b, harness: "Claude" })),
      ...data.blocksOpenCode.map((b) => ({ ...b, harness: "opencode" })),
    ]
      .filter((b) => !b.isGap)
      .sort((a, b) => b.startTime - a.startTime)
  );

  const dayKey = (ts: number): string =>
    new Date(ts).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });

  const dayGroups = $derived.by(() => {
    const groups: { day: string; blocks: typeof allBlocks }[] = [];
    for (const block of allBlocks) {
      const day = dayKey(block.startTime);
      const last = groups.at(-1);
      if (last && last.day === day) {
        last.blocks.push(block);
      } else {
        groups.push({ day, blocks: [block] });
      }
    }
    return groups;
  });

  const clock = (ts: number): string =>
    new Date(ts).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });

  /**
   * A block only minutes old divides by a tiny elapsed span, so its projection
   * is arithmetic noise. Ten minutes is where it starts meaning something.
   */
  const PROJECTABLE_MS = 10 * 60 * 1000;
  const projectable = (b: { firstTs: number; lastTs: number }): boolean =>
    b.lastTs - b.firstTs >= PROJECTABLE_MS;

  /** A live window's burn rate, and where it is on pace to end once that means something. */
  const paceOf = (
    block: (typeof allBlocks)[number],
    costPerHour: number
  ): string => {
    const rate = `${usd(costPerHour)}/h`;
    if (!(projectable(block) && block.projection)) {
      return rate;
    }
    const approx = block.harness === "Claude" ? "~" : "";
    return `${rate} · on pace for ${approx}${usd(block.projection.totalCost)}`;
  };
</script>

<svelte:head>
  <title>Usage &middot; Whiffle</title>
</svelte:head>

<div class="page">
  <div class="col">
    <p class="sub">
      Am I about to blow the budget? Claude is a subscription whose constraint
      is a percentage; opencode is real money. The two are never added together.
    </p>

    {#if data.error}
      <div class="page-error" role="alert">
        <p class="note">{data.error}</p>
        <Button
          icon={IconRefresh}
          label="Retry"
          onclick={reread}
          pending={rereading}
          pendingLabel="Retrying…"
          size="sm"
          variant="outline"
        />
      </div>
    {/if}

    <!-- JOURNEY.md block 2: Spend against threshold — the lead visual. -->
    {#if readingError}
      <Card.Root class="q-card">
        <Card.Content class="q-body">
          <p class="note" role="alert">
            {readingErrorMessage}
          </p>
        </Card.Content>
      </Card.Root>
    {:else if !(reading || data.limits)}
      <Card.Root class="q-card">
        <Card.Content class="q-body">
          <p class="note">
            No limit reading yet. Connect a machine to see spend here.
          </p>
        </Card.Content>
      </Card.Root>
    {:else}
      <section aria-label="Spend against threshold" class="hero">
        <div class="hero-main">
          {#if spendPct !== null && spendUsed !== null && spendLimit !== null}
            <div class="hero-spend">
              <span class="hero-amount {spendBand}"
                ><Figure text={usd(spendUsed)} /></span
              >
              <span class="hero-limit"
                ><Figure text="/ {usd(spendLimit)}" /></span
              >
            </div>
            <span
              aria-label="Spend against threshold"
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={spendPct}
              class="hero-track"
              role="progressbar"
            >
              <span
                class="hero-fill {spendBand}"
                style="transform: scaleX({(Math.max(spendPct, 1)) / 100})"
              ></span>
            </span>
          {:else if binding}
            <div class="hero-spend">
              <span class="hero-amount {band(binding.percent)}"
                ><Figure text="{Math.round(binding.percent)}%" /></span
              >
              <span class="hero-limit"
                ><Figure text="{windowLabel(binding)} used" /></span
              >
            </div>
            <span
              aria-label="{windowLabel(binding)} limit"
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={binding.percent}
              class="hero-track"
              role="progressbar"
            >
              <span
                class="hero-fill {band(binding.percent)}"
                style="transform: scaleX({(Math.max(binding.percent, 1)) / 100})"
              ></span>
            </span>
          {/if}
          <div class="hero-meta">
            {#if planLabel}
              <Badge class="q-tag num">{planLabel}</Badge>
            {/if}
            {#if binding}
              <span class="hero-reset"
                ><Figure
                  text="Resets in {resetsIn(binding.resetsAt, now) || '—'}"
                /></span
              >
            {/if}
            {#if readingAge}
              <span class="hero-age"
                ><Figure text="Checked {readingAge}" /></span
              >
            {/if}
          </div>
        </div>
      </section>

      <section aria-label="Usage at a glance" class="stats">
        {#if binding}
          <StatTile
            label="Resets in"
            value={resetsIn(binding.resetsAt, now) || '—'}
          />
        {/if}
        <StatTile
          label="opencode spend"
          unit="real money"
          value={openCodeTotals ? usd(openCodeTotals.costUsd) : '—'}
        />
        <StatTile
          label="Claude at API prices"
          unit="covered by the plan"
          value={claudeTotals ? `~${usd(claudeTotals.costUsd)}` : '—'}
        />
      </section>
    {/if}

    <!-- JOURNEY.md block 3: Limit windows — per-window reading with age. -->
    <Card.Root class="q-card">
      <Card.Header class="q-head">
        <Card.Title class="q-title">Claude limits</Card.Title>
        <span class="q-sub"
          >Account-scoped — every signed-in machine reads the same numbers</span
        >
        {#if planLabel}
          <Badge class="q-tag num">{planLabel}</Badge>
        {/if}
      </Card.Header>

      <Card.Content class="q-body">
        {#if orderedWindows.length === 0 && !readingError}
          <p class="note">No limit reading yet.</p>
        {:else if orderedWindows.length > 0}
          <Table.Root class="q-table q-limits">
            <Table.Header>
              <Table.Row>
                <Table.Head>Window</Table.Head>
                <Table.Head>Filled</Table.Head>
                <Table.Head class="num">Used</Table.Head>
                <Table.Head class="num">Resets in</Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {#each orderedWindows as w (w.kind + (w.scopeLabel ?? ''))}
                {@const tone = band(w.percent)}
                <Table.Row>
                  <Table.Cell class="num start lead"
                    >{windowLabel(w)}</Table.Cell
                  >
                  <Table.Cell class="wide">
                    <span
                      aria-label="{windowLabel(w)} limit"
                      aria-valuemax={100}
                      aria-valuemin={0}
                      aria-valuenow={w.percent}
                      class="track"
                      role="progressbar"
                    >
                      <span
                        class="fill {tone}"
                        style="transform: scaleX({(Math.max(w.percent, 1)) / 100})"
                      ></span>
                    </span>
                  </Table.Cell>
                  <Table.Cell class="num used {tone}" data-label="Used"
                    ><Figure text="{Math.round(w.percent)}%" /></Table.Cell
                  >
                  <Table.Cell class="num muted resets" data-label="Resets in"
                    ><Figure text={resetsIn(w.resetsAt, now)} /></Table.Cell
                  >
                </Table.Row>
              {/each}
            </Table.Body>
          </Table.Root>
          {#if readingAge}
            <p class="note"><Figure text="Last checked {readingAge}" /></p>
          {/if}
        {/if}

        {#if claudeRows.length > 0}
          <Table.Root class="q-table">
            <Table.Header>
              <Table.Row>
                <Table.Head>Model</Table.Head>
                <Table.Head class="num">Output</Table.Head>
                <Table.Head class="num">At API prices</Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {#each claudeRows as row (row.key)}
                <Table.Row>
                  <Table.Cell class="mono lead">{row.key}</Table.Cell>
                  <Table.Cell class="num" data-label="Output"
                    >{compactNumber(row.output)}</Table.Cell
                  >
                  <Table.Cell class="num" data-label="At API prices"
                    >~{usd(row.costUsd)}</Table.Cell
                  >
                </Table.Row>
              {/each}
            </Table.Body>
          </Table.Root>
        {/if}

        {#if claudeTotals}
          <p class="note">
            <span class="num">~{usd(claudeTotals.costUsd)}</span>
            would cost on the API — your plan already covers it.
          </p>
        {/if}
      </Card.Content>
    </Card.Root>

    <!-- JOURNEY.md block 4: Spend by session — ordered by cost, top drills in. -->
    {#if sessionsBySpend.length > 0}
      <Card.Root class="q-card">
        <Card.Header class="q-head">
          <Card.Title class="q-title">Sessions by spend</Card.Title>
          <span class="q-sub"
            >Live sessions ordered by cost — the top spender links to its
            detail</span
          >
        </Card.Header>
        <Card.Content class="q-body">
          <Table.Root class="q-table">
            <Table.Header>
              <Table.Row>
                <Table.Head></Table.Head>
                <Table.Head>Session</Table.Head>
                <Table.Head>Machine</Table.Head>
                <Table.Head class="num">Context</Table.Head>
                <Table.Head class="num">Cost</Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {#each sessionsBySpend as row, i (row.id)}
                <Table.Row>
                  <Table.Cell class="glyph-cell">
                    <span class="glyph-wrap">
                      <HarnessGlyph harness={row.harness} />
                    </span>
                  </Table.Cell>
                  <Table.Cell class="lead">
                    {#if i === 0}
                      <a
                        class="session-link"
                        href={conversationHref(row.id, whiffle.instanceIndex)}
                        >{row.label}</a
                      >
                    {:else}
                      {row.label}
                    {/if}
                  </Table.Cell>
                  <Table.Cell class="muted" data-label="Machine"
                    >{row.machine}</Table.Cell
                  >
                  <Table.Cell class="num muted" data-label="Context"
                    ><Figure
                      text={row.contextPct === null ? '—' : `${Math.round(row.contextPct)}%`}
                    /></Table.Cell
                  >
                  <Table.Cell class="num" data-label="Cost"
                    ><Figure text={usd(row.cost)} /></Table.Cell
                  >
                </Table.Row>
              {/each}
            </Table.Body>
          </Table.Root>
        </Card.Content>
      </Card.Root>
    {/if}

    <Card.Root class="q-card">
      <Card.Header class="q-head">
        <Card.Title class="q-title">opencode spend</Card.Title>
        <span class="q-sub"
          >Recorded per message by opencode itself — real money, not an
          estimate</span
        >
      </Card.Header>

      <Card.Content class="q-body">
        {#if openCodeTotals}
          <div class="lede">
            <span class="big"
              ><Figure text={usd(openCodeTotals.costUsd)} /></span
            >
            <span class="note">
              {compactNumber(openCodeTotals.input)}
              in · {compactNumber(openCodeTotals.output)} out ·
              {compactNumber(openCodeTotals.cacheRead)}
              cache read
            </span>
          </div>
        {/if}

        {#if openCodeRows.length > 0}
          <Table.Root class="q-table">
            <Table.Header>
              <Table.Row>
                <Table.Head>Model</Table.Head>
                <Table.Head class="num">Output</Table.Head>
                <Table.Head class="num">Cost</Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {#each openCodeRows as row (row.key)}
                <Table.Row>
                  <Table.Cell class="mono lead">{row.key}</Table.Cell>
                  <Table.Cell class="num" data-label="Output"
                    >{compactNumber(row.output)}</Table.Cell
                  >
                  <Table.Cell class="num" data-label="Cost"
                    >{usd(row.costUsd)}</Table.Cell
                  >
                </Table.Row>
              {/each}
            </Table.Body>
          </Table.Root>
        {:else}
          <p class="note">Nothing recorded yet.</p>
        {/if}
      </Card.Content>
    </Card.Root>

    <!-- JOURNEY.md block 5: Unpriced models — promoted to a visible callout. -->
    {#if missing.length > 0}
      <Card.Root class="q-card unpriced">
        <Card.Content class="q-body">
          <p class="unpriced-text">
            No published price for
            <span class="mono">{missing.join(', ')}</span>
            yet — the total cannot account for it. Those models read as $0
            rather than a guess.
          </p>
        </Card.Content>
      </Card.Root>
    {/if}

    <!-- DailyChart brings its own heading and range switcher, so this card is
         all body — a second header here would only repeat it. -->
    <Card.Root class="q-card">
      <Card.Content class="q-body"><DailyChart /></Card.Content>
    </Card.Root>

    {#if dayGroups.length > 0}
      <Card.Root class="q-card">
        <Card.Header class="q-head">
          <Card.Title class="q-title">5-hour windows</Card.Title>
          <span class="q-sub"
            >The windows as they actually fell, last 3 days</span
          >
        </Card.Header>
        <Card.Content class="q-body">
          <Table.Root class="q-table q-windows">
            <Table.Header>
              <Table.Row>
                <Table.Head>Window</Table.Head>
                <Table.Head>Harness</Table.Head>
                <Table.Head class="num">Cost</Table.Head>
                <Table.Head>Pace</Table.Head>
                <Table.Head>Models</Table.Head>
              </Table.Row>
            </Table.Header>
            {#each dayGroups as group (group.day)}
              <Table.Body>
                <Table.Row class="dayrow">
                  <!-- biome-ignore lint/a11y/noHeaderScope: Table.Head renders a real <th>; Biome can't see through the component -->
                  <Table.Head colspan={5} scope="colgroup"
                    >{group.day}</Table.Head
                  >
                </Table.Row>
                {#each group.blocks as block (block.harness + block.id)}
                  <Table.Row>
                    <Table.Cell class="num start lead"
                      >{clock(block.startTime)}
                      – {clock(block.endTime)}</Table.Cell
                    >
                    <Table.Cell class="muted harness" data-label="Harness"
                      >{block.harness}</Table.Cell
                    >
                    <Table.Cell class="num cost" data-label="Cost"
                      ><Figure
                        text="{block.harness === 'Claude' ? '~' : ''}{usd(block.costUsd)}"
                      /></Table.Cell
                    >
                    <Table.Cell class="pace num" data-label="Pace">
                      {#if block.isActive && block.burnRate}
                        <Figure
                          text={paceOf(block, block.burnRate.costPerHour)}
                        />
                      {/if}
                    </Table.Cell>
                    <Table.Cell class="mono muted models" data-label="Models"
                      >{block.models.join(' · ')}</Table.Cell
                    >
                  </Table.Row>
                {/each}
              </Table.Body>
            {/each}
          </Table.Root>
        </Card.Content>
      </Card.Root>
    {/if}

    <!-- BreakdownTable owns its own heading, harness switch and tabs. -->
    <Card.Root class="q-card">
      <Card.Content class="q-body"><BreakdownTable /></Card.Content>
    </Card.Root>
  </div>
</div>

<style>
  .page {
    flex: 1 1 auto;
    overflow-y: auto;
    padding: var(--space-6);
    min-width: 0;
  }
  .col {
    margin: 0 auto;
    max-width: 1100px;
    display: flex;
    flex-direction: column;
    gap: var(--space-8);
  }
  .page-error {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
  }
  .sub {
    max-width: 68ch;
    font: var(--type-body);
    color: var(--ink-muted);
  }

  /* ---- Hero: spend against threshold ---- */
  .hero {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  .hero-main {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    background: var(--surface-raised);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-tile);
    padding: var(--space-6);
  }
  .hero-spend {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    flex-wrap: wrap;
  }
  .hero-amount {
    font: var(--type-kpi);
  }
  .hero-amount.ok {
    color: var(--data-ok);
  }
  .hero-amount.warn {
    color: var(--data-warn);
  }
  .hero-amount.bad {
    color: var(--data-bad);
  }
  .hero-limit {
    font: var(--type-title);
    color: var(--ink-muted);
  }
  .hero-track {
    display: block;
    position: relative;
    height: 12px;
    border-radius: var(--radius-pill);
    background: var(--surface-recess);
  }
  .hero-fill {
    position: absolute;
    inset: 0 auto 0 0;
    border-radius: var(--radius-pill);
    width: 100%;
    transform-origin: left;
    @media (prefers-reduced-motion: no-preference) {
      transition: transform var(--dur-panel) var(--ease-out);
    }
  }
  .hero-fill.ok {
    background: var(--data-ok);
  }
  .hero-fill.warn {
    background: var(--data-warn);
  }
  .hero-fill.bad {
    background: var(--data-bad);
  }
  .hero-meta {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    flex-wrap: wrap;
  }
  .hero-reset,
  .hero-age {
    font: var(--type-meta);
    color: var(--ink-muted);
  }

  .stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    gap: var(--space-4);
  }
  .note {
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .mono {
    font-family: var(--font-mono);
    word-break: break-word;
  }
  .lede {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .lede .big {
    font: var(--type-kpi);
    color: var(--ink-strong);
  }

  /* ---- shadcn primitives, dressed in Quiet Ledger tokens ------------------
     The classes below live on child-component elements, so they are addressed
     globally. Every value resolves through a DESIGN.md token; nothing here is a
     shadcn default (`ring-1`, `bg-card`, the 8/12/16 spacing
     ladder), because an unmodified shadcn surface is a High-severity tell. */
  :global {
    /* Card → the raised panel (was whiffle Panel). */
    .q-card {
      background: var(--surface-raised);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-tile);
      padding: var(--space-5);
      gap: var(--space-4);
      overflow: visible;
      /* neutralise the stock ring/border shadcn ships on the card */
      --tw-ring-shadow: 0 0 transparent;
    }
    .q-head {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: var(--space-1) var(--space-3);
      padding: 0;
    }
    .q-title {
      line-height: var(--leading-tight);
      color: var(--ink-strong);
    }
    .q-sub {
      font: var(--type-meta);
      color: var(--ink-muted);
    }
    /* Badge → the plan tag. A quiet neutral chip (idle carries no status hue),
       not the stock solid-primary badge fill. */
    .q-tag {
      margin-left: auto;
      height: auto;
      border-radius: var(--radius-pill);
      background: var(--surface-recess);
      border: 1px solid var(--border-hairline);
      color: var(--ink-muted);
      padding: 2px var(--space-3);
      font: var(--type-label);
    }
    .q-body {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      padding: 0;
    }

    /* Table → hairline dividers, uppercase micro-label header, tabular numerics.
       Table.Root ships its own overflow-x-auto container, so the whole card
       never scrolls sideways — the table does, inside the panel. */
    .q-table {
      width: 100%;
      border-collapse: collapse;
      font-variant-numeric: normal;
    }
    /* the primitives put dividers on the <tr>; ours live on the cells, so the
       row borders are zeroed to keep a single hairline (and its exact token). */
    .q-table tr {
      border: 0;
    }
    .q-table thead th {
      height: auto;
      font-size: var(--text-label);
      font-weight: var(--weight-strong);
      text-transform: uppercase;
      letter-spacing: var(--track-caps);
      color: var(--ink-muted);
      text-align: left;
      padding: var(--space-2) var(--space-3);
      border-bottom: 1px solid var(--border-hairline);
      white-space: nowrap;
    }
    .q-table thead th.num {
      text-align: right;
    }
    /* Under a laptop's width the heads wrap and the cells share the room,
       so no table outgrows its card. */
    @media (max-width: 1023px) {
      .q-table thead th {
        white-space: normal;
      }
    }
    .q-table td {
      font-size: var(--text-body);
      font-weight: var(--weight-body);
      color: var(--ink-strong);
      padding: var(--space-2) var(--space-3);
      border-bottom: 1px solid var(--border-hairline);
      vertical-align: middle;
      white-space: normal;
    }
    .q-table tbody:last-child tr:last-child td {
      border-bottom: 0;
    }
    .q-table td.num {
      text-align: right;
      white-space: nowrap;
      color: var(--ink-strong);
    }
    .q-table td.num.start {
      text-align: start;
    }
    .q-table td.muted {
      color: var(--ink-muted);
    }
    .q-table td.mono {
      font-family: var(--font-mono);
      font-size: var(--text-label);
      word-break: break-word;
    }
    .q-table td.wide {
      width: 40%;
      min-width: 90px;
    }
    .q-table td.pace {
      color: var(--status-attn-ink);
    }
    .q-table tr.dayrow th {
      color: var(--ink-muted);
      text-transform: none;
      letter-spacing: 0;
      font-size: var(--text-label);
      font-weight: var(--weight-strong);
      border-bottom: 1px solid var(--border-hairline);
    }
    .q-table td.ok {
      color: var(--data-ok);
    }
    .q-table td.warn {
      color: var(--data-warn);
    }
    .q-table td.bad {
      color: var(--data-bad);
    }

    /* the inline progress bar (was .track / .fill). */
    .q-table .track {
      display: block;
      position: relative;
      height: 8px;
      border-radius: var(--radius-pill);
      background: var(--surface-recess);
    }
    .q-table .fill {
      position: absolute;
      inset: 0 auto 0 0;
      border-radius: var(--radius-pill);
      width: 100%;
      transform-origin: left;
      @media (prefers-reduced-motion: no-preference) {
        transition: transform var(--dur-panel) var(--ease-out);
      }
    }
    .q-table .fill.ok {
      background: var(--data-ok);
    }
    .q-table .fill.warn {
      background: var(--data-warn);
    }
    .q-table .fill.bad {
      background: var(--data-bad);
    }

    /* Sessions-by-spend table additions. */
    .q-table td.glyph-cell {
      width: 24px;
      padding-right: 0;
      border-bottom: 1px solid var(--border-hairline);
    }
    .q-table .glyph-wrap {
      display: block;
      width: 16px;
      height: 16px;
      color: var(--ink-muted);
    }
    .q-table .session-link {
      color: var(--ink-strong);
      text-decoration: none;
    }
    .q-table .session-link:hover {
      text-decoration: underline;
    }

    /* A phone has no room for columns: each row is two lines, the name
       as a label, then every figure as meta under its column's name. The
       header row stays in the table for assistive tech, off screen. */
    @media (max-width: 639px) {
      .q-table {
        display: block;
        min-width: 0;
      }
      .q-table thead {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
      }
      .q-table tbody {
        display: block;
      }
      /* biome-ignore lint/style/noDescendingSpecificity: the phone layout sets display, gap and the meta role; the more specific base rules above set other properties, so their order does not decide anything. */
      .q-table tbody tr {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--space-1) var(--space-3);
        padding-block: var(--space-2);
        border-bottom: 1px solid var(--border-hairline);
      }
      .q-table tbody:last-child tr:last-child {
        border-bottom: 0;
      }
      /* biome-ignore lint/style/noDescendingSpecificity: the phone layout sets display, gap and the meta role; the more specific base rules above set other properties, so their order does not decide anything. */
      .q-table tbody td,
      .q-table tr.dayrow th {
        display: block;
        height: auto;
        padding: 0;
        border-bottom: 0;
      }
      /* biome-ignore lint/style/noDescendingSpecificity: the phone layout sets display, gap and the meta role; the more specific base rules above set other properties, so their order does not decide anything. */
      .q-table tbody td {
        font: var(--type-meta);
        white-space: nowrap;
      }
      .q-table td.lead {
        flex: 1 0 100%;
        font: var(--type-label);
        white-space: normal;
      }
      .q-table td.mono.lead {
        font-family: var(--font-mono);
      }
      .q-table td.glyph-cell {
        width: auto;
        padding: 0;
        border-bottom: 0;
      }
      .q-table td.glyph-cell + td.lead {
        flex-basis: calc(100% - 16px - var(--space-3));
      }
      .q-table td.wide {
        flex: 1 1 60px;
        width: auto;
        min-width: 60px;
      }
      .q-table td.mono:not(.lead) {
        font: var(--type-meta);
        font-family: var(--font-mono);
        white-space: normal;
      }
      .q-table td:empty {
        display: none;
      }
      .q-table td[data-label]::before {
        content: attr(data-label) " ";
        color: var(--ink-muted);
      }
      /* A limit is two lines: the window with how full it is, then its
         bar with when it resets. */
      /* biome-ignore lint/style/noDescendingSpecificity: the phone layout sets display and placement; the base rules above set other properties, so their order does not decide anything. */
      .q-limits tbody tr {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
      }
      .q-limits td.lead {
        grid-area: 1 / 1;
      }
      .q-limits td.used {
        grid-area: 1 / 2;
        font: var(--type-label);
      }
      .q-limits td.wide {
        grid-area: 2 / 1;
        min-width: 0;
      }
      .q-limits td.resets {
        grid-area: 2 / 2;
      }
      /* A window is two lines: when it ran with what it cost, then the
         harness and the models as one line of meta, the models cut short
         to fit. The live window's pace and projection take that line
         whole, and its models go under them. */
      .q-windows tbody tr:not(.dayrow) {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto;
        align-items: baseline;
      }
      .q-windows td.lead {
        grid-area: 1 / 1 / 2 / 3;
      }
      .q-windows td.cost {
        grid-area: 1 / 3;
        font: var(--type-label);
      }
      .q-windows td.harness {
        grid-area: 2 / 1;
      }
      .q-windows td.pace {
        grid-area: 2 / 2 / 3 / 4;
        text-align: start;
      }
      .q-windows td.models {
        grid-area: 2 / 2 / 3 / 4;
      }
      .q-windows td.pace:not(:empty) + td.models {
        grid-area: 3 / 1 / 4 / 4;
      }
      .q-table.q-windows td.models {
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }
      .q-windows td[data-label="Models"]::before,
      .q-windows td[data-label="Harness"]::before {
        content: none;
      }
    }

    /* Unpriced models callout. */
    .q-card.unpriced {
      border-left: 3px solid var(--data-warn);
    }
    .unpriced-text {
      font: var(--type-body);
      color: var(--ink-muted);
    }
  }
</style>
